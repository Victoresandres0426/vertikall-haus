-- ============================================================
-- 024 — Check-in QR: vincular un celular a un solo trabajador
-- ============================================================
-- Problema: cualquiera puede escanear el QR y elegir CUALQUIER nombre
-- de la lista, así que un trabajador presente podía marcar entrada
-- por un compañero que no llegó ("buddy punching").
--
-- Solución (sin costo, sin SMS): cada celular genera un identificador
-- aleatorio la primera vez que se usa (guardado en el navegador). En
-- el primer check-in exitoso, ese identificador queda vinculado al
-- trabajador elegido. Si después se intenta usar el MISMO celular
-- para marcar a OTRA persona, el sistema lo rechaza.
--
-- No es infalible (se puede evadir borrando datos del navegador o
-- usando modo incógnito), pero bloquea el caso común: un trabajador
-- presente marcando por otro con su propio teléfono.
-- ============================================================

CREATE TABLE IF NOT EXISTS trabajador_dispositivos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trabajador_id UUID NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
  device_token  UUID NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trabajador_dispositivos_trabajador
  ON trabajador_dispositivos (trabajador_id);

ALTER TABLE trabajador_dispositivos ENABLE ROW LEVEL SECURITY;

-- Solo lectura para usuarios de la misma empresa (para que un admin
-- pueda revisar vínculos); nada de INSERT/UPDATE/DELETE directo desde
-- el cliente -- todo pasa por las funciones de abajo.
CREATE POLICY "trabajador_dispositivos_select_empresa"
  ON trabajador_dispositivos FOR SELECT
  USING (
    trabajador_id IN (
      SELECT id FROM trabajadores WHERE empresa_id = get_empresa_id()
    )
  );

-- Para que un administrador pueda liberar un celular si un trabajador
-- lo perdió o lo cambió.
CREATE POLICY "trabajador_dispositivos_delete_managers"
  ON trabajador_dispositivos FOR DELETE
  USING (
    trabajador_id IN (
      SELECT t.id FROM trabajadores t
      JOIN perfiles_usuario pu ON pu.empresa_id = t.empresa_id
      WHERE pu.id = auth.uid()
        AND pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
    )
  );

-- ── Función: ¿este dispositivo ya está vinculado a alguien? ────────
CREATE OR REPLACE FUNCTION checkin_dispositivo_vinculado(p_device_token UUID)
RETURNS TABLE(trabajador_id UUID, nombre_completo TEXT) AS $$
  SELECT t.id, t.nombre_completo
  FROM trabajador_dispositivos td
  JOIN trabajadores t ON t.id = td.trabajador_id
  WHERE td.device_token = p_device_token
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION checkin_dispositivo_vinculado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_dispositivo_vinculado(UUID) TO anon, authenticated;

-- ── Función: registrar el check-in (reemplaza el INSERT directo) ──
-- Valida el token del proyecto, valida/crea el vínculo dispositivo↔
-- trabajador, y calcula fecha/hora en el timezone de la obra
-- (America/Mexico_City) directamente en el servidor -- así ya no
-- depende de que el reloj/timezone del celular esté bien configurado.
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
  END IF;

  INSERT INTO registros_asistencia_qr (proyecto_id, trabajador_id, nombre_manual, tipo, fecha, hora)
  VALUES (
    v_proyecto_id,
    p_trabajador_id,
    p_nombre_manual,
    p_tipo,
    (now() AT TIME ZONE 'America/Mexico_City')::date,
    (now() AT TIME ZONE 'America/Mexico_City')::time(0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_registrar(UUID, UUID, UUID, TEXT, TEXT) TO anon, authenticated;
