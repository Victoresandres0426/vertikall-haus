-- ============================================================
-- 131 — Facturas y Change Orders: notificación por PENDIENTE, no por "visto"
-- ============================================================
-- Bug reportado: el dueño abrió el portal del cliente para probar el
-- flujo de Change Orders, y eso marcó la sección "facturas" como
-- visitada para esa cuenta -- borrando el globito de notificación que
-- el cliente real todavía no había visto.
--
-- La causa de fondo: portal_contar_notificaciones() (migración 130)
-- trataba TODAS las secciones igual -- "cuántas cosas nuevas desde tu
-- última visita". Eso tiene sentido para contenido informativo
-- (reportes, fotos, bitácora, cronograma), pero NO para Facturas y
-- Change Orders: esas dos son acciones pendientes del cliente
-- (pagar / aprobar o rechazar), y el aviso debe seguir ahí hasta que
-- se resuelva -- sin importar cuántas veces entre y salga del portal,
-- y sin depender de qué cuenta haya abierto la página.
--
-- Se cambia el criterio de esas dos secciones a "pendiente de acción":
--   - facturas: cuenta las que están enviadas y no pagadas por
--     completo (estado <> 'pagada', excluyendo 'borrador'/'aprobada'
--     que el cliente ni siquiera ve).
--   - change_orders: cuenta las que siguen en 'enviado_cliente'
--     (todavía no aprobadas ni rechazadas).
-- Ya no se comparan contra portal_ultima_visita -- entrar a ver la
-- sección no las hace desaparecer, solo resolverlas sí. El resto de
-- secciones (bitácora, reportes, fotos, cronograma, archivos) sigue
-- igual que en la migración 130.
-- ============================================================

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

  v_result := v_result || jsonb_build_object('bitacora', (
    SELECT COUNT(*) FROM bitacora_proyecto b
    WHERE b.proyecto_id = v_proyecto_id
      AND b.created_at > COALESCE((v_visitas->>'bitacora')::timestamptz, 'epoch'::timestamptz)
  ));

  v_result := v_result || jsonb_build_object('reportes', (
    SELECT COUNT(*) FROM reportes_diarios r
    WHERE r.proyecto_id = v_proyecto_id AND r.estado_reporte = 'validado'
      AND COALESCE(r.validado_at, r.created_at) > COALESCE((v_visitas->>'reportes')::timestamptz, 'epoch'::timestamptz)
  ));

  v_result := v_result || jsonb_build_object('fotos', (
    SELECT COUNT(*) FROM proyecto_archivos a
    WHERE a.proyecto_id = v_proyecto_id AND a.categoria = 'fotos'
      AND a.created_at > COALESCE((v_visitas->>'fotos')::timestamptz, 'epoch'::timestamptz)
  ));

  v_result := v_result || jsonb_build_object('cronograma', (
    SELECT COUNT(*) FROM actividades act
    WHERE act.proyecto_id = v_proyecto_id AND act.fecha_fin_real IS NOT NULL
      AND act.fecha_fin_real::timestamptz > COALESCE((v_visitas->>'cronograma')::timestamptz, 'epoch'::timestamptz)
  ));

  IF v_rol = 'cliente' THEN
    -- Pendiente de acción: sigue contando hasta que se pague/decida,
    -- no hasta que se "vea".
    v_result := v_result || jsonb_build_object('facturas', (
      SELECT COUNT(*) FROM facturas_cliente f
      WHERE f.proyecto_id = v_proyecto_id
        AND f.estado NOT IN ('borrador', 'aprobada', 'pagada')
    ));
    v_result := v_result || jsonb_build_object('change_orders', (
      SELECT COUNT(*) FROM change_orders co
      WHERE co.proyecto_id = v_proyecto_id AND co.estado = 'enviado_cliente'
    ));
  ELSE
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
