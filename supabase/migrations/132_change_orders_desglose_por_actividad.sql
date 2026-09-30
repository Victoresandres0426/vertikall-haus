-- ============================================================
-- 132 — Change Orders: desglose interno por actividad/división
--        al aprobarse (en vez de una sola línea de "Subcontrato")
-- ============================================================
-- Hasta ahora, al aprobar un CO, decidir_change_order() creaba UNA
-- sola actividad + UNA sola partida tipo 'subcontrato' con el monto
-- global, bajo una división nueva "CO — Change Orders". El dueño
-- reportó que esto se ve mal en el Presupuesto: quiere que el CO se
-- reparta como actividades reales dentro de la MISMA división donde
-- ya están las actividades similares, cada una con su costo de
-- material y de mano de obra por separado — igual que cualquier otra
-- actividad del proyecto.
--
-- Importante (confirmado con el usuario): esto es un desglose interno
-- -- el cliente en su portal sigue viendo solo el monto global del CO
-- (portal_ver_change_orders no cambia). El desglose por actividad es
-- para el presupuesto y el cronograma internos únicamente.
--
-- También se pidió:
--   1. Las actividades nuevas entran al cronograma con fecha de inicio
--      = mañana (no "hoy").
--   2. Las partidas indirectas del presupuesto (Supervisión, Seguro,
--      Contingencia, etc.) suben proporcionalmente para reflejar el
--      trabajo extra, con el mismo criterio que ya se usa al facturar
--      (prorrateo sobre el costo directo).
--
-- Se mantiene compatibilidad hacia atrás: si un CO no tiene renglones
-- cargados (creado antes de esta migración), decidir_change_order()
-- cae en el comportamiento anterior (una sola línea de subcontrato).
-- ============================================================

-- ── Renglones internos de un CO: uno o varios, cada uno con su
-- división/actividad destino y su costo de material + mano de obra.
-- Nunca se expone al cliente -- no hay RPC de portal que los lea.
CREATE TABLE IF NOT EXISTS change_order_renglones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  proceso_id UUID NOT NULL REFERENCES procesos(id),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  costo_material DECIMAL(15,2) NOT NULL DEFAULT 0,
  costo_mano_obra DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Decimal, no entero: cantidad_objetivo/rendimiento de cuadrilla casi
  -- nunca da un número redondo de días (mismo motivo que
  -- actividades.duracion_plan_dias, ver migración 073).
  duracion_dias DECIMAL(6,2) NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE change_order_renglones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gestion_ve_co_renglones" ON change_order_renglones;
CREATE POLICY "gestion_ve_co_renglones" ON change_order_renglones
  FOR SELECT USING (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "gestion_crea_co_renglones" ON change_order_renglones;
CREATE POLICY "gestion_crea_co_renglones" ON change_order_renglones
  FOR INSERT WITH CHECK (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "gestion_actualiza_co_renglones" ON change_order_renglones;
CREATE POLICY "gestion_actualiza_co_renglones" ON change_order_renglones
  FOR UPDATE USING (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "gestion_borra_co_renglones" ON change_order_renglones;
CREATE POLICY "gestion_borra_co_renglones" ON change_order_renglones
  FOR DELETE USING (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── Trazabilidad: qué actividad/partidas se generaron por cada
-- renglón al aprobarse (reemplaza la trazabilidad 1-a-1 que antes
-- vivía en change_orders.actividad_creada_id).
CREATE TABLE IF NOT EXISTS change_order_actividades_creadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  renglon_id UUID REFERENCES change_order_renglones(id),
  actividad_id UUID NOT NULL REFERENCES actividades(id),
  partida_material_id UUID REFERENCES partidas_presupuesto(id),
  partida_mano_obra_id UUID REFERENCES partidas_presupuesto(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE change_order_actividades_creadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestion_ve_co_actividades_creadas" ON change_order_actividades_creadas;
CREATE POLICY "gestion_ve_co_actividades_creadas" ON change_order_actividades_creadas
  FOR SELECT USING (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS indirectos_incrementados DECIMAL(15,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN change_orders.indirectos_incrementados IS
  'Suma de cuánto subieron las partidas indirectas del presupuesto al aprobarse este CO (prorrateo sobre su costo directo). 0 si no aplicó (sin presupuesto baseline, o CO legacy sin renglones).';

-- ── Reescritura de decidir_change_order(): si el CO tiene renglones,
-- crea una actividad real por renglón (en su división correspondiente,
-- con costo de material y mano de obra por separado, inicio = mañana),
-- más sus partidas de presupuesto, y prorratea los indirectos. Si no
-- tiene renglones (CO legacy), cae en el comportamiento anterior.
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
    -- Base para prorratear indirectos: todo lo que NO es indirecto,
    -- medido antes de agregar este CO.
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
        1, 'CO', v_renglon.costo_material, v_renglon.costo_mano_obra, 'no_iniciada'
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

    -- Prorratea los indirectos existentes en proporción al costo
    -- directo que aporta este CO -- mismo criterio que ya se usa al
    -- facturar (generar_facturas_semanales, migración 084).
    IF v_total_directo_previo > 0 THEN
      v_factor := v_co.costo_directo / v_total_directo_previo;

      -- El incremento se calcula ANTES del UPDATE -- usar los montos ya
      -- actualizados daría un incremento-sobre-incremento, no el real.
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
