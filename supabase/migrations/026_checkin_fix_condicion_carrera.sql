-- ============================================================
-- 026 — Check-in QR: fix condición de carrera en tipo_duplicado
-- ============================================================
-- Confirmado en producción: dos "entrada" seguidas del mismo
-- trabajador quedaron guardadas con la misma hora exacta -- un doble
-- clic/toque mandó dos peticiones casi al mismo tiempo, y ambas
-- alcanzaron a leer "no hay entrada previa" antes de que cualquiera
-- de las dos terminara de insertar su registro (SELECT-antes-de-
-- INSERT sin bloqueo, clásica condición de carrera).
--
-- Fix: pg_advisory_xact_lock sobre el trabajador_id al inicio de la
-- función. Esto obliga a que, si llegan dos peticiones casi
-- simultáneas para el mismo trabajador, la segunda espere a que la
-- primera termine (y su INSERT quede confirmado) antes de hacer su
-- propia verificación -- así si la primera ya registró "entrada", la
-- segunda sí la va a ver y la va a rechazar correctamente.
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
    -- Serializa las peticiones del mismo trabajador: si dos llegan
    -- casi al mismo tiempo, la segunda espera a que la primera
    -- termine (commit) antes de continuar, evitando la carrera.
    PERFORM pg_advisory_xact_lock(hashtext(p_trabajador_id::text));

    -- ¿Este dispositivo ya está vinculado a OTRO trabajador?
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

    -- ¿Ya se registró el mismo tipo como último movimiento de hoy?
    SELECT r.tipo INTO v_ultimo_tipo
    FROM registros_asistencia_qr r
    WHERE r.trabajador_id = p_trabajador_id
      AND r.fecha = v_hoy
    ORDER BY r.hora DESC, r.created_at DESC
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
