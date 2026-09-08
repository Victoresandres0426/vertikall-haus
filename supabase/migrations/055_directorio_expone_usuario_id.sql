-- ============================================================
-- 055 — trabajadores_directorio_empresa() también expone
--        usuario_id y el ROL de la cuenta vinculada
-- ============================================================
-- El Reporte Diario necesita saber qué trabajadores están vinculados a
-- una cuenta del sistema, y de qué rol, para bloquear la edición manual
-- de horas SOLO cuando ese rol es "capataz" (el capataz sí supervisa la
-- obra en sitio, así que sus horas deben salir estrictamente del
-- check-in QR). Un trabajador vinculado a una cuenta "project_manager"
-- NO se bloquea: el PM no está obligado a estar físicamente en la obra,
-- así que sus horas de campo (si hace alguna tarea puntual) se siguen
-- reportando a mano como cualquier trabajador normal.
--
-- Ninguno de estos datos es sensible (no es salario ni información
-- personal), así que es seguro agregarlos a esta función -- que ya
-- expone campos no sensibles a cualquier usuario autenticado de la
-- empresa (migración 035), incluido un capataz llenando su propio
-- reporte.
--
-- Hay que hacer DROP porque Postgres no permite CREATE OR REPLACE
-- cuando cambian las columnas de retorno de una función.
-- ============================================================

DROP FUNCTION IF EXISTS trabajadores_directorio_empresa();

CREATE FUNCTION trabajadores_directorio_empresa()
RETURNS TABLE (
  id UUID,
  nombre_completo TEXT,
  codigo TEXT,
  rol_obra TEXT,
  especialidad TEXT,
  nivel_experiencia TEXT,
  activo BOOLEAN,
  usuario_id UUID,
  usuario_rol TEXT
) AS $$
  SELECT
    t.id, t.nombre_completo, t.codigo, t.rol_obra, t.especialidad,
    t.nivel_experiencia, t.activo, t.usuario_id, pu.rol
  FROM trabajadores t
  LEFT JOIN perfiles_usuario pu ON pu.id = t.usuario_id
  WHERE t.empresa_id = get_empresa_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION trabajadores_directorio_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trabajadores_directorio_empresa() TO authenticated;
