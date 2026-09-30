-- ============================================================
-- 130 — Notificaciones sin revisar por pestaña del portal
-- ============================================================
-- El dueño pidió que cada pestaña del portal (Cronograma, Fotos,
-- Reportes, Facturas/Change Orders para el cliente, Archivos para
-- colaborador_externo/subcontratista, Bitácora para todos) muestre
-- cuántas cosas nuevas hay sin revisar -- válido para los 3 roles del
-- portal (cliente, colaborador_externo, subcontratista).
--
-- Diseño: una tabla de "última visita" por usuario+sección (nunca por
-- proyecto -- cada cuenta del portal ya está limitada a un único
-- proyecto vía get_proyecto_cliente()), más dos RPC:
--   - portal_marcar_visto(seccion): se llama al ABRIR cada página de
--     sección, resetea el contador a 0 desde ese momento.
--   - portal_contar_notificaciones(): se llama desde la pantalla de
--     inicio del portal, devuelve {seccion: cantidad} comparando el
--     timestamp de "última visita" contra el contenido más reciente de
--     cada sección. Sin fila de última visita = epoch (0) = todo lo
--     que exista hoy cuenta como "sin revisar" en la primera entrada,
--     que es el comportamiento esperado de un contador de no-leídos.
--
-- Solo se llega a esta tabla a través de las dos RPC de abajo (mismo
-- criterio que change_orders/bitacora_proyecto): sin políticas RLS
-- directas, RLS habilitado y sin GRANT a la tabla en sí.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_ultima_visita (
  usuario_id UUID NOT NULL REFERENCES perfiles_usuario(id) ON DELETE CASCADE,
  seccion TEXT NOT NULL,
  ultima_visita TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, seccion)
);

ALTER TABLE portal_ultima_visita ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION portal_marcar_visto(p_seccion TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  INSERT INTO portal_ultima_visita (usuario_id, seccion, ultima_visita)
  VALUES (auth.uid(), p_seccion, NOW())
  ON CONFLICT (usuario_id, seccion) DO UPDATE SET ultima_visita = NOW();
END;
$$;
REVOKE ALL ON FUNCTION portal_marcar_visto(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_marcar_visto(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION portal_contar_notificaciones()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_rol TEXT;
  v_proyecto_id UUID;
  v_visitas JSONB;
  v_result JSONB := '{}'::jsonb;
BEGIN
  v_rol := get_rol_usuario();
  IF v_rol NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_object_agg(seccion, ultima_visita), '{}'::jsonb) INTO v_visitas
  FROM portal_ultima_visita WHERE usuario_id = auth.uid();

  -- Bitácora: la ven los 3 roles del portal.
  v_result := v_result || jsonb_build_object('bitacora', (
    SELECT COUNT(*) FROM bitacora_proyecto b
    WHERE b.proyecto_id = v_proyecto_id
      AND b.created_at > COALESCE((v_visitas->>'bitacora')::timestamptz, 'epoch'::timestamptz)
  ));

  -- Reportes: los 3 roles los ven (reportes ya validados, igual que cliente_ver_reportes).
  v_result := v_result || jsonb_build_object('reportes', (
    SELECT COUNT(*) FROM reportes_diarios r
    WHERE r.proyecto_id = v_proyecto_id AND r.estado_reporte = 'validado'
      AND COALESCE(r.validado_at, r.created_at) > COALESCE((v_visitas->>'reportes')::timestamptz, 'epoch'::timestamptz)
  ));

  -- Fotos: mismo criterio que cliente_ver_fotos (categoría 'fotos').
  v_result := v_result || jsonb_build_object('fotos', (
    SELECT COUNT(*) FROM proyecto_archivos a
    WHERE a.proyecto_id = v_proyecto_id AND a.categoria = 'fotos'
      AND a.created_at > COALESCE((v_visitas->>'fotos')::timestamptz, 'epoch'::timestamptz)
  ));

  -- Cronograma: actividades que se completaron desde la última visita.
  v_result := v_result || jsonb_build_object('cronograma', (
    SELECT COUNT(*) FROM actividades act
    WHERE act.proyecto_id = v_proyecto_id AND act.fecha_fin_real IS NOT NULL
      AND act.fecha_fin_real::timestamptz > COALESCE((v_visitas->>'cronograma')::timestamptz, 'epoch'::timestamptz)
  ));

  IF v_rol = 'cliente' THEN
    -- Facturas y Change Orders: solo el cliente las ve.
    v_result := v_result || jsonb_build_object('facturas', (
      SELECT COUNT(*) FROM facturas_cliente f
      WHERE f.proyecto_id = v_proyecto_id AND f.estado NOT IN ('borrador', 'aprobada')
        AND f.created_at > COALESCE((v_visitas->>'facturas')::timestamptz, 'epoch'::timestamptz)
    ));
    v_result := v_result || jsonb_build_object('change_orders', (
      SELECT COUNT(*) FROM change_orders co
      WHERE co.proyecto_id = v_proyecto_id
        AND co.estado IN ('enviado_cliente', 'aprobado', 'rechazado', 'facturado', 'cobrado')
        AND COALESCE(co.enviado_at, co.created_at) > COALESCE((v_visitas->>'change_orders')::timestamptz, 'epoch'::timestamptz)
    ));
  ELSE
    -- Archivos: solo colaborador_externo/subcontratista los ven (planos + documentos).
    v_result := v_result || jsonb_build_object('archivos', (
      SELECT COUNT(*) FROM proyecto_archivos a
      WHERE a.proyecto_id = v_proyecto_id AND a.categoria IN ('planos', 'documentos_colaborador')
        AND a.created_at > COALESCE((v_visitas->>'archivos')::timestamptz, 'epoch'::timestamptz)
    ));
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION portal_contar_notificaciones() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_contar_notificaciones() TO authenticated;
