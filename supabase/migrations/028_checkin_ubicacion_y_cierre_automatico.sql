-- ============================================================
-- 028 — Check-in QR: validar ubicación + cerrar entradas abiertas a las 8h
-- ============================================================
-- 1. UBICACIÓN: si un proyecto tiene coordenadas GPS configuradas
--    (proyectos.coordenadas = {lat, lng}), el check-in exige que el
--    celular esté a menos de 200m de esa ubicación. Si el proyecto no
--    tiene coordenadas cargadas, no se valida (opt-in por proyecto).
--
-- 2. CIERRE AUTOMÁTICO: una salida 100% automática por "se alejó del
--    sitio" no es viable en un sitio web (el navegador deja de dar
--    ubicación en cuanto se apaga la pantalla). En su lugar: si una
--    entrada lleva más de 8 horas sin su salida correspondiente, el
--    sistema genera la salida automáticamente marcada como tal
--    (cierre_automatico = true), con la hora = entrada + 8h.
--    Se ejecuta oportunistamente en cada carga de la página de
--    check-in, y además se intenta programar por pg_cron cada 30 min
--    (si la extensión está disponible).
-- ============================================================

ALTER TABLE registros_asistencia_qr ADD COLUMN IF NOT EXISTS cierre_automatico BOOLEAN DEFAULT FALSE;

-- ── Distancia entre dos puntos GPS (fórmula haversine, en metros) ──
CREATE OR REPLACE FUNCTION distancia_metros(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
  SELECT 6371000 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$ LANGUAGE sql IMMUTABLE;

-- ── Cierre automático de entradas abiertas por más de 8 horas ──────
CREATE OR REPLACE FUNCTION cerrar_entradas_automaticamente()
RETURNS void AS $$
DECLARE
  v_registro RECORD;
  v_cierre_ts TIMESTAMPTZ;
BEGIN
  FOR v_registro IN
    SELECT r.trabajador_id, r.proyecto_id, r.created_at
    FROM registros_asistencia_qr r
    WHERE r.tipo = 'entrada'
      AND r.trabajador_id IS NOT NULL
      AND r.created_at < NOW() - INTERVAL '8 hours'
      AND NOT EXISTS (
        SELECT 1 FROM registros_asistencia_qr r2
        WHERE r2.trabajador_id = r.trabajador_id
          AND r2.proyecto_id = r.proyecto_id
          AND r2.tipo = 'salida'
          AND r2.created_at > r.created_at
      )
  LOOP
    v_cierre_ts := v_registro.created_at + INTERVAL '8 hours';
    INSERT INTO registros_asistencia_qr (proyecto_id, trabajador_id, tipo, fecha, hora, cierre_automatico)
    VALUES (
      v_registro.proyecto_id,
      v_registro.trabajador_id,
      'salida',
      (v_cierre_ts AT TIME ZONE 'America/Mexico_City')::date,
      (v_cierre_ts AT TIME ZONE 'America/Mexico_City')::time(0),
      true
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION cerrar_entradas_automaticamente() FROM PUBLIC;

-- ── checkin_registrar: agrega validación de ubicación + limpieza oportunista ──
DROP FUNCTION IF EXISTS checkin_registrar(UUID, UUID, UUID, TEXT, TEXT);

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
  -- Limpieza oportunista: cierra entradas de más de 8h sin salida.
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

  -- Validación de ubicación: solo si el proyecto tiene coordenadas configuradas.
  IF v_proyecto_lat IS NOT NULL AND v_proyecto_lng IS NOT NULL THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'ubicacion_requerida';
    END IF;

    v_distancia := distancia_metros(p_lat, p_lng, v_proyecto_lat, v_proyecto_lng);
    IF v_distancia > 200 THEN
      RAISE EXCEPTION 'fuera_de_ubicacion';
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

-- ── pg_cron: respaldo en segundo plano cada 30 min (best-effort) ──
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'cerrar-entradas-8h',
    '*/30 * * * *',
    $cron$SELECT cerrar_entradas_automaticamente();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar pg_cron para el cierre automático -- igual funciona de forma oportunista en cada check-in.';
END $$;
