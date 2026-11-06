-- 152: Subcontratistas (directorio de la empresa) y contratos por proyecto.
--  · subcontratistas: compañía, contacto, datos legales/fiscales, pago, calificación.
--  · subcontratos: contrato de un subcontratista en un proyecto (alcance, monto, fechas, estado).
--  · subcontrato_actividades: actividades del proyecto cubiertas por ese contrato.
-- Dueño, administrador y PM pueden ver y editar el directorio; el PM solo ve/edita
-- contratos de proyectos que tiene asignados. Borrar: solo dueño/administrador.

CREATE TABLE IF NOT EXISTS subcontratistas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Compañía y contacto
  nombre_compania     TEXT NOT NULL,
  contacto_nombre     TEXT,
  telefono            TEXT,
  email               TEXT,
  direccion           TEXT,
  sitio_web           TEXT,
  especialidad        TEXT,
  -- Legales y fiscales
  ein                 TEXT,
  w9_recibido         BOOLEAN NOT NULL DEFAULT FALSE,
  licencia_numero     TEXT,
  licencia_vence      DATE,
  seguro_aseguradora  TEXT,
  seguro_poliza       TEXT,
  seguro_vence        DATE,
  workers_comp        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Pago
  metodo_pago         TEXT,
  datos_pago          TEXT,
  -- Estado
  calificacion        SMALLINT CHECK (calificacion BETWEEN 1 AND 5),
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontratistas_empresa ON subcontratistas(empresa_id);

CREATE TABLE IF NOT EXISTS subcontratos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontratista_id UUID NOT NULL REFERENCES subcontratistas(id) ON DELETE CASCADE,
  proyecto_id       UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  alcance           TEXT NOT NULL,
  monto_contrato    NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_inicio      DATE,
  fecha_fin         DATE,
  estado            TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador', 'activo', 'completado', 'cancelado')),
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontratos_subcontratista ON subcontratos(subcontratista_id);
CREATE INDEX IF NOT EXISTS idx_subcontratos_proyecto ON subcontratos(proyecto_id);

-- Una actividad pertenece a lo sumo a un contrato
CREATE TABLE IF NOT EXISTS subcontrato_actividades (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subcontrato_id UUID NOT NULL REFERENCES subcontratos(id) ON DELETE CASCADE,
  actividad_id   UUID NOT NULL UNIQUE REFERENCES actividades(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontrato_act_subcontrato ON subcontrato_actividades(subcontrato_id);

DROP TRIGGER IF EXISTS update_subcontratistas_updated_at ON subcontratistas;
CREATE TRIGGER update_subcontratistas_updated_at BEFORE UPDATE ON subcontratistas
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
DROP TRIGGER IF EXISTS update_subcontratos_updated_at ON subcontratos;
CREATE TRIGGER update_subcontratos_updated_at BEFORE UPDATE ON subcontratos
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE subcontratistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontrato_actividades ENABLE ROW LEVEL SECURITY;

-- ── subcontratistas ──
DROP POLICY IF EXISTS "subcontratistas_select" ON subcontratistas;
CREATE POLICY "subcontratistas_select" ON subcontratistas
  FOR SELECT USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

DROP POLICY IF EXISTS "subcontratistas_insert" ON subcontratistas;
CREATE POLICY "subcontratistas_insert" ON subcontratistas
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

DROP POLICY IF EXISTS "subcontratistas_update" ON subcontratistas;
CREATE POLICY "subcontratistas_update" ON subcontratistas
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

DROP POLICY IF EXISTS "subcontratistas_delete" ON subcontratistas;
CREATE POLICY "subcontratistas_delete" ON subcontratistas
  FOR DELETE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

-- ── subcontratos (el PM solo en sus proyectos) ──
DROP POLICY IF EXISTS "subcontratos_select" ON subcontratos;
CREATE POLICY "subcontratos_select" ON subcontratos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "subcontratos_insert" ON subcontratos;
CREATE POLICY "subcontratos_insert" ON subcontratos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id) AND
    subcontratista_id IN (SELECT id FROM subcontratistas WHERE empresa_id = get_empresa_id())
  );

DROP POLICY IF EXISTS "subcontratos_update" ON subcontratos;
CREATE POLICY "subcontratos_update" ON subcontratos
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "subcontratos_delete" ON subcontratos;
CREATE POLICY "subcontratos_delete" ON subcontratos
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

-- ── actividades de cada contrato ──
DROP POLICY IF EXISTS "subcontrato_act_select" ON subcontrato_actividades;
CREATE POLICY "subcontrato_act_select" ON subcontrato_actividades
  FOR SELECT USING (
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    subcontrato_id IN (SELECT id FROM subcontratos)
  );

DROP POLICY IF EXISTS "subcontrato_act_insert" ON subcontrato_actividades;
CREATE POLICY "subcontrato_act_insert" ON subcontrato_actividades
  FOR INSERT WITH CHECK (
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    subcontrato_id IN (SELECT id FROM subcontratos) AND
    -- la actividad debe ser del mismo proyecto que el contrato
    EXISTS (
      SELECT 1 FROM subcontratos s JOIN actividades a ON a.proyecto_id = s.proyecto_id
      WHERE s.id = subcontrato_id AND a.id = actividad_id
    )
  );

DROP POLICY IF EXISTS "subcontrato_act_delete" ON subcontrato_actividades;
CREATE POLICY "subcontrato_act_delete" ON subcontrato_actividades
  FOR DELETE USING (
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    subcontrato_id IN (SELECT id FROM subcontratos)
  );
