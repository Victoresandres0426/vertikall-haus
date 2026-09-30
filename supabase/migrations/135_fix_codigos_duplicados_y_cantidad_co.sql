-- ============================================================
-- 135 — Fix: códigos de actividad duplicados + cantidad/unidad
-- reales en actividades creadas por Change Order
-- ============================================================
-- Dos problemas reportados sobre las actividades que crea un CO:
--
-- 1) DUPLICADOS: el backfill de la migración 133 le puso a las 8
--    actividades del CO "Refuerzo en paredes" códigos '04.01'..'04.08'
--    -- el mismo patrón de códigos que ya usaban las actividades
--    ORIGINALES de esa misma división ("— living"). Resultado: dos
--    actividades distintas mostrando el mismo código (ej. "04.01"
--    aparece tanto en "— living" como en "— closet" del CO).
--    decidir_change_order() (migración 132, el flujo normal hacia
--    adelante) no tiene este bug -- ahí el código ya usa
--    "<numero del CO>.<orden>" (ej. "Radnor 001.1"), que no choca con
--    los códigos de división. Este fix solo corrige el backfill
--    puntual de la migración 133, renombrando esas 8 actividades al
--    mismo esquema que ya usa el flujo normal.
--
-- 2) CANTIDADES: tanto el flujo normal (132) como el backfill (133)
--    guardaban cantidad_objetivo = 1 / unidad = 'CO' a secas -- un
--    valor de relleno, no la cantidad real de obra (SF, unidades,
--    etc.) que si tienen las demás actividades del proyecto. Se agrega
--    cantidad_objetivo/unidad a change_order_renglones (para que el
--    formulario de Change Orders las capture desde ahora) y
--    decidir_change_order() ya las usa en vez del relleno. Las 8
--    actividades ya creadas del CO "Refuerzo en paredes" quedan con
--    cantidad_objetivo/unidad = NULL hasta que el usuario dé los
--    valores reales -- no se inventan.
-- ============================================================

-- 1) Renombrar los 8 códigos duplicados del backfill 133, usando el
-- mismo patrón "<numero CO>.<orden del renglón>" que ya usa el flujo
-- normal, vía la tabla de trazabilidad change_order_actividades_creadas.
UPDATE actividades act
SET codigo = co.numero || '.' || r.orden
FROM change_order_actividades_creadas caco
JOIN change_order_renglones r ON r.id = caco.renglon_id
JOIN change_orders co ON co.id = caco.change_order_id
WHERE act.id = caco.actividad_id
  AND act.codigo ~ '^[0-9]+\.[0-9]+$'; -- solo toca códigos con el patrón viejo "04.01" (numérico.numérico); si ya se corrigió a mano no se vuelve a tocar

-- 2) cantidad_objetivo/unidad reales en el desglose interno del CO.
ALTER TABLE change_order_renglones
  ADD COLUMN IF NOT EXISTS cantidad_objetivo DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS unidad TEXT;
COMMENT ON COLUMN change_order_renglones.cantidad_objetivo IS
  'Cantidad real de obra de este renglón (SF, unidades, ml, etc.) -- opcional; si viene NULL, decidir_change_order() usa 1/CO como antes.';
