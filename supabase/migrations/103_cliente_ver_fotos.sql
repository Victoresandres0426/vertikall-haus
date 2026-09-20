-- ============================================================
-- 103 — Portal cliente: exponer las fotos del proyecto
-- ============================================================
-- Las fotos que sube el equipo desde "Archivos del proyecto" (categoría
-- 'fotos', tabla proyecto_archivos, migración 037) nunca se expusieron
-- al portal del cliente -- ninguna función cliente_ver_* las devolvía y
-- portal-cliente/page.tsx nunca las consultaba. Es un hueco aparte del
-- de reportes_diarios (migración 102): esto es la sección de Archivos,
-- no las fotos que -en teoría- podrían ir dentro de un reporte diario.
--
-- Mismo patrón que el resto de cliente_ver_*: SECURITY DEFINER, valida
-- rol = 'cliente' y limita al único proyecto asignado. Solo devuelve
-- categoría 'fotos' -- nunca planos, contratos ni "otros", que pueden
-- traer información que no es para el cliente.
-- ============================================================

CREATE OR REPLACE FUNCTION cliente_ver_fotos()
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
      'id', a.id,
      'nombre_archivo', a.nombre_archivo,
      'storage_path', a.storage_path,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM proyecto_archivos a
  WHERE a.proyecto_id = v_proyecto_id AND a.categoria = 'fotos';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION cliente_ver_fotos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_ver_fotos() TO authenticated;
