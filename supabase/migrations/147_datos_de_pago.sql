-- 147: Datos de pago de la empresa (wire/ACH + enlace de pago opcional),
-- guardados en empresas.configuracion -> 'datos_pago'. El portal del
-- cliente los lee con cliente_ver_datos_pago() (solo los de la empresa
-- dueña de SU proyecto); el equipo los edita con guardar_datos_pago().
CREATE OR REPLACE FUNCTION cliente_ver_datos_pago()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_datos JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;
  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT e.configuracion -> 'datos_pago' INTO v_datos
  FROM proyectos p JOIN empresas e ON e.id = p.empresa_id
  WHERE p.id = v_proyecto_id;

  RETURN COALESCE(v_datos, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION cliente_ver_datos_pago() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_ver_datos_pago() TO authenticated;

CREATE OR REPLACE FUNCTION guardar_datos_pago(p_datos JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  UPDATE empresas
  SET configuracion = jsonb_set(COALESCE(configuracion, '{}'::jsonb), '{datos_pago}', COALESCE(p_datos, '{}'::jsonb), true)
  WHERE id = get_empresa_id();
END;
$$;
REVOKE ALL ON FUNCTION guardar_datos_pago(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardar_datos_pago(JSONB) TO authenticated;
