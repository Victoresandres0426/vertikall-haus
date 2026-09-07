-- ============================================================
-- 048 — Rol del trabajador específico por proyecto
-- ============================================================
-- Hasta ahora trabajadores.rol_obra era un solo valor global —
-- si alguien es electricista en una obra y ayudante en otra, no
-- había forma de reflejarlo. Se agrega una columna en
-- proyecto_trabajadores que, cuando tiene un valor, sobreescribe
-- (solo para ese proyecto) el rol general de Personal. Si queda
-- en NULL, se sigue usando el rol general como respaldo.
-- ============================================================

ALTER TABLE proyecto_trabajadores ADD COLUMN IF NOT EXISTS rol_obra_proyecto TEXT;

-- La función de check-in también debe preferir el rol específico
-- del proyecto sobre el general, cuando exista.
CREATE OR REPLACE FUNCTION checkin_trabajadores_disponibles(p_qr_token UUID)
RETURNS TABLE(
  trabajador_id UUID,
  nombre_completo TEXT,
  rol_obra TEXT
) AS $$
DECLARE
  v_proyecto_id UUID;
  v_empresa_id UUID;
  v_hay_autorizados BOOLEAN;
BEGIN
  SELECT p.id, p.empresa_id INTO v_proyecto_id, v_empresa_id
  FROM proyectos p
  WHERE p.qr_token = p_qr_token AND p.activo = true
  LIMIT 1;

  IF v_proyecto_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM proyecto_trabajadores pt
    WHERE pt.proyecto_id = v_proyecto_id AND pt.autorizado = true
  ) INTO v_hay_autorizados;

  IF v_hay_autorizados THEN
    -- Solo el equipo autorizado por el capataz para este proyecto
    RETURN QUERY
    SELECT t.id, t.nombre_completo, COALESCE(pt.rol_obra_proyecto, t.rol_obra)
    FROM proyecto_trabajadores pt
    JOIN trabajadores t ON t.id = pt.trabajador_id
    WHERE pt.proyecto_id = v_proyecto_id AND pt.autorizado = true
    ORDER BY t.nombre_completo;
  ELSE
    -- Sin equipo configurado aún: mostrar todos los activos de la empresa
    RETURN QUERY
    SELECT t.id, t.nombre_completo, t.rol_obra
    FROM trabajadores t
    WHERE t.empresa_id = v_empresa_id AND t.activo = true
    ORDER BY t.nombre_completo;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
