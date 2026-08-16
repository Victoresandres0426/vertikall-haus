-- ============================================================
-- 009 — PROYECTO_TRABAJADORES
-- ============================================================
-- Tabla de relación muchos-a-muchos entre proyectos y
-- trabajadores autorizados para check-in QR.
-- El capataz / PM / admin / dueño gestiona el equipo de cada obra.
-- ============================================================

CREATE TABLE IF NOT EXISTS proyecto_trabajadores (
  id            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  proyecto_id   UUID        NOT NULL REFERENCES proyectos(id)    ON DELETE CASCADE,
  trabajador_id UUID        NOT NULL REFERENCES trabajadores(id)  ON DELETE CASCADE,
  autorizado    BOOLEAN     NOT NULL DEFAULT true,
  autorizado_por UUID       REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(proyecto_id, trabajador_id)
);

ALTER TABLE proyecto_trabajadores ENABLE ROW LEVEL SECURITY;

-- SELECT: público (necesario para la página de check-in sin auth)
CREATE POLICY "pt_select_public"
  ON proyecto_trabajadores
  FOR SELECT
  USING (true);

-- INSERT: roles con capacidad de gestión
CREATE POLICY "pt_insert_managers"
  ON proyecto_trabajadores
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   proyectos p
      JOIN   perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE  p.id  = proyecto_trabajadores.proyecto_id
        AND  pu.id = auth.uid()
        AND  pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
        AND  pu.activo = true
    )
  );

-- UPDATE: mismos roles
CREATE POLICY "pt_update_managers"
  ON proyecto_trabajadores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM   proyectos p
      JOIN   perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE  p.id  = proyecto_trabajadores.proyecto_id
        AND  pu.id = auth.uid()
        AND  pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
        AND  pu.activo = true
    )
  );

-- DELETE: mismos roles
CREATE POLICY "pt_delete_managers"
  ON proyecto_trabajadores
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM   proyectos p
      JOIN   perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE  p.id  = proyecto_trabajadores.proyecto_id
        AND  pu.id = auth.uid()
        AND  pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
        AND  pu.activo = true
    )
  );
