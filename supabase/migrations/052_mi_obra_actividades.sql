-- ============================================================
-- 052 — "Mi obra": trabajadores ven actividades en curso y
-- próximas, con plan vs real, sin necesidad de cuenta
-- ============================================================
-- Reutiliza el mismo qr_token del check-in (el trabajador ya lo
-- escanea para marcar entrada/salida) para exponer, de forma
-- pública pero de solo lectura, qué se está haciendo ahora en la
-- obra y qué sigue en los próximos 5 días -- sin exponer costos,
-- presupuesto ni márgenes (solo cantidades y fechas).
-- ============================================================

CREATE OR REPLACE FUNCTION checkin_actividades_proyecto(p_qr_token UUID)
RETURNS TABLE (
  actividad_id UUID,
  codigo TEXT,
  nombre TEXT,
  proceso_nombre TEXT,
  disciplina TEXT,
  estado TEXT,
  fecha_inicio_plan DATE,
  fecha_fin_plan DATE,
  fecha_inicio_real DATE,
  fecha_fin_real DATE,
  cantidad_objetivo DECIMAL(12,3),
  cantidad_ejecutada DECIMAL(12,3),
  unidad TEXT,
  avance_porcentaje DECIMAL(5,2),
  grupo TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  SELECT p.id INTO v_proyecto_id
  FROM proyectos p
  WHERE p.qr_token = p_qr_token AND p.activo = true;

  IF v_proyecto_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- En curso: lo que ya se está trabajando hoy
  SELECT
    a.id, a.codigo, a.nombre, pr.nombre, a.disciplina, a.estado::TEXT,
    a.fecha_inicio_plan, a.fecha_fin_plan, a.fecha_inicio_real, a.fecha_fin_real,
    a.cantidad_objetivo, a.cantidad_ejecutada, a.unidad, a.avance_porcentaje,
    'en_curso'::TEXT
  FROM actividades a
  JOIN procesos pr ON pr.id = a.proceso_id
  WHERE a.proyecto_id = v_proyecto_id
    AND a.activa = true
    AND a.estado = 'en_progreso'

  UNION ALL

  -- Próximos 5 días: no iniciadas todavía pero programadas a arrancar pronto
  SELECT
    a.id, a.codigo, a.nombre, pr.nombre, a.disciplina, a.estado::TEXT,
    a.fecha_inicio_plan, a.fecha_fin_plan, a.fecha_inicio_real, a.fecha_fin_real,
    a.cantidad_objetivo, a.cantidad_ejecutada, a.unidad, a.avance_porcentaje,
    'proximo'::TEXT
  FROM actividades a
  JOIN procesos pr ON pr.id = a.proceso_id
  WHERE a.proyecto_id = v_proyecto_id
    AND a.activa = true
    AND a.estado = 'no_iniciada'
    AND a.fecha_inicio_plan IS NOT NULL
    AND a.fecha_inicio_plan BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '5 days')

  ORDER BY 15, 7 NULLS LAST; -- grupo, luego fecha_inicio_plan
END;
$$;

REVOKE ALL ON FUNCTION checkin_actividades_proyecto(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION checkin_actividades_proyecto(UUID) TO anon, authenticated;
