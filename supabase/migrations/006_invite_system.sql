-- ============================================================
-- SISTEMA DE INVITACIONES — Vertikall Haus
-- Solo usuarios invitados pueden acceder a la app
-- ============================================================

CREATE TABLE invitaciones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'capataz',
  token UUID NOT NULL DEFAULT uuid_generate_v4(),
  created_by UUID REFERENCES perfiles_usuario(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  used_at TIMESTAMPTZ,
  activa BOOLEAN DEFAULT TRUE,
  UNIQUE(token)
);

CREATE INDEX idx_invitaciones_token ON invitaciones(token);
CREATE INDEX idx_invitaciones_email ON invitaciones(email);
CREATE INDEX idx_invitaciones_empresa ON invitaciones(empresa_id);

-- RLS
ALTER TABLE invitaciones ENABLE ROW LEVEL SECURITY;

-- Dueño y admin pueden ver todas las invitaciones de su empresa
CREATE POLICY "dueno_admin_ven_invitaciones" ON invitaciones
  FOR SELECT USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

-- Cualquier persona puede leer una invitación por token (para la página pública)
CREATE POLICY "publico_lee_invitacion_por_token" ON invitaciones
  FOR SELECT USING (activa = true AND used_at IS NULL AND expires_at > NOW());

-- Dueño y admin crean invitaciones
CREATE POLICY "dueno_admin_crean_invitaciones" ON invitaciones
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

-- El sistema puede marcar invitaciones como usadas
CREATE POLICY "sistema_actualiza_invitaciones" ON invitaciones
  FOR UPDATE USING (activa = true);

-- ── Función para validar acceso por invitación ─────────────
-- Se llama después de que el usuario crea su cuenta
CREATE OR REPLACE FUNCTION activar_invitacion(
  p_token UUID,
  p_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inv invitaciones%ROWTYPE;
  v_result JSONB;
BEGIN
  -- Buscar invitación válida
  SELECT * INTO v_inv
  FROM invitaciones
  WHERE token = p_token
    AND email = p_email
    AND activa = true
    AND used_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invitación no válida o expirada');
  END IF;

  -- Crear perfil de usuario
  INSERT INTO perfiles_usuario (id, empresa_id, nombre_completo, email, rol)
  VALUES (p_user_id, v_inv.empresa_id, v_inv.nombre_completo, p_email, v_inv.rol)
  ON CONFLICT (id) DO NOTHING;

  -- Marcar invitación como usada
  UPDATE invitaciones SET used_at = NOW(), activa = false WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'rol', v_inv.rol, 'nombre', v_inv.nombre_completo);
END;
$$;
