-- ============================================================
-- 049 — Tarifas por tipo de trabajo (rol) para cada trabajador
-- ============================================================
-- Hasta ahora un trabajador tenía UNA sola tarifa (trabajadores.
-- tarifa_diaria / tarifa_hora), sin importar qué actividad hiciera.
-- Esto no reflejaba casos reales: la misma persona puede ganar
-- distinto si ese día hizo de electricista vs. de ayudante, incluso
-- dentro del mismo proyecto.
--
-- Esta tabla guarda tarifas específicas por (trabajador, rol_obra).
-- Si no existe una fila aquí para el rol con el que se le registró
-- una actividad, se usa trabajadores.tarifa_hora como respaldo (ver
-- función registrar_asistencia_actividad en la migración 050).
--
-- Datos salariales -- mismo nivel de restricción que trabajadores
-- (migración 035): capataz NO puede leerla directamente.
-- ============================================================

CREATE TABLE IF NOT EXISTS tarifas_trabajo (
  id            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  trabajador_id UUID        NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
  rol_obra      TEXT        NOT NULL,
  tarifa_hora   DECIMAL(10,2),
  tarifa_diaria DECIMAL(10,2),
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trabajador_id, rol_obra)
);

CREATE TRIGGER update_tarifas_trabajo_updated_at
  BEFORE UPDATE ON tarifas_trabajo
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE tarifas_trabajo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestion_ve_tarifas_trabajo" ON tarifas_trabajo
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trabajadores t
      WHERE t.id = tarifas_trabajo.trabajador_id
        AND t.empresa_id = get_empresa_id()
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "gestion_administra_tarifas_trabajo" ON tarifas_trabajo
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM trabajadores t
      WHERE t.id = tarifas_trabajo.trabajador_id
        AND t.empresa_id = get_empresa_id()
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trabajadores t
      WHERE t.id = tarifas_trabajo.trabajador_id
        AND t.empresa_id = get_empresa_id()
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );
