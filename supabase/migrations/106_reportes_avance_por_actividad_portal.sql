-- ============================================================
-- 106 — Portal cliente: avance diario % por actividad en cada reporte
-- ============================================================
-- El dueño pidió que, al abrir un reporte en el portal, el cliente vea
-- SOLO el avance del día en % por actividad -- nunca quién lo hizo
-- (nombre del trabajador) ni cuánto representa en dinero (destajo,
-- costo). cliente_ver_reportes() nunca exponía esos datos de todas
-- formas (siempre fue solo fecha/clima/observaciones/fotos), pero
-- tampoco traía el avance por actividad -- se agrega ahora como una
-- clave nueva, calculada así: cantidad_ejecutada_dia (lo que se
-- reportó ESE día) / cantidad_objetivo de la actividad * 100 -- el %
-- que esa actividad avanzó específicamente en ese reporte, no el
-- acumulado (eso ya se ve en la sección Cronograma).
-- ============================================================

CREATE OR REPLACE FUNCTION cliente_ver_reportes()
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

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'fecha', r.fecha,
      'clima', r.clima,
      'clima_en', r.clima_en,
      'observaciones_generales', r.observaciones_generales,
      'observaciones_generales_en', r.observaciones_generales_en,
      'avance_por_actividad', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'actividad_id', ad.actividad_id,
            'codigo', a.codigo,
            'nombre', a.nombre,
            'nombre_en', a.nombre_en,
            'avance_dia_pct', CASE
              WHEN a.cantidad_objetivo IS NOT NULL AND a.cantidad_objetivo > 0
                THEN ROUND((ad.cantidad_ejecutada_dia / a.cantidad_objetivo) * 100, 1)
              ELSE NULL
            END
          ) ORDER BY a.codigo
        ), '[]'::jsonb)
        FROM avance_diario ad
        JOIN actividades a ON a.id = ad.actividad_id
        WHERE ad.reporte_id = r.id AND ad.cantidad_ejecutada_dia > 0
      ),
      'fotos_por_actividad', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'actividad_id', ad.actividad_id,
            'codigo', a.codigo,
            'nombre', a.nombre,
            'nombre_en', a.nombre_en,
            'fotos', ad.fotos
          ) ORDER BY a.codigo
        ), '[]'::jsonb)
        FROM avance_diario ad
        JOIN actividades a ON a.id = ad.actividad_id
        WHERE ad.reporte_id = r.id AND jsonb_array_length(ad.fotos) > 0
      )
    ) ORDER BY r.fecha DESC
  ), '[]'::jsonb) INTO v_result
  FROM reportes_diarios r
  WHERE r.proyecto_id = v_proyecto_id
    AND r.estado_reporte = 'validado';

  RETURN v_result;
END;
$$;
