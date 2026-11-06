-- 153: Documentos de subcontratistas (seguros, licencias, W-9, contratos firmados…).
-- Archivos en un bucket privado; ruta: {empresa_id}/{subcontratista_id}/{archivo}.
-- Ven y suben: dueño, administrador y PM. Borran: dueño y administrador.
-- Idempotente: se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS subcontratista_documentos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontratista_id UUID NOT NULL REFERENCES subcontratistas(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL
                    CHECK (tipo IN ('seguro', 'licencia', 'w9', 'workers_comp', 'contrato', 'otro')),
  nombre_archivo    TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  fecha_vence       DATE,
  notas             TEXT,
  subido_por        UUID REFERENCES perfiles_usuario(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontratista_docs_sub ON subcontratista_documentos(subcontratista_id);

ALTER TABLE subcontratista_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_docs_select" ON subcontratista_documentos;
CREATE POLICY "sub_docs_select" ON subcontratista_documentos
  FOR SELECT USING (
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    subcontratista_id IN (SELECT id FROM subcontratistas WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "sub_docs_insert" ON subcontratista_documentos;
CREATE POLICY "sub_docs_insert" ON subcontratista_documentos
  FOR INSERT WITH CHECK (
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    subcontratista_id IN (SELECT id FROM subcontratistas WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "sub_docs_update" ON subcontratista_documentos;
CREATE POLICY "sub_docs_update" ON subcontratista_documentos
  FOR UPDATE USING (
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    subcontratista_id IN (SELECT id FROM subcontratistas WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "sub_docs_delete" ON subcontratista_documentos;
CREATE POLICY "sub_docs_delete" ON subcontratista_documentos
  FOR DELETE USING (
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin') AND
    subcontratista_id IN (SELECT id FROM subcontratistas WHERE empresa_id = get_empresa_id())
  );

-- ── Storage ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('subcontratistas-docs', 'subcontratistas-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sub_docs_storage_select" ON storage.objects;
CREATE POLICY "sub_docs_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'subcontratistas-docs' AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    (storage.foldername(name))[1] = get_empresa_id()::text
  );

DROP POLICY IF EXISTS "sub_docs_storage_insert" ON storage.objects;
CREATE POLICY "sub_docs_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'subcontratistas-docs' AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    (storage.foldername(name))[1] = get_empresa_id()::text
  );

DROP POLICY IF EXISTS "sub_docs_storage_delete" ON storage.objects;
CREATE POLICY "sub_docs_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'subcontratistas-docs' AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin') AND
    (storage.foldername(name))[1] = get_empresa_id()::text
  );
