-- 158: "Ver como" -- el dueño/superadmin puede previsualizar la app como
-- cliente, colaborador externo, subcontratista, project manager o capataz
-- SIN cerrar sesión. Mientras hay una vista previa activa, get_rol_usuario()
-- y get_proyecto_cliente() devuelven el rol/proyecto simulado, así que todas
-- las RPC del portal y las políticas RLS se comportan como ese rol.
-- Seguridad: solo aplica si el rol REAL es dueno/superadmin; expira sola en 4 h.

CREATE TABLE IF NOT EXISTS vista_previa_rol (
  usuario_id  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol         TEXT NOT NULL CHECK (rol IN ('cliente','colaborador_externo','subcontratista','project_manager','capataz')),
  proyecto_id UUID REFERENCES proyectos(id) ON DELETE CASCADE,
  expira_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '4 hours'
);
ALTER TABLE vista_previa_rol ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo se toca vía las funciones SECURITY DEFINER de abajo.

-- Rol REAL (ignora la vista previa)
CREATE OR REPLACE FUNCTION rol_real_usuario()
RETURNS TEXT AS $$
  SELECT rol::text FROM perfiles_usuario WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Vista previa activa del usuario actual (solo si es dueño/superadmin)
CREATE OR REPLACE FUNCTION vista_previa_actual()
RETURNS JSONB AS $$
  SELECT jsonb_build_object('rol', v.rol, 'proyecto_id', v.proyecto_id)
  FROM vista_previa_rol v
  JOIN perfiles_usuario p ON p.id = v.usuario_id
  WHERE v.usuario_id = auth.uid()
    AND v.expira_at > now()
    AND p.rol::text IN ('dueno','superadmin');
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Rol efectivo
CREATE OR REPLACE FUNCTION get_rol_usuario()
RETURNS rol_usuario AS $$
  SELECT COALESCE(
    (SELECT (v.rol)::rol_usuario
       FROM vista_previa_rol v
       JOIN perfiles_usuario p ON p.id = v.usuario_id
      WHERE v.usuario_id = auth.uid()
        AND v.expira_at > now()
        AND p.rol::text IN ('dueno','superadmin')),
    (SELECT rol FROM perfiles_usuario WHERE id = auth.uid())
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Proyecto efectivo del cliente/colaborador/subcontratista
CREATE OR REPLACE FUNCTION get_proyecto_cliente()
RETURNS UUID AS $$
  SELECT COALESCE(
    (SELECT v.proyecto_id
       FROM vista_previa_rol v
       JOIN perfiles_usuario p ON p.id = v.usuario_id
      WHERE v.usuario_id = auth.uid()
        AND v.expira_at > now()
        AND p.rol::text IN ('dueno','superadmin')),
    (SELECT proyecto_id FROM perfiles_usuario WHERE id = auth.uid())
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PM/capataz simulados ven el proyecto elegido en la vista previa
CREATE OR REPLACE FUNCTION usuario_ve_proyecto(p_proyecto_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM proyectos p
    WHERE p.id = p_proyecto_id
      AND p.empresa_id = get_empresa_id()
      AND (
        get_rol_usuario() NOT IN ('capataz', 'project_manager')
        OR EXISTS (
          SELECT 1 FROM proyecto_usuarios_asignados pua
          WHERE pua.proyecto_id = p_proyecto_id
            AND pua.usuario_id = auth.uid()
        )
        OR (vista_previa_actual() ->> 'proyecto_id') = p_proyecto_id::text
      )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Iniciar / cambiar vista previa
CREATE OR REPLACE FUNCTION iniciar_vista_previa(p_rol TEXT, p_proyecto_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF rol_real_usuario() NOT IN ('dueno','superadmin') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;
  IF p_rol NOT IN ('cliente','colaborador_externo','subcontratista','project_manager','capataz') THEN
    RAISE EXCEPTION 'rol_invalido';
  END IF;
  IF p_proyecto_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM proyectos WHERE id = p_proyecto_id AND empresa_id = get_empresa_id()
  ) THEN
    RAISE EXCEPTION 'proyecto_invalido';
  END IF;

  INSERT INTO vista_previa_rol (usuario_id, rol, proyecto_id, expira_at)
  VALUES (auth.uid(), p_rol, p_proyecto_id, now() + interval '4 hours')
  ON CONFLICT (usuario_id) DO UPDATE
    SET rol = EXCLUDED.rol, proyecto_id = EXCLUDED.proyecto_id, expira_at = EXCLUDED.expira_at;
END;
$$;

-- Volver a la vista de dueño
CREATE OR REPLACE FUNCTION terminar_vista_previa()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM vista_previa_rol WHERE usuario_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION rol_real_usuario()            TO authenticated;
GRANT EXECUTE ON FUNCTION vista_previa_actual()         TO authenticated;
GRANT EXECUTE ON FUNCTION iniciar_vista_previa(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION terminar_vista_previa()       TO authenticated;

NOTIFY pgrst, 'reload schema';
