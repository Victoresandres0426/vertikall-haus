-- ============================================================
-- 043 — Soporte para el editor de actividades/proyecto
-- ============================================================
-- 1) Costo de material y mano de obra por separado en "actividades"
--    (el importador de Excel ya los distingue; ahora el editor
--    manual también puede tocarlos sin pasar por partidas_presupuesto).
-- 2) Cierra un vacío de RLS nunca notado antes: "administrador" podía
--    administrar procesos (migración 042) y actividades (migración 014)
--    pero NO podía crear ni actualizar la fila de "proyectos" en sí
--    (nombre, cliente, presupuesto, etc.) — solo project_manager/
--    dueno/superadmin estaban en esas políticas. El nuevo editor de
--    datos del proyecto es la primera funcionalidad que expone esto.
-- ============================================================

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS costo_material DECIMAL(15,2) DEFAULT 0;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS costo_mano_obra DECIMAL(15,2) DEFAULT 0;

DROP POLICY IF EXISTS "pm_dueno_crean_proyectos" ON proyectos;
CREATE POLICY "pm_dueno_crean_proyectos" ON proyectos
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "pm_dueno_actualizan_proyectos" ON proyectos;
CREATE POLICY "pm_dueno_actualizan_proyectos" ON proyectos
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  ) WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );
