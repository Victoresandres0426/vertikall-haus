-- ============================================================
-- 058 — administrador también puede cambiar rol/activar-desactivar
--        cuentas del equipo (no solo dueno/superadmin)
-- ============================================================
-- Hasta ahora, la política "dueno_administra_usuarios" solo dejaba a
-- dueno/superadmin actualizar perfiles_usuario de otros. Pero invitar
-- usuarios (tabla invitaciones) ya estaba permitido también para
-- administrador -- esta migración empareja ese mismo nivel de acceso
-- para editar cuentas ya existentes (cambiar de rol, desactivar), que
-- ahora tiene UI en Configuración.
--
-- La app (actualizarRolUsuario / cambiarActivoUsuario en
-- configuracion/actions.ts) ya impone las guardas de seguridad: un
-- administrador no puede tocar cuentas de dueño/superadmin ni asignar
-- esos roles, y nadie puede desactivar o degradar al único dueño activo
-- de la empresa. Esta migración solo abre la puerta a nivel de RLS;
-- las guardas de negocio siguen viviendo en la app.
-- ============================================================

DROP POLICY IF EXISTS "dueno_administra_usuarios" ON perfiles_usuario;

CREATE POLICY "gestion_administra_usuarios" ON perfiles_usuario
  FOR ALL USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );
