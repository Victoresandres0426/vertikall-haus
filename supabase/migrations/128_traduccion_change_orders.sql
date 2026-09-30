-- ============================================================
-- 128 — Change Orders: traducción cacheada al inglés
-- ============================================================
-- El dueño pidió que TODO lo que el cliente ve en el portal respete
-- el idioma que eligió, no solo los textos fijos de la interfaz. El
-- título/descripción/motivo de rechazo de un Change Order los escribe
-- el equipo en español libremente (no es un catálogo fijo como
-- actividades) -- mismo problema que ya se resolvió para Reportes de
-- obra en la migración 098: se traduce con IA la primera vez que se
-- ve en inglés y se cachea el resultado.

ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS titulo_en TEXT;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS descripcion_en TEXT;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS motivo_rechazo_en TEXT;

CREATE OR REPLACE FUNCTION portal_ver_change_orders()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() != 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;
  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', co.id, 'numero', co.numero, 'titulo', co.titulo, 'descripcion', co.descripcion,
      'titulo_en', co.titulo_en, 'descripcion_en', co.descripcion_en,
      'solicitado_por', co.solicitado_por, 'estado', co.estado,
      'costo_directo', co.costo_directo, 'margen_pct_aplicado', co.margen_pct_aplicado,
      'costo_margen', co.costo_margen, 'impacto_costo', co.impacto_costo, 'impacto_dias', co.impacto_dias,
      'motivo_rechazo', co.motivo_rechazo, 'motivo_rechazo_en', co.motivo_rechazo_en,
      'enviado_at', co.enviado_at, 'decidido_at', co.decidido_at, 'created_at', co.created_at
    ) ORDER BY co.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM change_orders co
  WHERE co.proyecto_id = v_proyecto_id
    AND co.estado IN ('enviado_cliente', 'aprobado', 'rechazado', 'facturado', 'cobrado');

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION portal_ver_change_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_ver_change_orders() TO authenticated;

-- El cliente puede guardar la traducción generada al vuelo para SU
-- propio Change Order (verificado por proyecto), para cachearla y no
-- volver a traducirla en la siguiente visita.
CREATE OR REPLACE FUNCTION cliente_guardar_traduccion_co(
  p_id UUID,
  p_titulo_en TEXT,
  p_descripcion_en TEXT,
  p_motivo_rechazo_en TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  IF get_rol_usuario() != 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  UPDATE change_orders
  SET titulo_en = COALESCE(p_titulo_en, titulo_en),
      descripcion_en = COALESCE(p_descripcion_en, descripcion_en),
      motivo_rechazo_en = COALESCE(p_motivo_rechazo_en, motivo_rechazo_en)
  WHERE id = p_id AND proyecto_id = v_proyecto_id;
END;
$$;

REVOKE ALL ON FUNCTION cliente_guardar_traduccion_co(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cliente_guardar_traduccion_co(UUID, TEXT, TEXT, TEXT) TO authenticated;
