-- ============================================================
-- 037 — Archivos de proyecto (planos, fotos, contratos, otros)
-- ============================================================
-- Bucket privado de Supabase Storage + tabla de metadatos. Los
-- archivos se guardan en la ruta {proyecto_id}/{categoria}/{archivo},
-- y las políticas de Storage validan que el proyecto pertenezca a
-- la empresa del usuario (igual patrón que el resto de las tablas).
--
-- Cualquier usuario autenticado de la empresa puede ver y subir
-- archivos (por ejemplo, un capataz subiendo fotos de avance desde
-- el sitio). Borrar está limitado a quien lo subió o a roles de
-- gestión.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('proyecto-archivos', 'proyecto-archivos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "empresa_ve_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_ve_archivos_proyecto" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proyecto-archivos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "empresa_sube_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_sube_archivos_proyecto" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proyecto-archivos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "empresa_borra_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_borra_archivos_proyecto" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'proyecto-archivos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE TABLE IF NOT EXISTS proyecto_archivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL CHECK (categoria IN ('planos', 'fotos', 'contratos', 'otros')),
  nombre_archivo TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  tamano_bytes BIGINT,
  subido_por UUID REFERENCES perfiles_usuario(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proyecto_archivos_proyecto ON proyecto_archivos(proyecto_id, categoria);

ALTER TABLE proyecto_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresa_ve_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "empresa_ve_metadata_archivos" ON proyecto_archivos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "empresa_inserta_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "empresa_inserta_metadata_archivos" ON proyecto_archivos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    subido_por = auth.uid()
  );

DROP POLICY IF EXISTS "gestion_borra_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "gestion_borra_metadata_archivos" ON proyecto_archivos
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    (subido_por = auth.uid() OR get_rol_usuario() IN ('project_manager', 'administrador', 'dueno', 'superadmin'))
  );
