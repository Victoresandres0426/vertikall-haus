-- ===== 141_corregir_change_order_aprobado.sql =====
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


-- ===== 142_margen_co_20pct.sql =====
-- 142: Margen de Change Orders pasa a 20% (sobre el precio total:
-- total = directo / (1 - 0.20)). Los textos "Indirectos + Contingencia +
-- Margen — X%" ya leen este valor, así que se actualizan solos.
ALTER TABLE proyectos ALTER COLUMN margen_co_pct SET DEFAULT 20.00;
UPDATE proyectos SET margen_co_pct = 20.00;


-- ===== 144_supervision_limpieza_fuera_de_avance_real.sql =====
-- 144: Supervisión (ADM.01) y Limpieza continua (00.02) NO cuentan en el
-- % de avance real de la obra (portal, gráfico interno, avance general).
-- Ambas avanzan solas con el tiempo (actividades.avance_por_tiempo, su
-- avance_porcentaje = % de plan transcurrido) y 00.02 se sigue facturando
-- por ese avance en el tiempo (generar_facturas_semanales usa
-- avance_porcentaje y no excluye a 00.02). ADM.01 sigue sin facturarse
-- como actividad (excluir_de_avance) porque su costo va en indirectos.
-- Reemplaza el criterio de la migración 143 (que contaba la Supervisión).
-- Las funciones de avance excluyen: excluir_de_avance OR avance_por_tiempo.

ALTER TABLE actividades
  ADD COLUMN IF NOT EXISTS avance_por_tiempo BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN actividades.avance_por_tiempo IS
  'TRUE para actividades continuas (ej. Supervisión): su avance_porcentaje = % de plan transcurrido a la fecha, calculado automáticamente.';

-- Supervisión (ADM.01): no cuenta en el avance real ni se factura como
-- actividad (su costo va en los indirectos); avanza sola con el tiempo.
UPDATE actividades SET avance_por_tiempo = TRUE WHERE codigo = 'ADM.01' AND excluir_de_avance = TRUE;
-- Limpieza continua (00.02) en Radnor: no cuenta en el avance real, pero SÍ
-- se sigue facturando, ahora según el avance en el tiempo.
UPDATE actividades SET avance_por_tiempo = TRUE, excluir_de_avance = FALSE
WHERE codigo = '00.02' AND proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440';

