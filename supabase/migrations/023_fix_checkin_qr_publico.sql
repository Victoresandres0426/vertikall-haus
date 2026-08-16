-- ============================================================
-- 023 — Fix: check-in QR no funcionaba para usuarios anónimos
-- ============================================================
-- La página /check-in/[token] la usan trabajadores SIN sesión
-- iniciada (escanean el QR desde su celular). Pero consultaba
-- directamente las tablas proyectos y trabajadores, que tienen RLS
-- restringido a usuarios autenticados de la misma empresa -- así que
-- para un anónimo, esas consultas no devuelven nada y la página
-- queda en blanco / "QR no válido" siempre.
--
-- En vez de abrir proyectos y trabajadores completos al público (lo
-- cual expondría presupuesto_venta, margen_objetivo, tarifa_diaria,
-- tarifa_hora, etc. a cualquiera con la anon key), se exponen dos
-- funciones SECURITY DEFINER que devuelven solo las columnas
-- necesarias para el check-in.
-- ============================================================

CREATE OR REPLACE FUNCTION checkin_datos_proyecto(p_qr_token UUID)
RETURNS TABLE(
  proyecto_id UUID,
  nombre TEXT,
  codigo TEXT,
  ubicacion TEXT
) AS $$
  SELECT p.id, p.nombre, p.codigo, p.ubicacion
  FROM proyectos p
  WHERE p.qr_token = p_qr_token AND p.activo = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION checkin_datos_proyecto(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_datos_proyecto(UUID) TO anon, authenticated;

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
    SELECT t.id, t.nombre_completo, t.rol_obra
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

REVOKE ALL ON FUNCTION checkin_trabajadores_disponibles(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_trabajadores_disponibles(UUID) TO anon, authenticated;
