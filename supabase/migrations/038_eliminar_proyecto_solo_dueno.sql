-- ============================================================
-- 038 — Eliminar (archivar) proyecto: solo el dueño
-- ============================================================
-- eliminarProyecto() hacía un UPDATE directo (activo = false), lo
-- cual pasaba por la política general "pm_dueno_actualizan_proyectos"
-- (project_manager, administrador, dueno, superadmin) -- la MISMA
-- política que permite editar campos normales del proyecto (email,
-- teléfono, coordenadas, hora de entrada). No se puede restringir
-- solo el "borrado" a nivel de RLS sin afectar esas otras ediciones
-- legítimas de PM/administrador, porque RLS no distingue qué campo
-- se está cambiando.
--
-- Por eso el archivado del proyecto ahora pasa por una función
-- dedicada, restringida explícitamente a 'dueno', que dispara
-- excepción si cualquier otro rol la invoca -- las demás ediciones
-- del proyecto siguen igual que antes para PM/administrador.
-- ============================================================

CREATE OR REPLACE FUNCTION eliminar_proyecto_seguro(p_proyecto_id UUID)
RETURNS void AS $$
DECLARE
  v_empresa_id UUID;
BEGIN
  IF get_rol_usuario() <> 'dueno' THEN
    RAISE EXCEPTION 'solo_el_dueno_puede_eliminar';
  END IF;

  SELECT empresa_id INTO v_empresa_id FROM proyectos WHERE id = p_proyecto_id;

  IF v_empresa_id IS NULL OR v_empresa_id <> get_empresa_id() THEN
    RAISE EXCEPTION 'proyecto_no_encontrado';
  END IF;

  UPDATE proyectos SET activo = false WHERE id = p_proyecto_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION eliminar_proyecto_seguro(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eliminar_proyecto_seguro(UUID) TO authenticated;
