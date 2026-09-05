-- ============================================================
-- 047 — Acceso del rol 'cliente' (portal de solo lectura)
-- ============================================================
-- Requiere que 046_rol_cliente_enum.sql ya se haya ejecutado
-- en una corrida SEPARADA (Postgres no permite usar un valor
-- nuevo de enum en la misma transacción en que se creó).
--
-- Diseño: el cliente NO tiene políticas RLS directas sobre las
-- tablas internas (proyectos, actividades, facturas, etc.) — así,
-- por defecto, cualquier intento de leerlas directamente devuelve
-- cero filas. Todo lo que el cliente puede ver pasa por 4 funciones
-- SECURITY DEFINER (cliente_ver_*) que:
--   1) Verifican que quien llama tiene rol = 'cliente'.
--   2) Limitan todo al ÚNICO proyecto asignado a ese usuario
--      (perfiles_usuario.proyecto_id).
--   3) Devuelven solo columnas seguras — nunca costos internos,
--      márgenes ni presupuesto base (solo presupuesto_venta, que
--      es el monto contratado con el cliente).
-- ============================================================

-- ── Columnas nuevas ─────────────────────────────────────────
ALTER TABLE perfiles_usuario ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES proyectos(id);
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS proyecto_id UUID REFERENCES proyectos(id);

-- ── Activar invitación: ahora también copia proyecto_id ────
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
BEGIN
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

  INSERT INTO perfiles_usuario (id, empresa_id, nombre_completo, email, rol, proyecto_id)
  VALUES (p_user_id, v_inv.empresa_id, v_inv.nombre_completo, p_email, v_inv.rol, v_inv.proyecto_id)
  ON CONFLICT (id) DO NOTHING;

  UPDATE invitaciones SET used_at = NOW(), activa = false WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'rol', v_inv.rol, 'nombre', v_inv.nombre_completo);
END;
$$;

-- ── perfiles_usuario: un cliente solo ve su propia fila ─────
-- (el resto de roles sigue viendo a todo el equipo de la empresa)
DROP POLICY IF EXISTS "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario;
CREATE POLICY "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario
  FOR SELECT USING (
    (get_rol_usuario() <> 'cliente' AND empresa_id = get_empresa_id())
    OR id = auth.uid()
  );

-- ── Helper: proyecto asignado al cliente actual ─────────────
CREATE OR REPLACE FUNCTION get_proyecto_cliente()
RETURNS UUID AS $$
  SELECT proyecto_id FROM perfiles_usuario WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── 1) Datos generales del proyecto (sin costos internos) ───
CREATE OR REPLACE FUNCTION cliente_ver_proyecto()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'nombre', p.nombre,
    'descripcion', p.descripcion,
    'ubicacion', p.ubicacion,
    'estado', p.estado,
    'fecha_inicio_plan', p.fecha_inicio_plan,
    'fecha_fin_plan', p.fecha_fin_plan,
    'fecha_inicio_real', p.fecha_inicio_real,
    'fecha_fin_forecast', p.fecha_fin_forecast,
    'presupuesto_venta', p.presupuesto_venta,
    'empresa_nombre', e.nombre,
    'empresa_logo_url', e.logo_url
  ) INTO v_result
  FROM proyectos p
  JOIN empresas e ON e.id = p.empresa_id
  WHERE p.id = v_proyecto_id;

  RETURN v_result;
END;
$$;

-- ── 2) Cronograma / avance (sin costos) ─────────────────────
CREATE OR REPLACE FUNCTION cliente_ver_avance()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'proceso_id', pr.id,
      'proceso', pr.nombre,
      'proceso_orden', pr.orden,
      'actividad_id', a.id,
      'codigo', a.codigo,
      'nombre', a.nombre,
      'fecha_inicio_plan', a.fecha_inicio_plan,
      'fecha_fin_plan', a.fecha_fin_plan,
      'fecha_inicio_real', a.fecha_inicio_real,
      'fecha_fin_real', a.fecha_fin_real,
      'avance_porcentaje', a.avance_porcentaje,
      'estado', a.estado,
      'es_critica', a.es_critica
    ) ORDER BY pr.orden, a.fecha_inicio_plan NULLS LAST, a.codigo
  ), '[]'::jsonb) INTO v_result
  FROM actividades a
  JOIN procesos pr ON pr.id = a.proceso_id
  WHERE a.proyecto_id = v_proyecto_id AND a.activa IS NOT FALSE;

  RETURN v_result;
END;
$$;

-- ── 3) Reportes de obra validados + fotos ───────────────────
CREATE OR REPLACE FUNCTION cliente_ver_reportes()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fecha', r.fecha,
      'clima', r.clima,
      'observaciones_generales', r.observaciones_generales,
      'fotos', (
        SELECT COALESCE(jsonb_agg(foto), '[]'::jsonb)
        FROM avance_diario ad, jsonb_array_elements(ad.fotos) foto
        WHERE ad.reporte_id = r.id
      )
    ) ORDER BY r.fecha DESC
  ), '[]'::jsonb) INTO v_result
  FROM reportes_diarios r
  WHERE r.proyecto_id = v_proyecto_id
    AND r.estado_reporte = 'validado';

  RETURN v_result;
END;
$$;

-- ── 4) Facturas al cliente (ya son datos de cara al cliente) ─
CREATE OR REPLACE FUNCTION cliente_ver_facturas()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'numero', f.numero,
      'descripcion', f.descripcion,
      'hito_asociado', f.hito_asociado,
      'monto', f.monto,
      'fecha_emision', f.fecha_emision,
      'fecha_vencimiento', f.fecha_vencimiento,
      'estado', f.estado,
      'monto_cobrado', f.monto_cobrado
    ) ORDER BY f.fecha_emision DESC NULLS LAST
  ), '[]'::jsonb) INTO v_result
  FROM facturas_cliente f
  WHERE f.proyecto_id = v_proyecto_id
    AND f.estado <> 'borrador'; -- los borradores aún no se le han enviado al cliente

  RETURN v_result;
END;
$$;
