-- 150: PM/capataz solo acceden a archivos/fotos de SUS proyectos (Storage) y
-- se retira a usuarios normales la ejecución de funciones de cron.

-- Fotos de reporte diario
DROP POLICY IF EXISTS "empresa_ve_fotos_reporte" ON storage.objects;
CREATE POLICY "empresa_ve_fotos_reporte" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'reporte-fotos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "empresa_sube_fotos_reporte" ON storage.objects;
CREATE POLICY "empresa_sube_fotos_reporte" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'reporte-fotos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "empresa_borra_fotos_reporte" ON storage.objects;
CREATE POLICY "empresa_borra_fotos_reporte" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'reporte-fotos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );

-- Archivos del proyecto (planos, contratos, etc.)
DROP POLICY IF EXISTS "empresa_ve_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_ve_archivos_proyecto" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proyecto-archivos' AND
    get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );

-- Funciones de cron: no deben poder invocarse desde la app
REVOKE ALL ON FUNCTION generar_facturas_semanales_todas_empresas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enviar_facturas_aprobadas_todas_empresas() FROM PUBLIC, anon, authenticated;

-- Subir archivos de proyecto solo a carpetas de proyectos propios
DROP POLICY IF EXISTS "empresa_sube_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_sube_archivos_proyecto" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proyecto-archivos' AND
    get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );
