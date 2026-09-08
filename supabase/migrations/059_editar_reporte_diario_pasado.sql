-- ============================================================
-- 059 — Editar un Reporte Diario ya enviado (dueño/PM/administrador)
-- ============================================================
-- Hasta ahora no existía forma de ver ni corregir un reporte de un día
-- anterior: no había pantalla de historial, y ni siquiera se podía
-- reenviar (hay un UNIQUE(proyecto_id, capataz_id, fecha) en
-- reportes_diarios que lo bloquearía).
--
-- Esta migración agrega:
-- 1) costos_reales.reporte_id -- para poder identificar y borrar con
--    precisión los costos de mano de obra de UN reporte específico al
--    editarlo (antes solo se podían rastrear por proyecto+fecha, lo que
--    mezclaría reportes de distintos capataces el mismo día).
-- 2) registrar_asistencia_actividad ahora también graba ese reporte_id
--    (mismo cálculo de destajo/por hora de la migración 054, sin
--    cambios de comportamiento).
-- 3) Backfill best-effort de reporte_id para costos ya existentes.
-- 4) actualizar_reporte_diario(): SECURITY DEFINER que reemplaza por
--    completo la asistencia/avance/costos de un reporte ya guardado --
--    solo dueno/superadmin/administrador/project_manager, y solo si
--    tienen acceso a ese proyecto (usuario_ve_proyecto). El capataz NO
--    puede llamarla -- solo puede seguir creando reportes nuevos vía
--    registrar_asistencia_actividad/crearReporteDiario, no editar los
--    ya enviados.
-- ============================================================

ALTER TABLE costos_reales ADD COLUMN IF NOT EXISTS reporte_id UUID REFERENCES reportes_diarios(id) ON DELETE SET NULL;

-- Backfill best-effort: empareja costos de mano de obra ya existentes
-- con su reporte por (actividad, trabajador, fecha, proyecto).
UPDATE costos_reales cr
SET reporte_id = r.id
FROM asistencia_actividad_diaria aad
JOIN reportes_diarios r ON r.id = aad.reporte_id
WHERE cr.reporte_id IS NULL
  AND cr.tipo_recurso = 'mano_obra'
  AND cr.actividad_id = aad.actividad_id
  AND cr.trabajador_id = aad.trabajador_id
  AND cr.fecha = r.fecha
  AND cr.proyecto_id = r.proyecto_id;

-- ── registrar_asistencia_actividad: ahora también graba reporte_id ──
CREATE OR REPLACE FUNCTION registrar_asistencia_actividad(p_reporte_id UUID, p_entradas JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_empresa_id UUID;
  v_fecha DATE;
  v_entrada JSONB;
  v_trabajador_id UUID;
  v_actividad_id UUID;
  v_rol TEXT;
  v_horas DECIMAL(5,2);
  v_avance DECIMAL(12,3);
  v_tarifa_hora DECIMAL(10,2);
  v_tarifa_unitaria DECIMAL(12,4);
  v_costo DECIMAL(12,2);
  v_modo TEXT;
  v_total DECIMAL(12,2) := 0;
BEGIN
  SELECT r.proyecto_id, p.empresa_id, r.fecha INTO v_proyecto_id, v_empresa_id, v_fecha
  FROM reportes_diarios r
  JOIN proyectos p ON p.id = r.proyecto_id
  WHERE r.id = p_reporte_id;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'reporte_no_encontrado';
  END IF;

  IF v_empresa_id IS NULL OR v_empresa_id <> get_empresa_id() THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  FOR v_entrada IN SELECT * FROM jsonb_array_elements(COALESCE(p_entradas, '[]'::jsonb))
  LOOP
    v_trabajador_id := (v_entrada->>'trabajador_id')::UUID;
    v_actividad_id  := (v_entrada->>'actividad_id')::UUID;
    v_rol           := NULLIF(v_entrada->>'rol_aplicado', '');
    v_horas         := COALESCE((v_entrada->>'horas')::DECIMAL, 0);
    v_avance        := NULLIF(v_entrada->>'avance_cantidad', '')::DECIMAL;

    IF v_trabajador_id IS NULL OR v_actividad_id IS NULL
       OR (v_horas <= 0 AND COALESCE(v_avance, 0) <= 0) THEN
      CONTINUE;
    END IF;

    v_tarifa_hora := NULL;
    v_tarifa_unitaria := NULL;
    v_modo := 'hora';

    SELECT pp.precio_unitario INTO v_tarifa_unitaria
    FROM partidas_presupuesto pp
    JOIN presupuestos pr ON pr.id = pp.presupuesto_id
    WHERE pp.actividad_id = v_actividad_id
      AND pp.tipo_recurso = 'mano_obra'
      AND pr.es_baseline_actual = true
    ORDER BY pr.created_at DESC
    LIMIT 1;

    IF v_tarifa_unitaria IS NULL THEN
      SELECT a.costo_mano_obra / NULLIF(a.cantidad_objetivo, 0) INTO v_tarifa_unitaria
      FROM actividades a WHERE a.id = v_actividad_id;
    END IF;

    IF COALESCE(v_avance, 0) > 0 AND v_tarifa_unitaria IS NOT NULL THEN
      v_costo := v_avance * v_tarifa_unitaria;
      v_modo := 'destajo';
    ELSE
      SELECT tt.tarifa_hora INTO v_tarifa_hora
      FROM tarifas_trabajo tt
      WHERE tt.trabajador_id = v_trabajador_id
        AND tt.rol_obra = v_rol
        AND tt.activo = true;

      IF v_tarifa_hora IS NULL THEN
        SELECT t.tarifa_hora INTO v_tarifa_hora FROM trabajadores t WHERE t.id = v_trabajador_id;
      END IF;

      v_costo := v_horas * COALESCE(v_tarifa_hora, 0);
      v_modo := 'hora';
    END IF;

    v_total := v_total + v_costo;

    INSERT INTO asistencia_actividad_diaria
      (reporte_id, trabajador_id, actividad_id, rol_aplicado, horas, tarifa_hora_aplicada,
       avance_cantidad, tarifa_unitaria_aplicada, modo_pago, costo)
    VALUES
      (p_reporte_id, v_trabajador_id, v_actividad_id, v_rol, v_horas, v_tarifa_hora,
       v_avance, v_tarifa_unitaria, v_modo, v_costo);

    IF v_costo > 0 THEN
      INSERT INTO costos_reales
        (proyecto_id, actividad_id, tipo_recurso, descripcion, trabajador_id, fecha, monto, aprobado, reporte_id)
      VALUES
        (v_proyecto_id, v_actividad_id, 'mano_obra',
         CASE WHEN v_modo = 'destajo'
           THEN 'Mano de obra (destajo)' || CASE WHEN v_rol IS NOT NULL THEN ' — ' || v_rol ELSE '' END || ' — ' || v_avance || ' unid.'
           ELSE 'Mano de obra' || CASE WHEN v_rol IS NOT NULL THEN ' (' || v_rol || ')' ELSE '' END || ' — ' || v_horas || ' h'
         END,
         v_trabajador_id, v_fecha, v_costo, true, p_reporte_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'total_costo', v_total);
END;
$$;

-- ── actualizar_reporte_diario: reemplaza por completo un reporte ya guardado ──
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
    estado = CASE WHEN sub.pct >= 100 THEN 'completada' ELSE 'en_progreso' END
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
