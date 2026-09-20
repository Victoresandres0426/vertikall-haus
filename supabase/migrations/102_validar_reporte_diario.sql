-- ============================================================
-- 102 — Paso de validación para reportes diarios (visibilidad al cliente)
-- ============================================================
-- Se encontró que reportes_diarios.estado_reporte se queda en 'borrador'
-- para siempre: crearReporteDiario nunca lo cambia, y no existía ninguna
-- función ni botón para pasarlo a 'validado'. Como cliente_ver_reportes()
-- (migración 047) solo muestra reportes con estado_reporte = 'validado',
-- esto significa que NINGÚN reporte diario -- ni las fotos que trae
-- adentro -- se ha visto jamás en el portal del cliente, en ningún
-- proyecto, desde que existe esa función.
--
-- El dueño pidió agregar un paso de validación explícito antes de que el
-- cliente vea un reporte (mismo patrón que Aprobar/Enviar en facturas),
-- en vez de simplemente quitar el filtro -- así gestión revisa cada
-- reporte antes de que llegue al cliente.
--
-- Backfill: todos los reportes que YA existen se marcan 'validado' de
-- una sola vez -- ya se usaron y se confió en ellos durante meses sin
-- este paso, no tiene sentido represarlos a validar uno por uno en
-- retroactivo. De aquí en adelante, cada reporte nuevo nace en
-- 'borrador' y necesita que dueño/administrador/PM lo valide para que
-- el cliente lo vea.
-- ============================================================

UPDATE reportes_diarios SET estado_reporte = 'validado' WHERE estado_reporte = 'borrador';

CREATE OR REPLACE FUNCTION validar_reporte_diario(p_reporte_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_empresa_id UUID;
BEGIN
  SELECT r.proyecto_id, p.empresa_id INTO v_proyecto_id, v_empresa_id
  FROM reportes_diarios r
  JOIN proyectos p ON p.id = r.proyecto_id
  WHERE r.id = p_reporte_id;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'reporte_no_encontrado';
  END IF;

  IF v_empresa_id IS NULL OR v_empresa_id <> get_empresa_id() THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador', 'project_manager') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF NOT usuario_ve_proyecto(v_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  UPDATE reportes_diarios SET estado_reporte = 'validado' WHERE id = p_reporte_id;
END;
$$;

REVOKE ALL ON FUNCTION validar_reporte_diario(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validar_reporte_diario(UUID) TO authenticated;
