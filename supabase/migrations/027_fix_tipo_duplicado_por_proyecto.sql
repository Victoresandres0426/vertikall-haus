-- ============================================================
-- 027 — Fix real del bug de tipo_duplicado
-- ============================================================
-- Diagnosticado en producción: la validación de "no repetir entrada/
-- salida" buscaba el último movimiento del trabajador en CUALQUIER
-- proyecto (no solo el proyecto actual), y decidía cuál era "el
-- último" ordenando por la columna `hora` -- que no es confiable
-- para eso cuando hay registros de distintos proyectos/pruebas
-- mezclados en el mismo día. Terminaba comparando contra un registro
-- de OTRO proyecto con un valor de hora más alto, dejando pasar
-- duplicados en el proyecto real.
--
-- Fix:
--  1. La validación ahora compara solo contra registros del MISMO
--     proyecto (WHERE proyecto_id = v_proyecto_id también).
--  2. Se ordena por created_at (el momento real en que Postgres
--     insertó la fila -- siempre confiable y creciente) en vez de
--     por hora.
-- ============================================================

CREATE OR REPLACE FUNCTION checkin_registrar(
  p_qr_token UUID,
  p_device_token UUID,
  p_trabajador_id UUID,
  p_nombre_manual TEXT,
  p_tipo TEXT
) RETURNS void AS $$
DECLARE
  v_proyecto_id UUID;
  v_device_dueno UUID;
  v_ultimo_tipo TEXT;
  v_hoy DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  SELECT id INTO v_proyecto_id
  FROM proyectos
  WHERE qr_token = p_qr_token AND activo = true
  LIMIT 1;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'qr_invalido';
  END IF;

  IF p_tipo NOT IN ('entrada', 'salida') THEN
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  IF p_trabajador_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_trabajador_id::text));

    SELECT trabajador_id INTO v_device_dueno
    FROM trabajador_dispositivos
    WHERE device_token = p_device_token
    LIMIT 1;

    IF v_device_dueno IS NOT NULL AND v_device_dueno <> p_trabajador_id THEN
      RAISE EXCEPTION 'dispositivo_vinculado_a_otro';
    END IF;

    IF v_device_dueno IS NULL THEN
      INSERT INTO trabajador_dispositivos (trabajador_id, device_token)
      VALUES (p_trabajador_id, p_device_token)
      ON CONFLICT (device_token) DO NOTHING;
    END IF;

    -- Último movimiento de HOY, en ESTE proyecto, ordenado por el
    -- momento real de inserción (no por la columna hora).
    SELECT r.tipo INTO v_ultimo_tipo
    FROM registros_asistencia_qr r
    WHERE r.trabajador_id = p_trabajador_id
      AND r.proyecto_id = v_proyecto_id
      AND r.fecha = v_hoy
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_ultimo_tipo IS NOT NULL AND v_ultimo_tipo = p_tipo THEN
      RAISE EXCEPTION 'tipo_duplicado';
    END IF;
  END IF;

  INSERT INTO registros_asistencia_qr (proyecto_id, trabajador_id, nombre_manual, tipo, fecha, hora)
  VALUES (
    v_proyecto_id,
    p_trabajador_id,
    p_nombre_manual,
    p_tipo,
    v_hoy,
    (now() AT TIME ZONE 'America/Mexico_City')::time(0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT) TO anon, authenticated;

-- checkin_dispositivo_vinculado también debe reflejar el último tipo
-- POR PROYECTO -- pero como esa función no recibe el proyecto (solo
-- el device_token), se actualiza para aceptar también el qr_token y
-- así preseleccionar correctamente el movimiento en la página.
DROP FUNCTION IF EXISTS checkin_dispositivo_vinculado(UUID);

CREATE OR REPLACE FUNCTION checkin_dispositivo_vinculado(p_device_token UUID, p_qr_token UUID)
RETURNS TABLE(trabajador_id UUID, nombre_completo TEXT, ultimo_tipo TEXT) AS $$
  SELECT
    t.id,
    t.nombre_completo,
    (
      SELECT r.tipo FROM registros_asistencia_qr r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.trabajador_id = t.id
        AND p.qr_token = p_qr_token
        AND r.fecha = (now() AT TIME ZONE 'America/Mexico_City')::date
      ORDER BY r.created_at DESC
      LIMIT 1
    ) AS ultimo_tipo
  FROM trabajador_dispositivos td
  JOIN trabajadores t ON t.id = td.trabajador_id
  WHERE td.device_token = p_device_token
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION checkin_dispositivo_vinculado(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_dispositivo_vinculado(UUID, UUID) TO anon, authenticated;
