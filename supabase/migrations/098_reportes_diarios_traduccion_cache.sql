-- ============================================================
-- 098 — Reportes de obra: traducción cacheada al inglés
-- ============================================================
-- Última pieza de "TODO lo que el cliente ve" (Cronograma y
-- disciplinas ya quedaron cubiertos en la migración 097 y el código
-- del portal). "Fotos y reportes de obra" es texto libre escrito día
-- a día por el equipo (observaciones_generales, clima) -- no es un
-- catálogo fijo como actividades/disciplinas, así que no se puede
-- backfillear de una vez. Se traduce con IA la primera vez que un
-- reporte se ve en inglés, y el resultado se guarda en cache
-- (observaciones_generales_en, clima_en) para no volver a pagar esa
-- traducción cada vez que se recarga la página -- ver el fetch a
-- Anthropic en portal-cliente/page.tsx.
-- ============================================================

ALTER TABLE reportes_diarios ADD COLUMN IF NOT EXISTS observaciones_generales_en TEXT;
ALTER TABLE reportes_diarios ADD COLUMN IF NOT EXISTS clima_en TEXT;

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
      'fotos', (
        SELECT COALESCE(jsonb_agg(foto), '[]'::jsonb)
        FROM avance_diario ad, jsonb_array_elements(ad.fotos) foto
        WHERE ad.reporte_id = r.id
      )
    ) ORDER BY r.fecha DESC
  ), '[]'::jsonb) INTO v_result
  FROM reportes_diarios r
  WHERE r.proyecto_id = v_proyecto_id
    AND r.estado_reporte = 'validado';

  RETURN v_result;
END;
$$;

-- El cliente puede guardar la traducción que se generó al vuelo para
-- SU propio reporte (verificado por proyecto), para cachearla y no
-- volver a traducirla en la siguiente visita.
CREATE OR REPLACE FUNCTION cliente_guardar_traduccion_reporte(
  p_reporte_id UUID,
  p_observaciones_en TEXT,
  p_clima_en TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  UPDATE reportes_diarios
  SET observaciones_generales_en = COALESCE(p_observaciones_en, observaciones_generales_en),
      clima_en = COALESCE(p_clima_en, clima_en)
  WHERE id = p_reporte_id AND proyecto_id = v_proyecto_id;
END;
$$;

REVOKE ALL ON FUNCTION cliente_guardar_traduccion_reporte(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_guardar_traduccion_reporte(UUID, TEXT, TEXT) TO authenticated;
