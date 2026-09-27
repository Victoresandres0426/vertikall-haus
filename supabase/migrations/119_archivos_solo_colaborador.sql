-- ============================================================
-- 119 — Archivos del portal: SOLO colaborador_externo (no cliente) +
--        categoría propia para lo que suba (separada de 'otros')
-- ============================================================
-- Dos correcciones a la migración 118, pedidas por el dueño:
--
-- 1) El cliente NO debe ver planos ni ningún otro documento del
--    portal -- esa sección es exclusiva del colaborador externo
--    (diseñador/arquitecto). Se quita a 'cliente' de todas las
--    políticas y de la función de lectura (antes ambos roles podían
--    ver la sección, solo se diferenciaba en quién podía subir).
--
-- 2) La categoría 'otros' de proyecto_archivos (migración 037) ya se
--    usa para guardar documentos internos que el dueño NO quiere que
--    vea el colaborador (ej. ofertas de terceros). Reusarla para lo
--    que sube el colaborador mezclaría ambas cosas. Se agrega una
--    categoría nueva, 'documentos_colaborador', exclusiva para lo que
--    el colaborador sube desde el portal (specs de materiales,
--    productos, etc.) -- 'otros' sigue siendo 100% interno, invisible
--    al portal.
--
-- La función cliente_ver_archivos() (118) se reemplaza por
-- colaborador_ver_archivos() -- mismo patrón, nombre más claro ahora
-- que ya no es compartida con 'cliente'.
-- ============================================================

-- ── Nueva categoría en el CHECK de proyecto_archivos ────────
ALTER TABLE proyecto_archivos DROP CONSTRAINT IF EXISTS proyecto_archivos_categoria_check;
ALTER TABLE proyecto_archivos ADD CONSTRAINT proyecto_archivos_categoria_check
  CHECK (categoria IN ('planos', 'fotos', 'contratos', 'otros', 'documentos_colaborador'));

-- ── Storage: SELECT/INSERT del portal, ahora solo colaborador_externo,
--    y categorías planos/documentos_colaborador (ya no 'otros') ────
DROP POLICY IF EXISTS "portal_ve_archivos_proyecto" ON storage.objects;
CREATE POLICY "portal_ve_archivos_proyecto" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proyecto-archivos' AND
    get_rol_usuario() = 'colaborador_externo' AND
    (storage.foldername(name))[1]::uuid = get_proyecto_cliente() AND
    (storage.foldername(name))[2] IN ('planos', 'documentos_colaborador')
  );

DROP POLICY IF EXISTS "colaborador_sube_archivos_proyecto" ON storage.objects;
CREATE POLICY "colaborador_sube_archivos_proyecto" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proyecto-archivos' AND
    get_rol_usuario() = 'colaborador_externo' AND
    (storage.foldername(name))[1]::uuid = get_proyecto_cliente() AND
    (storage.foldername(name))[2] IN ('planos', 'documentos_colaborador')
  );

-- ── Tabla proyecto_archivos: mismo cambio ───────────────────
DROP POLICY IF EXISTS "portal_ve_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "portal_ve_metadata_archivos" ON proyecto_archivos
  FOR SELECT USING (
    get_rol_usuario() = 'colaborador_externo' AND
    proyecto_id = get_proyecto_cliente() AND
    categoria IN ('planos', 'documentos_colaborador')
  );

DROP POLICY IF EXISTS "colaborador_inserta_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "colaborador_inserta_metadata_archivos" ON proyecto_archivos
  FOR INSERT WITH CHECK (
    get_rol_usuario() = 'colaborador_externo' AND
    proyecto_id = get_proyecto_cliente() AND
    categoria IN ('planos', 'documentos_colaborador') AND
    subido_por = auth.uid()
  );

-- ── Función de lectura: reemplaza cliente_ver_archivos() ────
DROP FUNCTION IF EXISTS cliente_ver_archivos();

CREATE OR REPLACE FUNCTION colaborador_ver_archivos()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'colaborador_externo' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'categoria', a.categoria,
      'nombre_archivo', a.nombre_archivo,
      'storage_path', a.storage_path,
      'tamano_bytes', a.tamano_bytes,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM proyecto_archivos a
  WHERE a.proyecto_id = v_proyecto_id AND a.categoria IN ('planos', 'documentos_colaborador');

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION colaborador_ver_archivos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION colaborador_ver_archivos() TO authenticated;
