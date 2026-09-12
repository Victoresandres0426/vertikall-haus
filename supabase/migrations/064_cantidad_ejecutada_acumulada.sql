-- ============================================================
-- 064 — cantidad_ejecutada debe ser un ACUMULADO real, no el
--        último día reportado
-- ============================================================
-- Hasta ahora, cada vez que se guardaba un Reporte Diario (nuevo o
-- editado), actividades.cantidad_ejecutada se REEMPLAZABA por
-- "cantidad_ejecutada_dia" de ESE reporte -- es decir, por lo avanzado
-- SOLO ese día, no por el total acumulado de todos los reportes de esa
-- actividad. Si una actividad se reportaba en más de un día distinto,
-- el número que se veía en Actividades terminaba siendo el del último
-- reporte nada más, perdiendo lo acumulado en reportes anteriores.
--
-- Esto producía justo el síntoma reportado: una actividad marcada
-- "100% avance" pero con "Cant: 3.5 / 9" -- el % se calculaba y
-- guardaba bien (aparte, acumulado en el cliente), pero la cantidad
-- mostrada no, dando una falsa sensación de sobrecosto (el costo real sí
-- se suma correctamente de TODOS los días, así que contra una cantidad
-- subestimada se ve desproporcionado).
--
-- La solución sigue el mismo patrón ya usado para costo_real (migración
-- 057) y costo_presupuesto (migración 063): en vez de que cada acción de
-- la app intente llevar la cuenta a mano, un trigger sobre avance_diario
-- recalcula cantidad_ejecutada como la SUMA real de todos sus reportes
-- cada vez que se inserta, edita o borra un renglón de avance_diario.
-- ============================================================

-- Recalcula cantidad_ejecutada / avance_porcentaje / estado de UNA
-- actividad a partir de la suma real de avance_diario. Función aparte
-- (no solo el trigger) para poder reutilizarla también en el backfill.
CREATE OR REPLACE FUNCTION _recalcular_avance_actividad(p_actividad_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total DECIMAL(14,3);
  v_objetivo DECIMAL(14,3);
  v_estado_actual estado_actividad;
  v_pct DECIMAL(6,2);
BEGIN
  IF p_actividad_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cantidad_ejecutada_dia), 0) INTO v_total
  FROM avance_diario
  WHERE actividad_id = p_actividad_id;

  SELECT cantidad_objetivo, estado INTO v_objetivo, v_estado_actual
  FROM actividades WHERE id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Si no hay cantidad_objetivo (caso raro), no se puede calcular %
  -- a partir de la cantidad -- se deja el avance_porcentaje como está
  -- (seguirá viniendo de lo que mande el cliente en ese caso).
  v_pct := CASE WHEN COALESCE(v_objetivo, 0) > 0
    THEN ROUND((v_total / v_objetivo) * 100)
    ELSE NULL
  END;

  UPDATE actividades
  SET
    cantidad_ejecutada = v_total,
    avance_porcentaje = COALESCE(v_pct, avance_porcentaje),
    estado = (CASE
      WHEN v_pct IS NOT NULL AND v_pct >= 100 THEN 'completada'
      WHEN v_total > 0 THEN 'en_progreso'
      ELSE v_estado_actual
    END)::estado_actividad
  WHERE id = p_actividad_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_cantidad_ejecutada_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM _recalcular_avance_actividad(OLD.actividad_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM _recalcular_avance_actividad(NEW.actividad_id);
    IF OLD.actividad_id IS DISTINCT FROM NEW.actividad_id THEN
      PERFORM _recalcular_avance_actividad(OLD.actividad_id);
    END IF;
  ELSE
    PERFORM _recalcular_avance_actividad(NEW.actividad_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_avance_diario_sync_cantidad ON avance_diario;
CREATE TRIGGER trg_avance_diario_sync_cantidad
AFTER INSERT OR UPDATE OR DELETE ON avance_diario
FOR EACH ROW EXECUTE FUNCTION trg_sync_cantidad_ejecutada_actividad();

-- ── Backfill: corrige lo que ya está mal guardado hoy ──
-- Solo toca actividades que tienen al menos un reporte de avance -- las
-- que nunca se han reportado se dejan intactas.
UPDATE actividades a
SET
  cantidad_ejecutada = sub.total,
  avance_porcentaje = CASE
    WHEN a.cantidad_objetivo > 0 THEN ROUND((sub.total / a.cantidad_objetivo) * 100)
    ELSE a.avance_porcentaje
  END,
  estado = (CASE
    WHEN a.cantidad_objetivo > 0 AND ROUND((sub.total / a.cantidad_objetivo) * 100) >= 100 THEN 'completada'
    WHEN sub.total > 0 THEN 'en_progreso'
    ELSE a.estado
  END)::estado_actividad
FROM (
  SELECT actividad_id, SUM(cantidad_ejecutada_dia) AS total
  FROM avance_diario
  GROUP BY actividad_id
) sub
WHERE a.id = sub.actividad_id;

-- ── actualizar_reporte_diario: ya no necesita tocar cantidad_ejecutada
-- a mano -- el trigger de arriba se dispara solo con el INSERT INTO
-- avance_diario que ya hace esta misma función, unas líneas antes. Se
-- quita ese bloque para no pisar el resultado correcto del trigger.
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

  -- El trigger trg_avance_diario_sync_cantidad recalcula solo, a partir
  -- de aquí, cantidad_ejecutada/avance_porcentaje/estado de cada
  -- actividad afectada -- ya no hace falta un UPDATE actividades manual.
  INSERT INTO avance_diario (reporte_id, actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias)
  SELECT
    p_reporte_id,
    (e->>'actividad_id')::UUID,
    COALESCE((e->>'cantidad_ejecutada_dia')::DECIMAL, 0),
    NULLIF(e->>'porcentaje_avance_total', '')::DECIMAL,
    NULLIF(e->>'incidencias', '')
  FROM jsonb_array_elements(COALESCE(p_avances, '[]'::jsonb)) e
  WHERE e->>'actividad_id' IS NOT NULL;

  -- Reutiliza el mismo cálculo de destajo/por hora que un reporte nuevo.
  PERFORM registrar_asistencia_actividad(p_reporte_id, p_horas_actividad);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;
