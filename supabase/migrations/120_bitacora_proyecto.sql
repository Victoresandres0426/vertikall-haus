-- ============================================================
-- 120 — Bitácora / libro de obra
-- ============================================================
-- Historial cronológico de notas y fotos, escrito por el dueño, el
-- project manager y los proyectistas (colaborador_externo -- ej.
-- arquitecto/diseñador) a lo largo del proyecto, para dejar registro
-- de sucesos y decisiones y de quién estuvo implicado en cada una.
--
-- Diseño (decisiones confirmadas con el dueño):
--   1) El cliente puede VER la bitácora (transparencia) pero no
--      escribir en ella.
--   2) Una vez publicada, una nota queda fija -- no hay UPDATE ni
--      DELETE expuestos desde la app (ni al propio autor). Es un
--      libro de obra, no un chat editable.
--   3) Feed libre por fecha -- sin vincular cada nota a una actividad
--      específica del cronograma.
--
-- Quién escribe: dueno/superadmin/administrador/project_manager
-- (equipo de gestión interno) y colaborador_externo (proyectista).
-- Capataz NO escribe (ya tiene su propio canal en Reporte Diario) y
-- cliente NO escribe (solo lee).
--
-- Quién lee: cualquier rol interno con acceso al proyecto (incluye
-- capataz, vía usuario_ve_proyecto -- mismo criterio que el resto de
-- las pantallas internas) + colaborador_externo + cliente, ambos
-- limitados a su único proyecto asignado (get_proyecto_cliente()).
--
-- El autor_id/autor_nombre/autor_rol/autor_titulo se fijan SIEMPRE
-- desde un trigger BEFORE INSERT a partir de auth.uid() -- así da
-- igual por dónde entre la fila (dashboard interno o portal), nunca
-- se puede firmar una nota con una identidad o rol que no sea el que
-- realmente tiene la sesión.
-- ============================================================

CREATE TABLE IF NOT EXISTS bitacora_proyecto (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES perfiles_usuario(id),
  autor_nombre TEXT,
  autor_rol TEXT,
  autor_titulo TEXT,
  nota TEXT,
  fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bitacora_proyecto_contenido_check CHECK (
    COALESCE(NULLIF(TRIM(nota), ''), '') <> '' OR jsonb_array_length(fotos) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_bitacora_proyecto_proyecto ON bitacora_proyecto(proyecto_id, created_at DESC);

-- ── Trigger: la identidad/rol del autor siempre la fija el servidor ─
CREATE OR REPLACE FUNCTION fn_bitacora_set_autor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  NEW.autor_id := auth.uid();
  SELECT nombre_completo, rol, titulo_colaborador
  INTO NEW.autor_nombre, NEW.autor_rol, NEW.autor_titulo
  FROM perfiles_usuario WHERE id = auth.uid();
  NEW.nota := NULLIF(TRIM(NEW.nota), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bitacora_set_autor ON bitacora_proyecto;
CREATE TRIGGER trg_bitacora_set_autor
  BEFORE INSERT ON bitacora_proyecto
  FOR EACH ROW EXECUTE FUNCTION fn_bitacora_set_autor();

ALTER TABLE bitacora_proyecto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ve_bitacora_proyecto" ON bitacora_proyecto;
CREATE POLICY "ve_bitacora_proyecto" ON bitacora_proyecto
  FOR SELECT USING (
    (get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') AND usuario_ve_proyecto(proyecto_id))
    OR (get_rol_usuario() IN ('cliente', 'colaborador_externo') AND proyecto_id = get_proyecto_cliente())
  );

DROP POLICY IF EXISTS "escribe_bitacora_proyecto" ON bitacora_proyecto;
CREATE POLICY "escribe_bitacora_proyecto" ON bitacora_proyecto
  FOR INSERT WITH CHECK (
    (get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager') AND usuario_ve_proyecto(proyecto_id))
    OR (get_rol_usuario() = 'colaborador_externo' AND proyecto_id = get_proyecto_cliente())
  );

-- Sin políticas de UPDATE/DELETE -- nadie puede editar ni borrar una
-- nota ya publicada desde la app (libro de obra = registro fijo).

-- ── Storage: fotos de la bitácora ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('bitacora-fotos', 'bitacora-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ve_fotos_bitacora" ON storage.objects;
CREATE POLICY "ve_fotos_bitacora" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bitacora-fotos' AND (
      (get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') AND usuario_ve_proyecto((storage.foldername(name))[1]::uuid))
      OR (get_rol_usuario() IN ('cliente', 'colaborador_externo') AND (storage.foldername(name))[1]::uuid = get_proyecto_cliente())
    )
  );

DROP POLICY IF EXISTS "sube_fotos_bitacora" ON storage.objects;
CREATE POLICY "sube_fotos_bitacora" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bitacora-fotos' AND (
      (get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager') AND usuario_ve_proyecto((storage.foldername(name))[1]::uuid))
      OR (get_rol_usuario() = 'colaborador_externo' AND (storage.foldername(name))[1]::uuid = get_proyecto_cliente())
    )
  );

-- ── Lectura para el portal (cliente + colaborador_externo) ──
-- Mismo patrón que el resto del portal: SECURITY DEFINER, curado,
-- limitado al único proyecto asignado.
CREATE OR REPLACE FUNCTION portal_ver_bitacora()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'autor_nombre', b.autor_nombre,
      'autor_rol', b.autor_rol,
      'autor_titulo', b.autor_titulo,
      'nota', b.nota,
      'fotos', b.fotos,
      'created_at', b.created_at
    ) ORDER BY b.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM bitacora_proyecto b
  WHERE b.proyecto_id = v_proyecto_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION portal_ver_bitacora() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_ver_bitacora() TO authenticated;
