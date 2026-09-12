-- ============================================================
-- 066 — Permitir editar y quitar dependencias entre actividades
-- ============================================================
-- dependencias_actividad ya tenía RLS habilitado con políticas de
-- SELECT e INSERT (migraciones 010 y 053), pero nunca se le agregó
-- UPDATE ni DELETE -- hacía falta porque hasta ahora nada en la app
-- editaba o borraba una dependencia ya creada. La nueva vista
-- interactiva del Gantt (/gantt/[id]/editar) permite modificar el tipo/
-- lag de una dependencia existente o quitarla del todo, así que sin
-- estas políticas esas acciones fallarían silenciosamente contra RLS.
--
-- Mismo criterio de acceso que ya usa SELECT/INSERT: la actividad
-- (columna actividad_id, la sucesora) debe pertenecer a un proyecto de
-- la misma empresa y visible para el usuario, y el rol debe ser de los
-- que ya pueden editar el cronograma.

DROP POLICY IF EXISTS "dependencias_actividad_update" ON dependencias_actividad;
CREATE POLICY "dependencias_actividad_update" ON dependencias_actividad
  FOR UPDATE USING (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "dependencias_actividad_delete" ON dependencias_actividad;
CREATE POLICY "dependencias_actividad_delete" ON dependencias_actividad
  FOR DELETE USING (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );
