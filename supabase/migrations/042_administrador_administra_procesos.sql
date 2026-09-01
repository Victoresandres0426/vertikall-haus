-- ============================================================
-- 042 — Administrador puede administrar procesos
-- ============================================================
-- La única política de escritura de "procesos" (pm_dueno_administran_procesos,
-- migración 002) solo cubre project_manager/dueno/superadmin -- a
-- diferencia de "actividades", que ya tiene una política aparte para
-- 'administrador' (migración 014). Este vacío nunca se notó porque
-- hasta ahora nada en la app insertaba procesos directamente; el
-- importador de proyectos por Excel es la primera funcionalidad que
-- lo hace, así que se corrige antes de que cause un fallo confuso.
-- ============================================================

CREATE POLICY "administrador_administra_procesos" ON procesos
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() = 'administrador'
  );
