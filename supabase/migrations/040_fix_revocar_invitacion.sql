-- ============================================================
-- 040 — Fix: revocar invitación nunca funcionaba
-- ============================================================
-- La política "sistema_actualiza_invitaciones" (migración 006) solo
-- tenía USING (activa = true), sin WITH CHECK. En Postgres, cuando
-- una política de UPDATE no define WITH CHECK, se reutiliza la misma
-- expresión de USING para validar la fila DESPUÉS del update -- pero
-- revocar una invitación implica poner activa = false, así que la
-- fila resultante nunca pasaba su propia condición (activa = true) y
-- Postgres rechazaba el UPDATE sin que la app mostrara ningún error.
--
-- De paso, se acota la política a solo roles de gestión de la misma
-- empresa (antes cualquier usuario autenticado podía revocar
-- invitaciones de cualquier empresa).
-- ============================================================

DROP POLICY IF EXISTS "sistema_actualiza_invitaciones" ON invitaciones;

CREATE POLICY "gestion_actualiza_invitaciones" ON invitaciones
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  )
  WITH CHECK (
    empresa_id = get_empresa_id()
  );
