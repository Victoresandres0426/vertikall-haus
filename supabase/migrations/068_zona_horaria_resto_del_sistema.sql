-- ============================================================
-- 068 — Zona horaria del proyecto: resto de funciones que
--        asumían 'America/Mexico_City'
-- ============================================================
-- Continúa 067: además de checkin_registrar/cerrar_entradas_
-- automaticamente, dos funciones más calculaban "hoy" fijas a
-- Ciudad de México:
--   - checkin_datos_proyecto: no calculaba fecha, pero no exponía
--     zona_horaria, que ahora necesita el cliente (/mi-obra/.../
--     desempeno) para saber qué día resaltar como "hoy".
--   - checkin_desempeno_semana: calculaba "hoy" y "lunes de esta
--     semana" fijos a México -- en un proyecto en otra zona esto
--     podía mostrar la semana equivocada cerca de la medianoche.
-- ============================================================

-- 1. checkin_datos_proyecto: agrega zona_horaria al resultado.
DROP FUNCTION IF EXISTS checkin_datos_proyecto(UUID);

CREATE OR REPLACE FUNCTION checkin_datos_proyecto(p_qr_token UUID)
RETURNS TABLE(
  proyecto_id UUID,
  nombre TEXT,
  codigo TEXT,
  ubicacion TEXT,
  zona_horaria TEXT
) AS $$
  SELECT p.id, p.nombre, p.codigo, p.ubicacion, p.zona_horaria
  FROM proyectos p
  WHERE p.qr_token = p_qr_token AND p.activo = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION checkin_datos_proyecto(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_datos_proyecto(UUID) TO anon, authenticated;

-- 2. checkin_desempeno_semana: usa la zona horaria del proyecto para
--    calcular "hoy" y el lunes de la semana en curso.
CREATE OR REPLACE FUNCTION checkin_desempeno_semana(p_qr_token UUID, p_device_token UUID)
RETURNS TABLE(fecha DATE, horas NUMERIC, costo NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_trabajador_id UUID;
  v_zona_horaria TEXT;
  v_hoy DATE;
  v_lunes DATE;
BEGIN
  SELECT id, zona_horaria INTO v_proyecto_id, v_zona_horaria
  FROM proyectos
  WHERE qr_token = p_qr_token AND activo = true
  LIMIT 1;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'qr_invalido';
  END IF;

  v_hoy := (now() AT TIME ZONE COALESCE(v_zona_horaria, 'America/New_York'))::date;
  v_lunes := v_hoy - (EXTRACT(ISODOW FROM v_hoy)::int - 1);

  SELECT td.trabajador_id INTO v_trabajador_id
  FROM trabajador_dispositivos td
  WHERE td.device_token = p_device_token
  LIMIT 1;

  IF v_trabajador_id IS NULL THEN
    RAISE EXCEPTION 'dispositivo_no_vinculado';
  END IF;

  RETURN QUERY
  SELECT
    gs.dia::date AS fecha,
    COALESCE(sub.horas, 0)::numeric AS horas,
    COALESCE(sub.costo, 0)::numeric AS costo
  FROM generate_series(v_lunes, v_hoy, interval '1 day') AS gs(dia)
  LEFT JOIN (
    SELECT r.fecha, SUM(aad.horas) AS horas, SUM(aad.costo) AS costo
    FROM asistencia_actividad_diaria aad
    JOIN reportes_diarios r ON r.id = aad.reporte_id
    WHERE aad.trabajador_id = v_trabajador_id
      AND r.fecha BETWEEN v_lunes AND v_hoy
    GROUP BY r.fecha
  ) sub ON sub.fecha = gs.dia::date
  ORDER BY gs.dia;
END;
$$;

REVOKE ALL ON FUNCTION checkin_desempeno_semana(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_desempeno_semana(UUID, UUID) TO anon, authenticated;
