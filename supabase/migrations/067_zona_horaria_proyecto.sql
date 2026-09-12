-- ============================================================
-- 067 — Zona horaria por proyecto (corrige el corrimiento de ~2h
--        en los registros de asistencia QR de proyectos fuera de
--        Ciudad de México)
-- ============================================================
-- Hasta ahora checkin_registrar() y cerrar_entradas_automaticamente()
-- asumían siempre 'America/Mexico_City' para calcular fecha/hora,
-- sin importar dónde está la obra. Radnor Residence está en North
-- Miami Beach, FL (horario del Este, America/New_York), que en esta
-- época del año está 2 horas adelante de Ciudad de México -- por eso
-- las entradas/salidas se guardaban y mostraban 2 horas antes de la
-- hora real.
-- ============================================================

-- 1. Columna de zona horaria por proyecto (default = comportamiento
--    anterior, para no afectar proyectos que sí están en México).
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS zona_horaria TEXT NOT NULL DEFAULT 'America/Mexico_City';

-- Corrige el proyecto que sabemos que está mal (North Miami Beach, FL).
UPDATE proyectos SET zona_horaria = 'America/New_York' WHERE nombre ILIKE '%Radnor%';

-- 2. cerrar_entradas_automaticamente: usa la zona horaria del proyecto
--    en vez de tenerla fija.
CREATE OR REPLACE FUNCTION cerrar_entradas_automaticamente()
RETURNS void AS $$
DECLARE
  v_registro RECORD;
  v_cierre_ts TIMESTAMPTZ;
  v_horas_trabajadas DECIMAL(5,2);
BEGIN
  FOR v_registro IN
    SELECT r.trabajador_id, r.proyecto_id, r.created_at, r.fecha,
           p.hora_entrada_esperada, p.zona_horaria
    FROM registros_asistencia_qr r
    JOIN proyectos p ON p.id = r.proyecto_id
    WHERE r.tipo = 'entrada'
      AND r.trabajador_id IS NOT NULL
      AND r.created_at > NOW() - INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM registros_asistencia_qr r2
        WHERE r2.trabajador_id = r.trabajador_id
          AND r2.proyecto_id = r.proyecto_id
          AND r2.tipo = 'salida'
          AND r2.created_at > r.created_at
      )
  LOOP
    IF v_registro.hora_entrada_esperada IS NOT NULL THEN
      -- Cierre = hora esperada + 8h, el mismo día de la entrada real,
      -- en la zona horaria del proyecto.
      v_cierre_ts := (v_registro.fecha::timestamp AT TIME ZONE v_registro.zona_horaria)
                      + v_registro.hora_entrada_esperada + INTERVAL '8 hours';
    ELSE
      v_cierre_ts := v_registro.created_at + INTERVAL '8 hours';
    END IF;

    CONTINUE WHEN NOW() < v_cierre_ts;

    v_horas_trabajadas := GREATEST(
      round((EXTRACT(EPOCH FROM (v_cierre_ts - v_registro.created_at)) / 3600.0)::numeric, 2),
      0
    );

    INSERT INTO registros_asistencia_qr (
      proyecto_id, trabajador_id, tipo, fecha, hora,
      cierre_automatico, motivo_cierre, horas_trabajadas, horas_extra
    ) VALUES (
      v_registro.proyecto_id,
      v_registro.trabajador_id,
      'salida',
      (v_cierre_ts AT TIME ZONE v_registro.zona_horaria)::date,
      (v_cierre_ts AT TIME ZONE v_registro.zona_horaria)::time(0),
      true,
      '8_horas',
      v_horas_trabajadas,
      0.00
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. checkin_registrar: usa la zona horaria del proyecto (leída de
--    proyectos.zona_horaria) en vez de 'America/Mexico_City' fijo.
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
  v_zona_horaria TEXT;
  v_distancia DOUBLE PRECISION;
  v_device_dueno UUID;
  v_ultimo_tipo TEXT;
  v_ultima_entrada TIMESTAMPTZ;
  v_hoy DATE;
  v_ahora_hora TIME;
  v_llegada_tarde BOOLEAN := false;
  v_minutos_tarde INTEGER := NULL;
  v_horas_trabajadas DECIMAL(5,2);
  v_horas_extra DECIMAL(5,2);
  v_abierto RECORD;
  v_horas_previas DECIMAL(5,2);
BEGIN
  PERFORM cerrar_entradas_automaticamente();

  SELECT id, (coordenadas->>'lat')::double precision, (coordenadas->>'lng')::double precision,
         hora_entrada_esperada, zona_horaria
  INTO v_proyecto_id, v_proyecto_lat, v_proyecto_lng, v_hora_esperada, v_zona_horaria
  FROM proyectos
  WHERE qr_token = p_qr_token AND activo = true
  LIMIT 1;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'qr_invalido';
  END IF;

  v_hoy := (now() AT TIME ZONE v_zona_horaria)::date;
  v_ahora_hora := (now() AT TIME ZONE v_zona_horaria)::time(0);

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

-- 4. Corrige los registros que YA quedaron mal guardados para este
--    proyecto (recalculando fecha/hora desde created_at, que siempre
--    fue correcto como instante absoluto).
UPDATE registros_asistencia_qr r
SET fecha = (r.created_at AT TIME ZONE 'America/New_York')::date,
    hora  = (r.created_at AT TIME ZONE 'America/New_York')::time(0)
FROM proyectos p
WHERE r.proyecto_id = p.id
  AND p.nombre ILIKE '%Radnor%';
