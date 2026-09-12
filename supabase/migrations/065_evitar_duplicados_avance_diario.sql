-- ============================================================
-- 065 — Evitar que una actividad quede duplicada dentro de un
--        mismo reporte (candado a nivel de base de datos)
-- ============================================================
-- Se encontró que la actividad 01.01 tenía 7 renglones de avance_diario
-- repetidos dentro de UN SOLO reporte (mismo reporte_id) del 09-07, y 6
-- repetidos en el del 09-08 -- cada repetición generó su propio pago de
-- destajo, inflando el costo real sin que hubiera trabajo real de más.
-- No se identificó con certeza qué acción exacta produjo esos
-- duplicados (datos de antes de esta sesión), pero conceptualmente
-- nunca debería existir más de UN renglón de avance_diario para la
-- misma actividad dentro del mismo reporte -- así que en vez de solo
-- confiar en que la app no lo vuelva a hacer, se agrega la regla
-- directamente en la base de datos: si algún código (actual o futuro)
-- intenta insertar dos veces la misma actividad en el mismo reporte, la
-- segunda vez actualiza el renglón existente en vez de crear uno nuevo.
--
-- Esta migración FALLARÁ si todavía queda algún otro (reporte_id,
-- actividad_id) duplicado en la base de datos -- eso es intencional: en
-- vez de borrar datos a ciegas, el error señala exactamente cuáles
-- reporte_id/actividad_id revisar a mano (con el mismo método usado
-- para 01.01) antes de poder aplicar el candado.
-- ============================================================

ALTER TABLE avance_diario
  ADD CONSTRAINT avance_diario_reporte_actividad_unico UNIQUE (reporte_id, actividad_id);

-- actualizar_reporte_diario: el INSERT INTO avance_diario ahora usa
-- ON CONFLICT para que, si el arreglo p_avances llegara a traer la
-- misma actividad dos veces (el mismo bug de origen desconocido), la
-- segunda simplemente reemplace a la primera en vez de duplicarse o
-- reventar por violar el candado nuevo.
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

  -- El trigger trg_avance_diario_sync_cantidad (migración 064) recalcula
  -- solo cantidad_ejecutada/avance_porcentaje/estado a partir de aquí.
  -- ON CONFLICT: si p_avances trajera la misma actividad dos veces, la
  -- segunda reemplaza a la primera en vez de duplicarse.
  INSERT INTO avance_diario (reporte_id, actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias)
  SELECT
    p_reporte_id,
    (e->>'actividad_id')::UUID,
    COALESCE((e->>'cantidad_ejecutada_dia')::DECIMAL, 0),
    NULLIF(e->>'porcentaje_avance_total', '')::DECIMAL,
    NULLIF(e->>'incidencias', '')
  FROM jsonb_array_elements(COALESCE(p_avances, '[]'::jsonb)) e
  WHERE e->>'actividad_id' IS NOT NULL
  ON CONFLICT (reporte_id, actividad_id) DO UPDATE SET
    cantidad_ejecutada_dia = EXCLUDED.cantidad_ejecutada_dia,
    porcentaje_avance_total = EXCLUDED.porcentaje_avance_total,
    incidencias = EXCLUDED.incidencias;

  -- Reutiliza el mismo cálculo de destajo/por hora que un reporte nuevo.
  PERFORM registrar_asistencia_actividad(p_reporte_id, p_horas_actividad);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;