CREATE OR REPLACE FUNCTION refrescar_avance_por_tiempo()
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  UPDATE actividades a
  SET avance_porcentaje = ROUND(LEAST(100, GREATEST(0, CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN CURRENT_DATE >= a.fecha_fin_plan THEN 100
        WHEN CURRENT_DATE <= a.fecha_inicio_plan THEN 0
        ELSE (CURRENT_DATE - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END))::NUMERIC, 2)
  WHERE a.avance_por_tiempo = TRUE
    AND a.avance_porcentaje IS DISTINCT FROM ROUND(LEAST(100, GREATEST(0, CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN CURRENT_DATE >= a.fecha_fin_plan THEN 100
        WHEN CURRENT_DATE <= a.fecha_inicio_plan THEN 0
        ELSE (CURRENT_DATE - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END))::NUMERIC, 2);
$$;
GRANT EXECUTE ON FUNCTION refrescar_avance_por_tiempo() TO authenticated;

SELECT refrescar_avance_por_tiempo();

CREATE OR REPLACE FUNCTION cliente_ver_avance_general()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_avance_costo DECIMAL(7,2);
  v_avance_duracion DECIMAL(7,2);
  v_plan_costo DECIMAL(7,2);
  v_plan_duracion DECIMAL(7,2);
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT
    CASE WHEN SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1)) > 0
      THEN SUM(COALESCE(act.avance_porcentaje, 0) * GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
           / SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
      ELSE 0
    END,
    CASE WHEN SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1)) > 0
      THEN SUM(
        (CASE
          WHEN act.fecha_inicio_plan IS NULL OR act.fecha_fin_plan IS NULL THEN 0
          WHEN CURRENT_DATE >= act.fecha_fin_plan THEN 100
          WHEN CURRENT_DATE <= act.fecha_inicio_plan THEN 0
          ELSE (CURRENT_DATE - act.fecha_inicio_plan)::DECIMAL
               / NULLIF((act.fecha_fin_plan - act.fecha_inicio_plan), 0) * 100
        END) * GREATEST(COALESCE(act.costo_presupuesto, 0), 1)
      ) / SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
      ELSE 0
    END
  INTO v_avance_costo, v_plan_costo
  FROM actividades act
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE AND act.excluir_de_avance = FALSE AND act.avance_por_tiempo = FALSE;

  SELECT
    CASE WHEN SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)) > 0
      THEN SUM(COALESCE(act.avance_porcentaje, 0) * GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
           / SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
      ELSE 0
    END,
    CASE WHEN SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)) > 0
      THEN SUM(
        (CASE
          WHEN act.fecha_inicio_plan IS NULL OR act.fecha_fin_plan IS NULL THEN 0
          WHEN CURRENT_DATE >= act.fecha_fin_plan THEN 100
          WHEN CURRENT_DATE <= act.fecha_inicio_plan THEN 0
          ELSE (CURRENT_DATE - act.fecha_inicio_plan)::DECIMAL
               / NULLIF((act.fecha_fin_plan - act.fecha_inicio_plan), 0) * 100
        END) * GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)
      ) / SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
      ELSE 0
    END
  INTO v_avance_duracion, v_plan_duracion
  FROM actividades act
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE AND act.excluir_de_avance = FALSE AND act.avance_por_tiempo = FALSE;

  RETURN jsonb_build_object(
    'avance_real_pct', ROUND((COALESCE(v_avance_costo, 0) + COALESCE(v_avance_duracion, 0)) / 2, 1),
    'avance_plan_pct', ROUND(LEAST((COALESCE(v_plan_costo, 0) + COALESCE(v_plan_duracion, 0)) / 2, 100), 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION proyecto_avance_historico(p_proyecto_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  IF NOT usuario_ve_proyecto(p_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  WITH fechas AS (
    SELECT DISTINCT r.fecha
    FROM reportes_diarios r
    WHERE r.proyecto_id = p_proyecto_id
    UNION
    SELECT CURRENT_DATE
  ),
  acts AS (
    SELECT
      id,
      GREATEST(COALESCE(costo_presupuesto, 0), 1) AS peso_costo,
      GREATEST(COALESCE(duracion_plan_dias, 0), 1) AS peso_dur,
      NULLIF(COALESCE(cantidad_objetivo, 0), 0) AS objetivo,
      fecha_inicio_plan,
      fecha_fin_plan,
      avance_por_tiempo AS por_tiempo
    FROM actividades
    WHERE proyecto_id = p_proyecto_id AND activa IS NOT FALSE AND excluir_de_avance = FALSE AND avance_por_tiempo = FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha, a.peso_costo, a.peso_dur,
      CASE WHEN a.por_tiempo THEN LEAST((CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END), 100) ELSE LEAST(COALESCE((
        SELECT SUM(ad.cantidad_ejecutada_dia) FROM avance_diario ad
        JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
        WHERE ad.actividad_id = a.id AND r2.fecha <= f.fecha
      ), 0) / a.objetivo * 100, 100) END AS avance_pct,
      (CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END) AS plan_pct
    FROM fechas f CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur,
      SUM(COALESCE(plan_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS plan_costo,
      SUM(COALESCE(plan_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS plan_dur
    FROM avance_por_fecha GROUP BY fecha
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1),
      'avance_plan_pct', ROUND(LEAST((COALESCE(plan_costo, 0) + COALESCE(plan_dur, 0)) / 2, 100), 1)
    ) ORDER BY fecha
  ), '[]'::jsonb) INTO v_result
  FROM ponderado;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION cliente_ver_avance_historico()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
  v_hoy_general JSONB;
  v_ultima_fecha DATE;
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  WITH fechas AS (
    SELECT DISTINCT r.fecha
    FROM reportes_diarios r
    WHERE r.proyecto_id = v_proyecto_id AND r.estado_reporte = 'validado'
  ),
  acts AS (
    SELECT
      id,
      GREATEST(COALESCE(costo_presupuesto, 0), 1) AS peso_costo,
      GREATEST(COALESCE(duracion_plan_dias, 0), 1) AS peso_dur,
      NULLIF(COALESCE(cantidad_objetivo, 0), 0) AS objetivo,
      fecha_inicio_plan,
      fecha_fin_plan,
      avance_por_tiempo AS por_tiempo
    FROM actividades
    WHERE proyecto_id = v_proyecto_id AND activa IS NOT FALSE AND excluir_de_avance = FALSE AND avance_por_tiempo = FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha,
      a.peso_costo,
      a.peso_dur,
      CASE WHEN a.por_tiempo THEN LEAST((CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END), 100) ELSE LEAST(
        COALESCE((
          SELECT SUM(ad.cantidad_ejecutada_dia)
          FROM avance_diario ad
          JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
          WHERE ad.actividad_id = a.id
            AND r2.estado_reporte = 'validado'
            AND r2.fecha <= f.fecha
        ), 0) / a.objetivo * 100
      , 100) END AS avance_pct,
      (CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END) AS plan_pct
    FROM fechas f
    CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT
      fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur,
      SUM(COALESCE(plan_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS plan_costo,
      SUM(COALESCE(plan_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS plan_dur
    FROM avance_por_fecha
    GROUP BY fecha
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'fecha', fecha,
        'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1),
        'avance_plan_pct', ROUND(LEAST((COALESCE(plan_costo, 0) + COALESCE(plan_dur, 0)) / 2, 100), 1)
      ) ORDER BY fecha
    ), '[]'::jsonb),
    MAX(fecha)
  INTO v_result, v_ultima_fecha
  FROM ponderado;

  IF v_ultima_fecha IS NULL OR v_ultima_fecha < CURRENT_DATE THEN
    v_hoy_general := cliente_ver_avance_general();
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'fecha', CURRENT_DATE,
        'avance_pct', COALESCE((v_hoy_general->>'avance_real_pct')::DECIMAL, 0),
        'avance_plan_pct', COALESCE((v_hoy_general->>'avance_plan_pct')::DECIMAL, 0)
      )
    );
  END IF;

  RETURN v_result;
END;
$$;


-- La facturación semanal lee avance_porcentaje: se refresca antes de generar.
CREATE OR REPLACE FUNCTION generar_facturas_semanales_todas_empresas()
RETURNS void AS $$
DECLARE
  v_empresa RECORD;
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  FOR v_empresa IN SELECT id FROM empresas LOOP
    PERFORM generar_facturas_semanales(v_empresa.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ===== 145_limpieza_continua_vuelve_al_avance.sql =====
-- 145: Limpieza continua (00.02) de Radnor vuelve a contar en el avance
-- real, calculado por sus reportes como cualquier otra actividad (deja
-- de avanzar "por tiempo"). Supervisión (ADM.01) sigue fuera del avance
-- real y avanzando por tiempo (migración 144).
UPDATE actividades
SET avance_por_tiempo = FALSE, excluir_de_avance = FALSE
WHERE codigo = '00.02' AND proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440';

-- Su avance_porcentaje se había sobrescrito con el % del plan: se
-- recalcula desde los reportes diarios (misma función que usa el botón
-- "Recalcular" de Actividades).
DO $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN
    SELECT id FROM actividades
    WHERE codigo = '00.02' AND proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440'
  LOOP
    PERFORM _recalcular_avance_actividad(v_id);
  END LOOP;
END $$;


-- ===== 146_supervision_cuenta_en_avance.sql =====
-- 146: La Supervisión (ADM.01) vuelve a CONTAR en el % de avance (real y
-- plan) en el portal, el gráfico interno y el avance general. Su avance
-- se genera solo con el tiempo (avance_por_tiempo, migración 144), así
-- no depende de reportes ni cantidades. Sigue sin facturarse como
-- actividad (excluir_de_avance; su costo va en indirectos).
-- Limpieza continua (00.02) cuenta por sus reportes (migración 145).
-- Restaura las funciones sin el filtro de exclusión de la migración 144.

CREATE OR REPLACE FUNCTION cliente_ver_avance_general()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_avance_costo DECIMAL(7,2);
  v_avance_duracion DECIMAL(7,2);
  v_plan_costo DECIMAL(7,2);
  v_plan_duracion DECIMAL(7,2);
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT
    CASE WHEN SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1)) > 0
      THEN SUM(COALESCE(act.avance_porcentaje, 0) * GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
           / SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
      ELSE 0
    END,
    CASE WHEN SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1)) > 0
      THEN SUM(
        (CASE
          WHEN act.fecha_inicio_plan IS NULL OR act.fecha_fin_plan IS NULL THEN 0
          WHEN CURRENT_DATE >= act.fecha_fin_plan THEN 100
          WHEN CURRENT_DATE <= act.fecha_inicio_plan THEN 0
          ELSE (CURRENT_DATE - act.fecha_inicio_plan)::DECIMAL
               / NULLIF((act.fecha_fin_plan - act.fecha_inicio_plan), 0) * 100
        END) * GREATEST(COALESCE(act.costo_presupuesto, 0), 1)
      ) / SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
      ELSE 0
    END
  INTO v_avance_costo, v_plan_costo
  FROM actividades act
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE;

  SELECT
    CASE WHEN SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)) > 0
      THEN SUM(COALESCE(act.avance_porcentaje, 0) * GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
           / SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
      ELSE 0
    END,
    CASE WHEN SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)) > 0
      THEN SUM(
        (CASE
          WHEN act.fecha_inicio_plan IS NULL OR act.fecha_fin_plan IS NULL THEN 0
          WHEN CURRENT_DATE >= act.fecha_fin_plan THEN 100
          WHEN CURRENT_DATE <= act.fecha_inicio_plan THEN 0
          ELSE (CURRENT_DATE - act.fecha_inicio_plan)::DECIMAL
               / NULLIF((act.fecha_fin_plan - act.fecha_inicio_plan), 0) * 100
        END) * GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)
      ) / SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
      ELSE 0
    END
  INTO v_avance_duracion, v_plan_duracion
  FROM actividades act
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE;

  RETURN jsonb_build_object(
    'avance_real_pct', ROUND((COALESCE(v_avance_costo, 0) + COALESCE(v_avance_duracion, 0)) / 2, 1),
    'avance_plan_pct', ROUND(LEAST((COALESCE(v_plan_costo, 0) + COALESCE(v_plan_duracion, 0)) / 2, 100), 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION proyecto_avance_historico(p_proyecto_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  IF NOT usuario_ve_proyecto(p_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  WITH fechas AS (
    SELECT DISTINCT r.fecha
    FROM reportes_diarios r
    WHERE r.proyecto_id = p_proyecto_id
    UNION
    SELECT CURRENT_DATE
  ),
  acts AS (
    SELECT
      id,
      GREATEST(COALESCE(costo_presupuesto, 0), 1) AS peso_costo,
      GREATEST(COALESCE(duracion_plan_dias, 0), 1) AS peso_dur,
      NULLIF(COALESCE(cantidad_objetivo, 0), 0) AS objetivo,
      fecha_inicio_plan,
      fecha_fin_plan,
      avance_por_tiempo AS por_tiempo
    FROM actividades
    WHERE proyecto_id = p_proyecto_id AND activa IS NOT FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha, a.peso_costo, a.peso_dur,
      CASE WHEN a.por_tiempo THEN LEAST((CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END), 100) ELSE LEAST(COALESCE((
        SELECT SUM(ad.cantidad_ejecutada_dia) FROM avance_diario ad
        JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
        WHERE ad.actividad_id = a.id AND r2.fecha <= f.fecha
      ), 0) / a.objetivo * 100, 100) END AS avance_pct,
      (CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END) AS plan_pct
    FROM fechas f CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur,
      SUM(COALESCE(plan_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS plan_costo,
      SUM(COALESCE(plan_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS plan_dur
    FROM avance_por_fecha GROUP BY fecha
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1),
      'avance_plan_pct', ROUND(LEAST((COALESCE(plan_costo, 0) + COALESCE(plan_dur, 0)) / 2, 100), 1)
    ) ORDER BY fecha
  ), '[]'::jsonb) INTO v_result
  FROM ponderado;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION cliente_ver_avance_historico()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
  v_hoy_general JSONB;
  v_ultima_fecha DATE;
BEGIN
  PERFORM refrescar_avance_por_tiempo();
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  WITH fechas AS (
    SELECT DISTINCT r.fecha
    FROM reportes_diarios r
    WHERE r.proyecto_id = v_proyecto_id AND r.estado_reporte = 'validado'
  ),
  acts AS (
    SELECT
      id,
      GREATEST(COALESCE(costo_presupuesto, 0), 1) AS peso_costo,
      GREATEST(COALESCE(duracion_plan_dias, 0), 1) AS peso_dur,
      NULLIF(COALESCE(cantidad_objetivo, 0), 0) AS objetivo,
      fecha_inicio_plan,
      fecha_fin_plan,
      avance_por_tiempo AS por_tiempo
    FROM actividades
    WHERE proyecto_id = v_proyecto_id AND activa IS NOT FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha,
      a.peso_costo,
      a.peso_dur,
      CASE WHEN a.por_tiempo THEN LEAST((CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END), 100) ELSE LEAST(
        COALESCE((
          SELECT SUM(ad.cantidad_ejecutada_dia)
          FROM avance_diario ad
          JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
          WHERE ad.actividad_id = a.id
            AND r2.estado_reporte = 'validado'
            AND r2.fecha <= f.fecha
        ), 0) / a.objetivo * 100
      , 100) END AS avance_pct,
      (CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END) AS plan_pct
    FROM fechas f
    CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT
      fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur,
      SUM(COALESCE(plan_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS plan_costo,
      SUM(COALESCE(plan_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS plan_dur
    FROM avance_por_fecha
    GROUP BY fecha
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'fecha', fecha,
        'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1),
        'avance_plan_pct', ROUND(LEAST((COALESCE(plan_costo, 0) + COALESCE(plan_dur, 0)) / 2, 100), 1)
      ) ORDER BY fecha
    ), '[]'::jsonb),
    MAX(fecha)
  INTO v_result, v_ultima_fecha
  FROM ponderado;

  IF v_ultima_fecha IS NULL OR v_ultima_fecha < CURRENT_DATE THEN
    v_hoy_general := cliente_ver_avance_general();
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'fecha', CURRENT_DATE,
        'avance_pct', COALESCE((v_hoy_general->>'avance_real_pct')::DECIMAL, 0),
        'avance_plan_pct', COALESCE((v_hoy_general->>'avance_plan_pct')::DECIMAL, 0)
      )
    );
  END IF;

  RETURN v_result;
END;
$$;


-- ===== 147_datos_de_pago.sql =====
-- 147: Datos de pago de la empresa (wire/ACH + enlace de pago opcional),
-- guardados en empresas.configuracion -> 'datos_pago'. El portal del
-- cliente los lee con cliente_ver_datos_pago() (solo los de la empresa
-- dueña de SU proyecto); el equipo los edita con guardar_datos_pago().
CREATE OR REPLACE FUNCTION cliente_ver_datos_pago()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_datos JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;
  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT e.configuracion -> 'datos_pago' INTO v_datos
  FROM proyectos p JOIN empresas e ON e.id = p.empresa_id
  WHERE p.id = v_proyecto_id;

  RETURN COALESCE(v_datos, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION cliente_ver_datos_pago() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_ver_datos_pago() TO authenticated;

CREATE OR REPLACE FUNCTION guardar_datos_pago(p_datos JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  UPDATE empresas
  SET configuracion = jsonb_set(COALESCE(configuracion, '{}'::jsonb), '{datos_pago}', COALESCE(p_datos, '{}'::jsonb), true)
  WHERE id = get_empresa_id();
END;
$$;
REVOKE ALL ON FUNCTION guardar_datos_pago(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardar_datos_pago(JSONB) TO authenticated;


-- ===== 148_pm_nomina_y_change_orders.sql =====
-- PM: puede ver nómina (solo lectura) y crear/editar CO en borrador,
-- pero validar / enviar al cliente / corregir aprobados es solo del dueño.

-- 1) Nómina: PM puede leer líneas (periodos_nomina_select ya lo incluye)
DROP POLICY IF EXISTS "lineas_nomina_select" ON lineas_nomina;
CREATE POLICY "lineas_nomina_select" ON lineas_nomina
  FOR SELECT USING (
    periodo_id IN (
      SELECT id FROM periodos_nomina WHERE empresa_id = get_empresa_id()
    ) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager')
  );

-- 2) Change orders: el PM no puede cambiar el estado ni tocar CO fuera de borrador
CREATE OR REPLACE FUNCTION trg_co_restringir_pm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND get_rol_usuario() = 'project_manager' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      RAISE EXCEPTION 'Solo el dueño puede validar, enviar o cambiar el estado de un Change Order';
    END IF;
    IF OLD.estado NOT IN ('detectado', 'en_estimacion') THEN
      RAISE EXCEPTION 'Solo el dueño puede modificar un Change Order ya enviado o aprobado';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS co_restringir_pm ON change_orders;
CREATE TRIGGER co_restringir_pm
  BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION trg_co_restringir_pm();