COMMENT ON COLUMN change_order_renglones.unidad IS
  'Unidad de cantidad_objetivo (SF, unidad, ml...). Opcional.';

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
  v_duracion DECIMAL(6,2);
  v_renglon RECORD;
  v_fecha_inicio DATE;
  v_partida_mat_id UUID;
  v_partida_mo_id UUID;
  v_total_directo_previo DECIMAL(15,2);
  v_factor DECIMAL(15,6);
  v_incremento_total DECIMAL(15,2) := 0;
  v_tiene_renglones BOOLEAN;
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

  v_fecha_inicio := CURRENT_DATE + 1; -- "mañana", pedido explícito

  SELECT EXISTS(SELECT 1 FROM change_order_renglones WHERE change_order_id = p_id) INTO v_tiene_renglones;

  IF v_tiene_renglones THEN
    SELECT COALESCE(SUM(monto_presupuestado), 0) INTO v_total_directo_previo
    FROM partidas_presupuesto
    WHERE presupuesto_id = v_presupuesto_id AND tipo_recurso <> 'indirecto';

    FOR v_renglon IN
      SELECT * FROM change_order_renglones WHERE change_order_id = p_id ORDER BY orden
    LOOP
      v_duracion := GREATEST(v_renglon.duracion_dias, 1);

      INSERT INTO actividades (
        proceso_id, proyecto_id, codigo, nombre, descripcion,
        fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
        cantidad_objetivo, unidad, costo_material, costo_mano_obra, estado
      ) VALUES (
        v_renglon.proceso_id, v_proyecto_id,
        COALESCE(v_co.numero, 'CO-' || substr(v_co.id::text, 1, 8)) || '.' || v_renglon.orden,
        v_renglon.nombre, COALESCE(v_renglon.descripcion, v_co.descripcion),
        v_fecha_inicio, v_fecha_inicio + CEIL(v_duracion)::INT - 1, v_duracion,
        COALESCE(v_renglon.cantidad_objetivo, 1), COALESCE(v_renglon.unidad, 'CO'),
        v_renglon.costo_material, v_renglon.costo_mano_obra, 'no_iniciada'
      ) RETURNING id INTO v_actividad_id;

      v_partida_mat_id := NULL;
      v_partida_mo_id := NULL;

      IF v_renglon.costo_material > 0 THEN
        INSERT INTO partidas_presupuesto (
          presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso,
          monto_total, monto_presupuestado
        ) VALUES (
          v_presupuesto_id, v_renglon.proceso_id, v_actividad_id, v_co.numero,
          v_renglon.nombre || ' (material)', 'material',
          v_renglon.costo_material, v_renglon.costo_material
        ) RETURNING id INTO v_partida_mat_id;
      END IF;

      IF v_renglon.costo_mano_obra > 0 THEN
        INSERT INTO partidas_presupuesto (
          presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso,
          monto_total, monto_presupuestado
        ) VALUES (
          v_presupuesto_id, v_renglon.proceso_id, v_actividad_id, v_co.numero,
          v_renglon.nombre || ' (mano de obra)', 'mano_obra',
          v_renglon.costo_mano_obra, v_renglon.costo_mano_obra
        ) RETURNING id INTO v_partida_mo_id;
      END IF;

      INSERT INTO change_order_actividades_creadas (
        change_order_id, renglon_id, actividad_id, partida_material_id, partida_mano_obra_id
      ) VALUES (p_id, v_renglon.id, v_actividad_id, v_partida_mat_id, v_partida_mo_id);
    END LOOP;

    IF v_total_directo_previo > 0 THEN
      v_factor := v_co.costo_directo / v_total_directo_previo;

      SELECT COALESCE(SUM(monto_presupuestado * v_factor), 0) INTO v_incremento_total
      FROM partidas_presupuesto
      WHERE presupuesto_id = v_presupuesto_id
        AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;

      UPDATE partidas_presupuesto
      SET monto_presupuestado = monto_presupuestado + (monto_presupuestado * v_factor),
          monto_total = monto_total + (monto_total * v_factor)
      WHERE presupuesto_id = v_presupuesto_id
        AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;
    END IF;

    UPDATE change_orders
    SET estado = 'aprobado', aprobado_at = NOW(), decidido_at = NOW(),
        indirectos_incrementados = v_incremento_total
    WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'estado', 'aprobado', 'renglones', true);
  END IF;

  -- ── Comportamiento anterior (CO legacy sin renglones cargados) ──
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

  INSERT INTO actividades (
    proceso_id, proyecto_id, codigo, nombre, descripcion,
    fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
    cantidad_objetivo, unidad, costo_material, costo_mano_obra, estado
  ) VALUES (
    v_proceso_id, v_proyecto_id, COALESCE(v_co.numero, 'CO-' || substr(v_co.id::text, 1, 8)), v_co.titulo, v_co.descripcion,
    v_fecha_inicio, v_fecha_inicio + CEIL(v_duracion)::INT - 1, v_duracion,
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
