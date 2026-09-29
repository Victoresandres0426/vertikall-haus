-- ============================================================
-- 121 — Fix: colaborador_externo no podía cambiar el idioma del portal
-- ============================================================
-- cliente_actualizar_idioma (migración 096) se quedó fuera cuando la
-- migración 118 extendió el resto de las funciones cliente_ver_* para
-- aceptar también al rol colaborador_externo -- por eso el toggle
-- ES/EN del portal le fallaba en silencio a un colaborador (el RPC
-- devolvía 'acceso_denegado' y el botón revertía el cambio).
-- ============================================================

CREATE OR REPLACE FUNCTION cliente_actualizar_idioma(p_idioma TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  IF p_idioma NOT IN ('es', 'en') THEN
    RAISE EXCEPTION 'idioma_invalido';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  UPDATE proyectos SET idioma_cliente = p_idioma WHERE id = v_proyecto_id;
END;
$$;

REVOKE ALL ON FUNCTION cliente_actualizar_idioma(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_actualizar_idioma(TEXT) TO authenticated;
