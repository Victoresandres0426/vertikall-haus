-- ============================================================
-- 125 — Traducción automática de la bitácora
-- ============================================================
-- Cada nota de bitácora se guarda tal cual la escribió su autor (puede
-- ser en español desde el dashboard interno, o en español/inglés desde
-- el portal según lo que el colaborador/subcontratista haya tecleado,
-- sin importar el idioma de la UI que tenga elegido). Hasta ahora se
-- mostraba siempre igual a como se escribió, sin traducir -- si el
-- dueño escribía en español y el cliente tenía el portal en inglés,
-- lo veía en español tal cual.
--
-- Mecanismo (igual patrón "lazy + cachear" que ya existe para
-- reportes diarios, ver traducirReportesFaltantes en
-- portal-cliente/_shared.ts): la primera vez que CUALQUIER pantalla
-- (dashboard interno en español, o portal en el idioma que sea) lee
-- una nota sin procesar, se llama una vez a la IA para (1) detectar en
-- qué idioma fue escrita y (2) traducirla al otro idioma. Se cachean
-- ambos datos en la fila -- después de esa primera vez, cualquier
-- lector (en cualquiera de los dos idiomas) ya tiene lo que necesita
-- sin volver a llamar a la IA.
--
-- idioma_detectado: 'es' | 'en' -- el idioma real en el que se escribió.
-- nota_traducida: la traducción al idioma contrario a idioma_detectado.
-- Cada pantalla decide qué mostrar: si su idioma coincide con
-- idioma_detectado, usa `nota` (el original); si no, usa
-- `nota_traducida` (con `nota` como respaldo si por algo aún no se ha
-- traducido).
-- ============================================================

ALTER TABLE bitacora_proyecto ADD COLUMN IF NOT EXISTS idioma_detectado TEXT CHECK (idioma_detectado IN ('es', 'en'));
ALTER TABLE bitacora_proyecto ADD COLUMN IF NOT EXISTS nota_traducida TEXT;

-- ── RPC para cachear la traducción, llamable desde cualquier rol que
-- ya pueda VER esa fila (mismo criterio que la política de SELECT) ──
CREATE OR REPLACE FUNCTION guardar_traduccion_bitacora(
  p_id UUID,
  p_idioma_detectado TEXT,
  p_nota_traducida TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  IF p_idioma_detectado NOT IN ('es', 'en') THEN
    RAISE EXCEPTION 'idioma_invalido';
  END IF;

  SELECT proyecto_id INTO v_proyecto_id FROM bitacora_proyecto WHERE id = p_id;
  IF v_proyecto_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    (get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') AND usuario_ve_proyecto(v_proyecto_id))
    OR (get_rol_usuario() IN ('cliente', 'colaborador_externo', 'subcontratista') AND v_proyecto_id = get_proyecto_cliente())
  ) THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  -- No pisa una traducción ya cacheada (solo se completa una vez).
  UPDATE bitacora_proyecto
  SET idioma_detectado = p_idioma_detectado,
      nota_traducida = p_nota_traducida
  WHERE id = p_id AND idioma_detectado IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION guardar_traduccion_bitacora(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION guardar_traduccion_bitacora(UUID, TEXT, TEXT) TO authenticated;

-- ── portal_ver_bitacora: agrega los 2 campos nuevos + fix -- se le
-- había quedado fuera 'subcontratista' (migración 124 sí le dio acceso
-- de lectura/escritura por RLS directo, pero esta función RPC -- que
-- es la que de verdad usa la página del portal -- seguía sin
-- incluirlo, así que un subcontratista no podía ver la bitácora pese a
-- tener permiso de escribir en ella) ──
CREATE OR REPLACE FUNCTION portal_ver_bitacora()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
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
      'idioma_detectado', b.idioma_detectado,
      'nota_traducida', b.nota_traducida,
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
