-- ============================================================
-- 096 — El cliente puede cambiar su propio idioma desde el portal
-- ============================================================
-- Hasta ahora "idioma_cliente" (en la tabla proyectos) solo lo podía
-- cambiar el dueño/PM desde la ficha del proyecto. Se agrega una
-- función que el propio cliente puede llamar desde su portal para
-- cambiar su idioma -- actualiza el MISMO campo, así que portal y
-- correos automáticos de facturación quedan siempre sincronizados
-- en un solo idioma (decisión explícita: no se maneja como una
-- preferencia local aparte).
-- ============================================================

CREATE OR REPLACE FUNCTION cliente_actualizar_idioma(p_idioma TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
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
