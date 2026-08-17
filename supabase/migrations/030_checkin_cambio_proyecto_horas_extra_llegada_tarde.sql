-- ============================================================
-- 030 — Check-in QR: cambio de proyecto, horas extra, llegada tarde
-- ============================================================
-- 1. CAMBIO DE PROYECTO: si alguien tiene una entrada abierta (sin
--    salida) en el Proyecto A y registra entrada en el Proyecto B, se
--    cierra automáticamente la entrada de A (motivo_cierre =
--    'cambio_proyecto'), con la hora = el momento en que registró la
--    nueva entrada en B.
--
-- 2. HORAS EXTRA: al registrar una salida manual (desde el sitio, no
--    el cierre automático de 8h), se calculan horas_trabajadas desde
--    la entrada correspondiente; lo que pase de 8h queda en
--    horas_extra. El cierre automático de 8h también queda marcado
--    con horas_trabajadas=8, horas_extra=0 (por definición, se cerró
--    justo a las 8h).
--
-- 3. LLEGADA TARDE: cada proyecto puede tener una hora de entrada
--    esperada (opt-in, como las coordenadas). Si el check-in de
--    "entrada" llega más de 15 minutos después, se marca
--    llegada_tarde=true con los minutos de retraso.
-- ============================================================

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS hora_entrada_esperada TIME;

ALTER TABLE registros_asistencia_qr ADD COLUMN IF NOT EXISTS motivo_cierre TEXT;
ALTER TABLE registros_asistencia_qr ADD COLUMN IF NOT EXISTS llegada_tarde BOOLEAN DEFAULT FALSE;
ALTER TABLE registros_asistencia_qr ADD COLUMN IF NOT EXISTS minutos_tarde INTEGER;
ALTER TABLE registros_asistencia_qr ADD COLUMN IF NOT EXISTS horas_trabajadas DECIMAL(5,2);
ALTER TABLE registros_asistencia_qr ADD COLUMN IF NOT EXISTS horas_extra DECIMAL(5,2);

-- ── Cierre automático de 8h: ahora también calcula horas ───────────
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
    INSERT INTO registros_asistencia_qr (
      proyecto_id, trabajador_id, tipo, fecha, hora,
      cierre_automatico, motivo_cierre, horas_trabajadas, horas_extra
    ) VALUES (
      v_registro.proyecto_id,
      v_registro.trabajador_id,
      'salida',
      (v_cierre_ts AT TIME ZONE 'America/Mexico_City')::date,
      (v_cierre_ts AT TIME ZONE 'America/Mexico_City')::time(0),
      true,
      '8_horas',
      8.00,
      0.00
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── checkin_registrar: versión completa con las 3 validaciones nuevas ──
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
  v_hora_esperada TIME;
  v_distancia DOUBLE PRECISION;
  v_device_dueno UUID;
  v_ultimo_tipo TEXT;
  v_ultima_entrada TIMESTAMPTZ;
  v_hoy DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_ahora_hora TIME := (now() AT TIME ZONE 'America/Mexico_City')::time(0);
  v_llegada_tarde BOOLEAN := false;
  v_minutos_tarde INTEGER := NULL;
  v_horas_trabajadas DECIMAL(5,2);
  v_horas_extra DECIMAL(5,2);
  v_abierto RECORD;
  v_horas_previas DECIMAL(5,2);
BEGIN
  PERFORM cerrar_entradas_automaticamente();

  SELECT id, (coordenadas->>'lat')::double precision, (coordenadas->>'lng')::double precision, hora_entrada_esperada
  INTO v_proyecto_id, v_proyecto_lat, v_proyecto_lng, v_hora_esperada
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

    -- Último movimiento de HOY en ESTE proyecto (para bloquear duplicados
    -- y, si es "salida", saber desde cuándo contar las horas).
    SELECT r.tipo, r.created_at INTO v_ultimo_tipo, v_ultima_entrada
    FROM registros_asistencia_qr r
    WHERE r.trabajador_id = p_trabajador_id
      AND r.proyecto_id = v_proyecto_id
      AND r.fecha = v_hoy
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_ultimo_tipo IS NOT NULL AND v_ultimo_tipo = p_tipo THEN
      RAISE EXCEPTION 'tipo_duplicado';
    END IF;

    IF p_tipo = 'entrada' THEN
      -- Cambio de proyecto: cierra cualquier entrada abierta en OTRO
      -- proyecto, con la hora de este nuevo check-in.
      FOR v_abierto IN
        SELECT r.proyecto_id, r.created_at
        FROM registros_asistencia_qr r
        WHERE r.trabajador_id = p_trabajador_id
          AND r.proyecto_id <> v_proyecto_id
          AND r.tipo = 'entrada'
          AND r.fecha = v_hoy
          AND NOT EXISTS (
            SELECT 1 FROM registros_asistencia_qr r2
            WHERE r2.trabajador_id = r.trabajador_id
              AND r2.proyecto_id = r.proyecto_id
              AND r2.tipo = 'salida'
              AND r2.created_at > r.created_at
          )
      LOOP
        v_horas_previas := round((EXTRACT(EPOCH FROM (NOW() - v_abierto.created_at)) / 3600.0)::numeric, 2);
        INSERT INTO registros_asistencia_qr (
          proyecto_id, trabajador_id, tipo, fecha, hora,
          cierre_automatico, motivo_cierre, horas_trabajadas, horas_extra
        ) VALUES (
          v_abierto.proyecto_id, p_trabajador_id, 'salida',
          v_hoy, v_ahora_hora,
          true, 'cambio_proyecto',
          v_horas_previas, GREATEST(v_horas_previas - 8, 0)
        );
      END LOOP;

      -- Llegada tarde (si el proyecto tiene hora de entrada configurada).
      IF v_hora_esperada IS NOT NULL THEN
        v_minutos_tarde := GREATEST(0, (EXTRACT(EPOCH FROM (v_ahora_hora - v_hora_esperada)) / 60))::int;
        v_llegada_tarde := v_minutos_tarde > 15;
      END IF;
    END IF;

    IF p_tipo = 'salida' AND v_ultima_entrada IS NOT NULL THEN
      v_horas_trabajadas := round((EXTRACT(EPOCH FROM (NOW() - v_ultima_entrada)) / 3600.0)::numeric, 2);
      v_horas_extra := GREATEST(v_horas_trabajadas - 8, 0);
    END IF;
  END IF;

  INSERT INTO registros_asistencia_qr (
    proyecto_id, trabajador_id, nombre_manual, tipo, fecha, hora,
    llegada_tarde, minutos_tarde, horas_trabajadas, horas_extra
  )
  VALUES (
    v_proyecto_id,
    p_trabajador_id,
    p_nombre_manual,
    p_tipo,
    v_hoy,
    v_ahora_hora,
    v_llegada_tarde,
    v_minutos_tarde,
    v_horas_trabajadas,
    v_horas_extra
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
