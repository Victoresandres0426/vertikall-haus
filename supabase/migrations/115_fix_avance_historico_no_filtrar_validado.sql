-- ============================================================
-- 115 — Fix: "Avance en el tiempo" (ficha interna) no coincidía con
--        Actividades/Proyectos/Dashboard
-- ============================================================
-- proyecto_avance_historico (migración 110) se copió de la función que
-- alimenta el Cronograma del PORTAL DEL CLIENTE (cliente_ver_avance_
-- historico), que a propósito solo cuenta reportes ya VALIDADOS
-- (estado_reporte = 'validado') -- correcto ahí, porque el cliente no
-- debe ver avance de un reporte que el dueño/PM todavía no revisó.
--
-- Pero en la ficha INTERNA del proyecto (para el dueño), ese mismo
-- filtro causaba que el gráfico mostrara un % distinto al de
-- Actividades, Proyectos y el Dashboard -- esas pantallas usan
-- actividades.avance_porcentaje / cantidad_ejecutada, que el trigger
-- de la migración 064 recalcula sumando TODO avance_diario, sin
-- importar si el reporte de origen está validado o no. Si había
-- reportes recientes sin validar, el gráfico interno se quedaba
-- "atrás" del número real que el dueño ya veía en todas las demás
-- pantallas.
--
-- Se quita el filtro de validado en las dos partes de la función
-- (las fechas del eje X, y la suma de avance por actividad) para que
-- la vista interna refleje SIEMPRE el mismo acumulado real que el
-- resto de la app. El portal del cliente (cliente_ver_avance_
-- historico) no se toca -- ese sigue restringido a validados, que es
-- lo correcto para ese caso.
-- ============================================================

CREATE OR REPLACE FUNCTION proyecto_avance_historico(p_proyecto_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
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
      fecha_fin_plan
    FROM actividades
    WHERE proyecto_id = p_proyecto_id AND activa IS NOT FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha, a.peso_costo, a.peso_dur,
      LEAST(COALESCE((
        SELECT SUM(ad.cantidad_ejecutada_dia) FROM avance_diario ad
        JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
        WHERE ad.actividad_id = a.id AND r2.fecha <= f.fecha
      ), 0) / a.objetivo * 100, 100) AS avance_pct,
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
