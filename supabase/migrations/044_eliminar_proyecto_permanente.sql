-- ============================================================
-- 044 — "Eliminar proyecto" ahora borra permanentemente
-- ============================================================
-- Hasta ahora eliminar_proyecto_seguro() (migración 038) hacía un
-- archivado lógico (activo = false). A partir de esta migración,
-- borra la fila del proyecto de verdad — sigue restringido solo al
-- rol 'dueno'. Es IRREVERSIBLE: se van también, por cascada, todos
-- los procesos, actividades, presupuestos, reportes, costos,
-- alertas, archivos, etc. de ese proyecto.
--
-- Dos tablas referenciaban proyecto_id sin ON DELETE CASCADE
-- (nunca se notó porque nunca se había intentado un borrado real,
-- solo el archivado lógico): notificaciones y equipos_reserva. Se
-- corrigen aquí para que el borrado no falle por llave foránea.
-- ============================================================

ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_proyecto_id_fkey;
ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_proyecto_id_fkey
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;

ALTER TABLE equipos_reserva DROP CONSTRAINT IF EXISTS equipos_reserva_proyecto_id_fkey;
ALTER TABLE equipos_reserva
  ADD CONSTRAINT equipos_reserva_proyecto_id_fkey
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE;

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

  DELETE FROM proyectos WHERE id = p_proyecto_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
