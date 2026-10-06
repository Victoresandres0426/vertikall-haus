-- 141: (margen = % sobre el precio total: total = directo / (1 - %))
-- 141: Corregir en sitio un Change Order YA aprobado (con avance/facturas).
-- Actualiza renglones, actividades y partidas existentes conservando
-- avance y facturas emitidas (las facturas ya emitidas no cambian; el
-- ajuste aplica al avance futuro). Renglones nuevos se crean como en la
-- aprobación; renglones quitados solo si su actividad no tiene avance.
-- Re-prorratea los indirectos con el nuevo costo directo.
-- p_renglones: [{id?, proceso_id, nombre, descripcion, costo_material,
--   costo_mano_obra, duracion_dias, cantidad_objetivo, unidad}, ...]
CREATE OR REPLACE FUNCTION corregir_change_order_aprobado(
  p_id UUID, p_titulo TEXT, p_descripcion TEXT, p_numero TEXT,
  p_solicitado_por TEXT, p_impacto_dias INT, p_renglones JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_co RECORD;
  v_presupuesto_id UUID;
  v_margen DECIMAL(8,2);
  v_r JSONB;
  v_orden INT := 0;
  v_renglon_id UUID;
  v_cre RECORD;
  v_act_id UUID;
  v_mat DECIMAL(15,2);
  v_mo DECIMAL(15,2);
  v_dur DECIMAL(6,2);
  v_nuevo_directo DECIMAL(15,2) := 0;
  v_directo_actual DECIMAL(15,2);
  v_directo_co_viejo DECIMAL(15,2);
  v_previo DECIMAL(15,2);
  v_f_old DECIMAL(15,6);
  v_f_new DECIMAL(15,6);
  v_incremento DECIMAL(15,2) := 0;
  v_ids UUID[] := '{}';
  v_nuevo_costo_margen DECIMAL(15,2);
BEGIN
  IF get_rol_usuario() NOT IN ('project_manager', 'dueno', 'superadmin', 'administrador') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  SELECT * INTO v_co FROM change_orders
  WHERE id = p_id
    AND proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    AND estado IN ('aprobado', 'facturado')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_order_no_corregible'; END IF;

  SELECT id INTO v_presupuesto_id FROM presupuestos
  WHERE proyecto_id = v_co.proyecto_id AND es_baseline_actual = true LIMIT 1;
  IF v_presupuesto_id IS NULL THEN RAISE EXCEPTION 'sin_presupuesto_baseline'; END IF;

  -- Directo del CO antes del cambio y directo total actual (para revertir prorrateo)
  SELECT COALESCE(SUM(monto_presupuestado), 0) INTO v_directo_actual
  FROM partidas_presupuesto WHERE presupuesto_id = v_presupuesto_id AND tipo_recurso <> 'indirecto';
  v_directo_co_viejo := v_co.costo_directo;
  v_previo := v_directo_actual - v_directo_co_viejo;

  -- 1) Renglones del JSON: actualizar existentes / crear nuevos
  FOR v_r IN SELECT * FROM jsonb_array_elements(p_renglones) LOOP
    v_orden := v_orden + 1;
    v_mat := COALESCE((v_r->>'costo_material')::DECIMAL, 0);
    v_mo  := COALESCE((v_r->>'costo_mano_obra')::DECIMAL, 0);
    v_dur := GREATEST(COALESCE((v_r->>'duracion_dias')::DECIMAL, 1), 1);
    v_nuevo_directo := v_nuevo_directo + v_mat + v_mo;
    v_renglon_id := NULLIF(v_r->>'id', '')::UUID;

    IF v_renglon_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM change_order_renglones WHERE id = v_renglon_id AND change_order_id = p_id
    ) THEN
      v_ids := v_ids || v_renglon_id;
      UPDATE change_order_renglones SET
        nombre = v_r->>'nombre', descripcion = NULLIF(v_r->>'descripcion', ''),
        costo_material = v_mat, costo_mano_obra = v_mo,
        duracion_dias = COALESCE((v_r->>'duracion_dias')::DECIMAL, 1),
        cantidad_objetivo = NULLIF(v_r->>'cantidad_objetivo', '')::DECIMAL,
        unidad = NULLIF(v_r->>'unidad', ''), orden = v_orden
      WHERE id = v_renglon_id;

      SELECT * INTO v_cre FROM change_order_actividades_creadas
      WHERE change_order_id = p_id AND renglon_id = v_renglon_id;
      IF FOUND THEN
        UPDATE actividades SET
          nombre = v_r->>'nombre',
          descripcion = COALESCE(NULLIF(v_r->>'descripcion', ''), v_co.descripcion),
          costo_material = v_mat, costo_mano_obra = v_mo,
          cantidad_objetivo = COALESCE(NULLIF(v_r->>'cantidad_objetivo', '')::DECIMAL, 1),
          unidad = COALESCE(NULLIF(v_r->>'unidad', ''), 'CO'),
          duracion_plan_dias = v_dur,
          fecha_fin_plan = fecha_inicio_plan + CEIL(v_dur)::INT - 1
        WHERE id = v_cre.actividad_id;

        -- partida material
        IF v_cre.partida_material_id IS NOT NULL THEN
          UPDATE partidas_presupuesto SET monto_total = v_mat, monto_presupuestado = v_mat
          WHERE id = v_cre.partida_material_id;
        ELSIF v_mat > 0 THEN
          INSERT INTO partidas_presupuesto (presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado)
          VALUES (v_presupuesto_id, (v_r->>'proceso_id')::UUID, v_cre.actividad_id, v_co.numero, (v_r->>'nombre') || ' (material)', 'material', v_mat, v_mat)
          RETURNING id INTO v_cre.partida_material_id;
          UPDATE change_order_actividades_creadas SET partida_material_id = v_cre.partida_material_id WHERE id = v_cre.id;
        END IF;
        -- partida mano de obra
        IF v_cre.partida_mano_obra_id IS NOT NULL THEN
          UPDATE partidas_presupuesto SET monto_total = v_mo, monto_presupuestado = v_mo
          WHERE id = v_cre.partida_mano_obra_id;
        ELSIF v_mo > 0 THEN
          INSERT INTO partidas_presupuesto (presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado)
          VALUES (v_presupuesto_id, (v_r->>'proceso_id')::UUID, v_cre.actividad_id, v_co.numero, (v_r->>'nombre') || ' (mano de obra)', 'mano_obra', v_mo, v_mo)
          RETURNING id INTO v_cre.partida_mano_obra_id;
          UPDATE change_order_actividades_creadas SET partida_mano_obra_id = v_cre.partida_mano_obra_id WHERE id = v_cre.id;
        END IF;
      END IF;
    ELSE
      -- renglón nuevo: crear renglón + actividad + partidas
      INSERT INTO change_order_renglones (change_order_id, proceso_id, nombre, descripcion, costo_material, costo_mano_obra, duracion_dias, cantidad_objetivo, unidad, orden)
      VALUES (p_id, (v_r->>'proceso_id')::UUID, v_r->>'nombre', NULLIF(v_r->>'descripcion', ''), v_mat, v_mo,
              COALESCE((v_r->>'duracion_dias')::DECIMAL, 1), NULLIF(v_r->>'cantidad_objetivo', '')::DECIMAL, NULLIF(v_r->>'unidad', ''), v_orden)
      RETURNING id INTO v_renglon_id;
      v_ids := v_ids || v_renglon_id;

      INSERT INTO actividades (proceso_id, proyecto_id, codigo, nombre, descripcion, fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
                               cantidad_objetivo, unidad, costo_material, costo_mano_obra, estado)
      VALUES ((v_r->>'proceso_id')::UUID, v_co.proyecto_id, COALESCE(v_co.numero, 'CO-' || substr(v_co.id::text, 1, 8)) || '.' || v_orden,
              v_r->>'nombre', COALESCE(NULLIF(v_r->>'descripcion', ''), v_co.descripcion),
              CURRENT_DATE + 1, CURRENT_DATE + CEIL(v_dur)::INT, v_dur,
              COALESCE(NULLIF(v_r->>'cantidad_objetivo', '')::DECIMAL, 1), COALESCE(NULLIF(v_r->>'unidad', ''), 'CO'), v_mat, v_mo, 'no_iniciada')
      RETURNING id INTO v_act_id;

      v_cre := NULL;
      INSERT INTO change_order_actividades_creadas (change_order_id, renglon_id, actividad_id)
      VALUES (p_id, v_renglon_id, v_act_id) RETURNING * INTO v_cre;
      IF v_mat > 0 THEN
        INSERT INTO partidas_presupuesto (presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado)
        VALUES (v_presupuesto_id, (v_r->>'proceso_id')::UUID, v_act_id, v_co.numero, (v_r->>'nombre') || ' (material)', 'material', v_mat, v_mat)
        RETURNING id INTO v_cre.partida_material_id;
      END IF;
      IF v_mo > 0 THEN
        INSERT INTO partidas_presupuesto (presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado)
        VALUES (v_presupuesto_id, (v_r->>'proceso_id')::UUID, v_act_id, v_co.numero, (v_r->>'nombre') || ' (mano de obra)', 'mano_obra', v_mo, v_mo)
        RETURNING id INTO v_cre.partida_mano_obra_id;
      END IF;
      UPDATE change_order_actividades_creadas
      SET partida_material_id = v_cre.partida_material_id, partida_mano_obra_id = v_cre.partida_mano_obra_id
      WHERE id = v_cre.id;
    END IF;
  END LOOP;

  -- 2) Renglones quitados: solo si su actividad no tiene avance
  FOR v_cre IN
    SELECT c.* FROM change_order_actividades_creadas c
    WHERE c.change_order_id = p_id AND (c.renglon_id IS NULL OR NOT (c.renglon_id = ANY(v_ids)))
  LOOP
    IF EXISTS (SELECT 1 FROM actividades WHERE id = v_cre.actividad_id AND (COALESCE(avance_porcentaje, 0) > 0 OR estado <> 'no_iniciada')) THEN
      RAISE EXCEPTION 'renglon_con_avance';
    END IF;
    DELETE FROM avance_snapshots_actividad_semanales WHERE actividad_id = v_cre.actividad_id;
    DELETE FROM partidas_presupuesto WHERE actividad_id = v_cre.actividad_id;
    DELETE FROM change_order_actividades_creadas WHERE id = v_cre.id;
    DELETE FROM actividades WHERE id = v_cre.actividad_id;
    DELETE FROM change_order_renglones WHERE id = v_cre.renglon_id;
  END LOOP;

  -- 3) Re-prorratear indirectos: revertir factor viejo, aplicar el nuevo
  IF v_previo > 0 THEN
    v_f_old := v_directo_co_viejo / v_previo;
    v_f_new := v_nuevo_directo / v_previo;
    UPDATE partidas_presupuesto
    SET monto_presupuestado = monto_presupuestado / (1 + v_f_old) * (1 + v_f_new),
        monto_total = monto_total / (1 + v_f_old) * (1 + v_f_new)
    WHERE presupuesto_id = v_presupuesto_id AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;
    SELECT COALESCE(SUM(monto_presupuestado / (1 + v_f_new) * v_f_new), 0) INTO v_incremento
    FROM partidas_presupuesto
    WHERE presupuesto_id = v_presupuesto_id AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;
  END IF;

  SELECT COALESCE(margen_co_pct, 0) INTO v_margen FROM proyectos WHERE id = v_co.proyecto_id;
  v_nuevo_costo_margen := CASE WHEN v_margen >= 100 THEN 0 ELSE ROUND(v_nuevo_directo / (1 - v_margen / 100) - v_nuevo_directo, 2) END;

  UPDATE change_orders SET
    titulo = p_titulo, descripcion = NULLIF(p_descripcion, ''), numero = NULLIF(p_numero, ''),
    solicitado_por = NULLIF(p_solicitado_por, ''), impacto_dias = COALESCE(p_impacto_dias, 0),
    costo_directo = v_nuevo_directo, margen_pct_aplicado = v_margen,
    costo_margen = v_nuevo_costo_margen, impacto_costo = v_nuevo_directo + v_nuevo_costo_margen,
    indirectos_incrementados = v_incremento
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'costo_directo', v_nuevo_directo);
END;
$$;
REVOKE ALL ON FUNCTION corregir_change_order_aprobado(UUID, TEXT, TEXT, TEXT, TEXT, INT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION corregir_change_order_aprobado(UUID, TEXT, TEXT, TEXT, TEXT, INT, JSONB) TO authenticated;
