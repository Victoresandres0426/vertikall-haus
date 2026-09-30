-- ============================================================
-- 127 — Flujo completo de Change Orders: elaborar, validar,
--        modificar, enviar, aprobación/rechazo del cliente
-- ============================================================
-- Hasta ahora un Change Order solo se podía CREAR (quedaba en
-- 'detectado' para siempre) -- no había forma de editarlo, mandarlo al
-- cliente, ni que el cliente lo aprobara o rechazara. El dueño pidió el
-- mismo proceso que ya existe para Facturas: elaborar / validar /
-- modificar / enviar / aprobación o rechazo del cliente, y que al
-- aprobarse se registre automáticamente en el presupuesto Y se agregue
-- como actividad al cronograma.

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS enviado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decidido_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT,
  ADD COLUMN IF NOT EXISTS partida_presupuesto_id UUID REFERENCES partidas_presupuesto(id),
  ADD COLUMN IF NOT EXISTS actividad_creada_id UUID REFERENCES actividades(id);

COMMENT ON COLUMN change_orders.partida_presupuesto_id IS
  'Partida de presupuesto creada automáticamente cuando el cliente aprueba este CO (ver decidir_change_order). NULL mientras no esté aprobado.';
COMMENT ON COLUMN change_orders.actividad_creada_id IS
  'Actividad de cronograma creada automáticamente cuando el cliente aprueba este CO (ver decidir_change_order). NULL mientras no esté aprobado.';

-- ── Portal: el cliente ve solo los CO ya enviados o ya decididos --
-- nunca los que siguen en 'detectado' o 'en_estimacion' (borrador
-- interno todavía no revisado/enviado).
CREATE OR REPLACE FUNCTION portal_ver_change_orders()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() != 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;
  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', co.id, 'numero', co.numero, 'titulo', co.titulo, 'descripcion', co.descripcion,
      'solicitado_por', co.solicitado_por, 'estado', co.estado,
      'costo_directo', co.costo_directo, 'margen_pct_aplicado', co.margen_pct_aplicado,
      'costo_margen', co.costo_margen, 'impacto_costo', co.impacto_costo, 'impacto_dias', co.impacto_dias,
      'motivo_rechazo', co.motivo_rechazo,
      'enviado_at', co.enviado_at, 'decidido_at', co.decidido_at, 'created_at', co.created_at
    ) ORDER BY co.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM change_orders co
  WHERE co.proyecto_id = v_proyecto_id
    AND co.estado IN ('enviado_cliente', 'aprobado', 'rechazado', 'facturado', 'cobrado');

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION portal_ver_change_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_ver_change_orders() TO authenticated;

-- ── Portal: el cliente aprueba o rechaza un CO que ya le fue enviado.
-- Si aprueba: crea la partida de presupuesto (el trigger existente
-- recalcular_total_presupuesto ya mantiene presupuestos.total
-- sincronizado) y la actividad correspondiente en el cronograma, las
-- dos encadenadas al CO para trazabilidad. Solo puede decidirse un CO
-- que esté en 'enviado_cliente' -- una vez decidido no se puede volver
-- a llamar (el UPDATE con WHERE estado = 'enviado_cliente' + el SELECT
-- ... FOR UPDATE de arriba evitan una doble-aprobación por doble clic).
CREATE OR REPLACE FUNCTION decidir_change_order(p_id UUID, p_aprobado BOOLEAN, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_co RECORD;
  v_presupuesto_id UUID;
  v_proceso_id UUID;
  v_partida_id UUID;
  v_actividad_id UUID;
  v_duracion INTEGER;
BEGIN
  IF get_rol_usuario() != 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;
  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT * INTO v_co FROM change_orders
  WHERE id = p_id AND proyecto_id = v_proyecto_id AND estado = 'enviado_cliente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_order_no_disponible';
  END IF;

  IF NOT p_aprobado THEN
    UPDATE change_orders
    SET estado = 'rechazado', decidido_at = NOW(), motivo_rechazo = p_motivo
    WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'estado', 'rechazado');
  END IF;

  SELECT id INTO v_presupuesto_id FROM presupuestos
  WHERE proyecto_id = v_proyecto_id AND es_baseline_actual = true
  LIMIT 1;
  IF v_presupuesto_id IS NULL THEN
    RAISE EXCEPTION 'sin_presupuesto_baseline';
  END IF;

  -- Proceso/división "Change Orders" del proyecto -- se crea una sola
  -- vez, los siguientes CO aprobados reutilizan la misma división.
  SELECT id INTO v_proceso_id FROM procesos
  WHERE proyecto_id = v_proyecto_id AND codigo = 'CO'
  LIMIT 1;
  IF v_proceso_id IS NULL THEN
    INSERT INTO procesos (proyecto_id, codigo, nombre, orden)
    VALUES (v_proyecto_id, 'CO', 'Change Orders', 999)
    RETURNING id INTO v_proceso_id;
  END IF;

  v_duracion := GREATEST(COALESCE(v_co.impacto_dias, 0), 1);

  INSERT INTO partidas_presupuesto (
    presupuesto_id, proceso_id, codigo, descripcion, tipo_recurso,
    monto_total, monto_presupuestado
  ) VALUES (
    v_presupuesto_id, v_proceso_id, v_co.numero, v_co.titulo, 'subcontrato',
    v_co.impacto_costo, v_co.impacto_costo
  ) RETURNING id INTO v_partida_id;

  -- El impacto total (directo + indirectos/contingencia/margen) se
  -- registra completo bajo costo_mano_obra -- actividades no tiene un
  -- campo de "subcontrato/CO" separado, y desglosarlo entre
  -- material/mano de obra sería inventar una proporción que no
  -- conocemos.
  INSERT INTO actividades (
    proceso_id, proyecto_id, codigo, nombre, descripcion,
    fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
    cantidad_objetivo, unidad, costo_material, costo_mano_obra, estado
  ) VALUES (
    v_proceso_id, v_proyecto_id, COALESCE(v_co.numero, 'CO-' || substr(v_co.id::text, 1, 8)), v_co.titulo, v_co.descripcion,
    CURRENT_DATE, CURRENT_DATE + v_duracion, v_duracion,
    1, 'CO', 0, v_co.impacto_costo, 'no_iniciada'
  ) RETURNING id INTO v_actividad_id;

  UPDATE change_orders
  SET estado = 'aprobado', aprobado_at = NOW(), decidido_at = NOW(),
      partida_presupuesto_id = v_partida_id, actividad_creada_id = v_actividad_id
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'estado', 'aprobado', 'partida_id', v_partida_id, 'actividad_id', v_actividad_id);
END;
$$;
REVOKE ALL ON FUNCTION decidir_change_order(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decidir_change_order(UUID, BOOLEAN, TEXT) TO authenticated;
