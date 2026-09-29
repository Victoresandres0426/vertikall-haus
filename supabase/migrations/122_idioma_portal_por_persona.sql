-- ============================================================
-- 122 — El idioma del portal es por PERSONA, no por proyecto
-- ============================================================
-- Hasta ahora idioma_cliente vivía en proyectos -- un solo idioma para
-- TODOS los que entraran al portal de ese proyecto (cliente y, desde
-- la migración 118, también los colaboradores externos). Eso ya no
-- alcanza: cada quien debe poder elegir el idioma en el que se sienta
-- más cómodo, sin cambiárselo a los demás.
--
-- Se agrega perfiles_usuario.idioma_portal (NULL = "no ha elegido
-- todavía, usar el default del proyecto"). El toggle ES/EN del portal
-- ahora actualiza el perfil de quien lo toca, no el proyecto.
--
-- proyectos.idioma_cliente NO se elimina -- sigue siendo el idioma
-- por DEFECTO de ese proyecto (lo que ve alguien que aún no eligió
-- el suyo) y el que se usa para el correo automático de estimaciones
-- (enviar_email_estimacion, migración 092), que no tiene una sesión
-- de un usuario particular a la cual preguntarle su preferencia.
-- Sigue siendo editable por el dueño desde la ficha del proyecto.
--
-- cliente_ver_proyecto() sigue devolviendo la clave "idioma_cliente"
-- en el JSON (para no tener que tocar ninguna de las páginas del
-- portal que ya leen ese campo) -- solo que ahora su valor es el
-- idioma EFECTIVO de quien está llamando: su propia preferencia si ya
-- eligió una, si no el default del proyecto.
-- ============================================================

ALTER TABLE perfiles_usuario ADD COLUMN IF NOT EXISTS idioma_portal TEXT CHECK (idioma_portal IN ('es', 'en'));

-- ── El toggle ahora guarda la preferencia de la PERSONA ─────
CREATE OR REPLACE FUNCTION cliente_actualizar_idioma(p_idioma TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  IF p_idioma NOT IN ('es', 'en') THEN
    RAISE EXCEPTION 'idioma_invalido';
  END IF;

  UPDATE perfiles_usuario SET idioma_portal = p_idioma WHERE id = auth.uid();
END;
$$;

-- ── cliente_ver_proyecto(): "idioma_cliente" ahora es el idioma
--    EFECTIVO de quien llama (su preferencia, o si no eligió, el
--    default del proyecto) -- mismo cuerpo de la 118, solo esta parte
--    cambia. ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cliente_ver_proyecto()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_idioma TEXT;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(pu.idioma_portal, p.idioma_cliente, 'es') INTO v_idioma
  FROM proyectos p
  LEFT JOIN perfiles_usuario pu ON pu.id = auth.uid()
  WHERE p.id = v_proyecto_id;

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
    'idioma_cliente', v_idioma,
    'empresa_nombre', e.nombre,
    'empresa_logo_url', e.logo_url
  ) INTO v_result
  FROM proyectos p
  JOIN empresas e ON e.id = p.empresa_id
  WHERE p.id = v_proyecto_id;

  RETURN v_result;
END;
$$;
