-- 143: (1) La actividad "Supervisión" SÍ cuenta en el % de avance
-- (portal del cliente, gráfico interno y avance general); sigue sin
-- facturarse como trabajo de contrato (generar_facturas_semanales
-- conserva su filtro excluir_de_avance).
-- (2) Nueva bandera actividades.avance_por_tiempo: el avance de esa
-- actividad se genera solo con el tiempo transcurrido (= su % de plan),
-- sin depender de cantidad_objetivo ni de reportes. Se activa para
-- ADM.01 (Supervisión). Antes, con cantidad_objetivo NULL, sus reportes
-- daban 100% por un artefacto de LEAST() ignorando NULLs.

ALTER TABLE actividades
  ADD COLUMN IF NOT EXISTS avance_por_tiempo BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN actividades.avance_por_tiempo IS
  'TRUE para actividades continuas (ej. Supervisión): su avance_porcentaje = % de plan transcurrido a la fecha, calculado automáticamente.';

UPDATE actividades SET avance_por_tiempo = TRUE WHERE codigo = 'ADM.01' AND excluir_de_avance = TRUE;

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
