-- ============================================================
-- 062 — Fix: actualizar_reporte_diario fallaba al editar historial
-- ============================================================
-- Al guardar la edición de un reporte pasado (migración 059), la
-- actualización de actividades.estado usaba un CASE cuyas dos ramas son
-- literales de texto ('completada' / 'en_progreso'). Postgres resuelve
-- ese CASE como tipo "text" (no como el tipo "unknown" que sí se
-- convierte automáticamente al tipo de la columna), y como estado es un
-- enum (estado_actividad), la asignación fallaba con:
--   column "estado" is of type estado_actividad but expression is of type text
-- Se corrige agregando el cast explícito ::estado_actividad. Sin cambios
-- de comportamiento, solo el fix del tipo.
-- ============================================================

CREATE OR REPLACE FUNCTION actualizar_reporte_diario(
  p_reporte_id UUID,
  p_clima TEXT,
  p_observaciones TEXT,
  p_asistencias JSONB,     -- [{trabajador_id, presente, horas_regulares, horas_extra}]
  p_avances JSONB,         -- [{actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias}]
  p_horas_actividad JSONB  -- [{trabajador_id, actividad_id, rol_aplicado, horas, avance_cantidad}]
) RETURNS JSONB
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

  -- Limpia lo que había antes de este reporte específico.
  DELETE FROM costos_reales WHERE reporte_id = p_reporte_id;
  DELETE FROM asistencia_actividad_diaria WHERE reporte_id = p_reporte_id;
  DELETE FROM avance_diario WHERE reporte_id = p_reporte_id;
  DELETE FROM asistencia_diaria WHERE reporte_id = p_reporte_id;

  UPDATE reportes_diarios
  SET clima = p_clima, observaciones_generales = p_observaciones, updated_at = NOW()
  WHERE id = p_reporte_id;

  INSERT INTO asistencia_diaria (reporte_id, trabajador_id, presente, horas_regulares, horas_extra)
  SELECT
    p_reporte_id,
    (e->>'trabajador_id')::UUID,
    COALESCE((e->>'presente')::BOOLEAN, true),
    COALESCE((e->>'horas_regulares')::DECIMAL, 0),
    COALESCE((e->>'horas_extra')::DECIMAL, 0)
  FROM jsonb_array_elements(COALESCE(p_asistencias, '[]'::jsonb)) e
  WHERE e->>'trabajador_id' IS NOT NULL;

  INSERT INTO avance_diario (reporte_id, actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias)
  SELECT
    p_reporte_id,
    (e->>'actividad_id')::UUID,
    COALESCE((e->>'cantidad_ejecutada_dia')::DECIMAL, 0),
    NULLIF(e->>'porcentaje_avance_total', '')::DECIMAL,
    NULLIF(e->>'incidencias', '')
  FROM jsonb_array_elements(COALESCE(p_avances, '[]'::jsonb)) e
  WHERE e->>'actividad_id' IS NOT NULL;

  UPDATE actividades a
  SET
    avance_porcentaje = sub.pct,
    cantidad_ejecutada = sub.cant,
    estado = (CASE WHEN sub.pct >= 100 THEN 'completada' ELSE 'en_progreso' END)::estado_actividad
  FROM (
    SELECT
      (e->>'actividad_id')::UUID AS id,
      (e->>'porcentaje_avance_total')::DECIMAL AS pct,
      (e->>'cantidad_ejecutada_dia')::DECIMAL AS cant
    FROM jsonb_array_elements(COALESCE(p_avances, '[]'::jsonb)) e
    WHERE NULLIF(e->>'porcentaje_avance_total', '') IS NOT NULL
      AND (e->>'porcentaje_avance_total')::DECIMAL > 0
  ) sub
  WHERE a.id = sub.id;

  -- Reutiliza el mismo cálculo de destajo/por hora que un reporte nuevo.
  PERFORM registrar_asistencia_actividad(p_reporte_id, p_horas_actividad);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;
