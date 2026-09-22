-- ============================================================
-- 108 — Portal cliente: historial de avance para gráfica
-- ============================================================
-- El dueño pidió hacer el portal más visual -- lo primero: una
-- gráfica de avance en el tiempo en Cronograma. El problema es que
-- "avance_porcentaje" en actividades es un valor que se sobrescribe
-- (siempre el actual, nunca el histórico), así que no hay una serie
-- de tiempo guardada en ningún lado.
--
-- Esta función la reconstruye: por cada fecha con reporte validado,
-- recalcula qué % llevaba cada actividad SUMANDO solo lo reportado
-- hasta esa fecha (avance_diario.cantidad_ejecutada_dia acumulado /
-- cantidad_objetivo), y pondera exactamente igual que
-- cliente_ver_avance_general() (migración 093: mitad por
-- costo_presupuesto, mitad por duracion_plan_dias) -- así la gráfica
-- termina en el mismo número que ya se ve en el resumen.
--
-- Es una reconstrucción de solo lectura -- no crea ninguna tabla
-- nueva ni depende de que algo se haya empezado a guardar desde hoy;
-- funciona sobre el historial que ya existe.
-- ============================================================

CREATE OR REPLACE FUNCTION cliente_ver_avance_historico()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
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
      NULLIF(COALESCE(cantidad_objetivo, 0), 0) AS objetivo
    FROM actividades
    WHERE proyecto_id = v_proyecto_id AND activa IS NOT FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha,
      a.peso_costo,
      a.peso_dur,
      LEAST(
        COALESCE((
          SELECT SUM(ad.cantidad_ejecutada_dia)
          FROM avance_diario ad
          JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
          WHERE ad.actividad_id = a.id
            AND r2.estado_reporte = 'validado'
            AND r2.fecha <= f.fecha
        ), 0) / a.objetivo * 100
      , 100) AS avance_pct
    FROM fechas f
    CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT
      fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur
    FROM avance_por_fecha
    GROUP BY fecha
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1)
    ) ORDER BY fecha
  ), '[]'::jsonb) INTO v_result
  FROM ponderado;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION cliente_ver_avance_historico() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_ver_avance_historico() TO authenticated;
