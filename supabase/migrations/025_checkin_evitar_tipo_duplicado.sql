-- ============================================================
-- 025 — Check-in QR: no permitir dos "entrada" o dos "salida" seguidas
-- ============================================================
-- El candado de dispositivo (024) evita que un celular marque a otra
-- persona, pero no evitaba que la MISMA persona marcara "entrada"
-- varias veces seguidas sin una "salida" en medio (o viceversa).
--
-- checkin_registrar ahora revisa el último registro del trabajador
-- en el día (hora local de la obra) y rechaza si el tipo es igual al
-- que se está intentando registrar.
--
-- Nota: esta validación solo aplica a trabajadores con trabajador_id
-- (de la lista); los registros manuales (nombre escrito a mano) no
-- tienen un identificador estable para compararlos de forma
-- confiable, igual que ya ocurría con el candado de dispositivo.
-- ============================================================

-- checkin_dispositivo_vinculado ahora también devuelve el último tipo
-- registrado hoy, para que la página pueda preseleccionar "entrada" o
-- "salida" correctamente y evitar que el usuario choque con el error.
-- Postgres no permite CREATE OR REPLACE si cambian las columnas de
-- retorno, así que hay que soltarla primero.
DROP FUNCTION IF EXISTS checkin_dispositivo_vinculado(UUID);

CREATE OR REPLACE FUNCTION checkin_dispositivo_vinculado(p_device_token UUID)
RETURNS TABLE(trabajador_id UUID, nombre_completo TEXT, ultimo_tipo TEXT) AS $$
  SELECT
    t.id,
    t.nombre_completo,
    (
      SELECT r.tipo FROM registros_asistencia_qr r
      WHERE r.trabajador_id = t.id
        AND r.fecha = (now() AT TIME ZONE 'America/Mexico_City')::date
      ORDER BY r.hora DESC, r.created_at DESC
      LIMIT 1
    ) AS ultimo_tipo
  FROM trabajador_dispositivos td
  JOIN trabajadores t ON t.id = td.trabajador_id
  WHERE td.device_token = p_device_token
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION checkin_dispositivo_vinculado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_dispositivo_vinculado(UUID) TO anon, authenticated;

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
