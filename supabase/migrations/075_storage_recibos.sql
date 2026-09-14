-- ============================================================
-- 075 — Bucket de Storage para fotos de recibos/facturas
-- ============================================================
-- Bucket privado (no público): las fotos de recibos se sirven siempre
-- por URL firmada y de tiempo limitado, generada en el servidor
-- (page.tsx de Materiales), nunca por una URL pública fija.
-- Cada archivo se guarda bajo la ruta "{proyecto_id}/{nombre}", así que
-- las políticas usan storage.foldername(name) para saber a qué
-- proyecto pertenece un archivo y reutilizan usuario_ve_proyecto (ya
-- usada en el resto del sistema) para decidir el acceso.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('recibos', 'recibos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gestion_sube_recibos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'recibos' AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "gestion_ve_recibos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'recibos' AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "gestion_elimina_recibos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'recibos' AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(((storage.foldername(name))[1])::uuid)
  );
