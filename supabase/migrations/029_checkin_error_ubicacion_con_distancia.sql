-- ============================================================
-- 029 — Check-in QR: incluir la distancia calculada en el error
-- ============================================================
-- Diagnosticado en producción: un signo de longitud invertido (80.43
-- en vez de -80.43) mandaba el punto del proyecto al otro lado del
-- mundo, y el único síntoma era "fuera_de_ubicacion" sin más detalle
-- -- hubo que consultar la base de datos directamente para
-- encontrarlo. Ahora el mensaje de error incluye los km calculados,
-- para detectar este tipo de error de captura al instante.
-- ============================================================

DROP FUNCTION IF EXISTS checkin_registrar(UUID, UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION checkin_registrar(
  p_qr_token UUID,
  p_device_token UUID,
  p_trabajador_id UUID,
  p_nombre_manual TEXT,
  p_tipo TEXT,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_proyecto_id UUID;
  v_proyecto_lat DOUBLE PRECISION;
  v_proyecto_lng DOUBLE PRECISION;
  v_distancia DOUBLE PRECISION;
  v_device_dueno UUID;
  v_ultimo_tipo TEXT;
  v_hoy DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  PERFORM cerrar_entradas_automaticamente();

  SELECT id, (coordenadas->>'lat')::double precision, (coordenadas->>'lng')::double precision
  INTO v_proyecto_id, v_proyecto_lat, v_proyecto_lng
  FROM proyectos
  WHERE qr_token = p_qr_token AND activo = true
  LIMIT 1;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'qr_invalido';
  END IF;

  IF p_tipo NOT IN ('entrada', 'salida') THEN
    RAISE EXCEPTION 'tipo_invalido';
  END IF;

  IF v_proyecto_lat IS NOT NULL AND v_proyecto_lng IS NOT NULL THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'ubicacion_requerida';
    END IF;

    v_distancia := distancia_metros(p_lat, p_lng, v_proyecto_lat, v_proyecto_lng);
    IF v_distancia > 200 THEN
      RAISE EXCEPTION 'fuera_de_ubicacion:%', round((v_distancia / 1000)::numeric, 1);
    END IF;
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

REVOKE ALL ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
