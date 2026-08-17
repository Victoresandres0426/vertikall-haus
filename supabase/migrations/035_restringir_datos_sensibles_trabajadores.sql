-- ============================================================
-- 035 — Restringir tarifas y datos personales de trabajadores
-- ============================================================
-- Hallazgo de auditoría: la política "usuarios_ven_trabajadores"
-- (migración 005) permite SELECT completo de la tabla trabajadores
-- a CUALQUIER usuario autenticado de la empresa, sin importar su rol.
-- Eso incluye tarifa_diaria/tarifa_hora (salario) y, desde la
-- migración 034, teléfono personal, dirección y contacto de
-- emergencia — visibles hoy incluso para un 'capataz'.
--
-- Esta migración:
-- 1. Restringe el SELECT completo de trabajadores a roles de
--    gestión (administrador, project_manager, dueno, superadmin).
-- 2. Crea una función pública "trabajadores_directorio_empresa()"
--    que expone SOLO los campos no sensibles (nombre, código, rol
--    en obra, especialidad, nivel, activo) para cualquier usuario
--    autenticado de la empresa — la usan las páginas que solo
--    necesitan mostrar nombres de equipo (Reporte Diario, detalle
--    de proyecto), sin filtrar por rol específico.
-- ============================================================

DROP POLICY IF EXISTS "usuarios_ven_trabajadores" ON trabajadores;

CREATE POLICY "gestion_ve_trabajadores" ON trabajadores
  FOR SELECT USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

CREATE OR REPLACE FUNCTION trabajadores_directorio_empresa()
RETURNS TABLE (
  id UUID,
  nombre_completo TEXT,
  codigo TEXT,
  rol_obra TEXT,
  especialidad TEXT,
  nivel_experiencia TEXT,
  activo BOOLEAN
) AS $$
  SELECT t.id, t.nombre_completo, t.codigo, t.rol_obra, t.especialidad, t.nivel_experiencia, t.activo
  FROM trabajadores t
  WHERE t.empresa_id = get_empresa_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION trabajadores_directorio_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trabajadores_directorio_empresa() TO authenticated;
