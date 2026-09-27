-- ============================================================
-- 111 — Permitir editar la fecha de un reporte diario ya enviado
-- ============================================================
-- Hasta ahora, "Editar reporte" (Historial) dejaba corregir clima,
-- observaciones, asistencia y avance de un día ya enviado, pero la
-- fecha se mostraba como texto fijo -- si un capataz metió el reporte
-- en el día equivocado, no había forma de arreglarlo desde la UI.
--
-- Se agrega p_fecha como parámetro NUEVO con DEFAULT NULL (para no
-- romper ninguna llamada existente que no lo mande) -- si viene, se
-- actualiza reportes_diarios.fecha.
--
-- Como reportes_diarios tiene UNIQUE(proyecto_id, capataz_id, fecha),
-- mover la fecha a un día donde ese mismo capataz ya tiene otro reporte
-- en ese proyecto choca con esa restricción -- se atrapa el error y se
-- relanza como 'fecha_duplicada', para que la UI pueda mostrar un
-- mensaje claro en vez del texto crudo de Postgres.
-- ============================================================

CREATE OR REPLACE FUNCTION actualizar_reporte_diario(
  p_reporte_id UUID,
  p_clima TEXT,
  p_observaciones TEXT,
  p_asistencias JSONB,
  p_avances JSONB,
  p_horas_actividad JSONB,
  p_fecha DATE DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_empresa_id UUID;
  v_fotos_previas JSONB;
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

  -- Rescata las fotos ya cargadas por actividad antes de borrar --
  -- Historial todavía no tiene UI para tocar fotos, así que se
  -- preservan tal cual quedaron al enviar el reporte, salvo que
  -- p_avances sí traiga "fotos" explícitas para esa actividad.
  SELECT COALESCE(jsonb_object_agg(actividad_id, fotos), '{}'::jsonb) INTO v_fotos_previas
  FROM avance_diario WHERE reporte_id = p_reporte_id AND jsonb_array_length(fotos) > 0;

  -- Limpia lo que había antes de este reporte específico.
  DELETE FROM costos_reales WHERE reporte_id = p_reporte_id;
  DELETE FROM asistencia_actividad_diaria WHERE reporte_id = p_reporte_id;
  DELETE FROM avance_diario WHERE reporte_id = p_reporte_id;
  DELETE FROM asistencia_diaria WHERE reporte_id = p_reporte_id;

  BEGIN
    UPDATE reportes_diarios
    SET clima = p_clima,
        observaciones_generales = p_observaciones,
        fecha = COALESCE(p_fecha, fecha),
        updated_at = NOW()
    WHERE id = p_reporte_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'fecha_duplicada';
  END;

  INSERT INTO asistencia_diaria (reporte_id, trabajador_id, presente, horas_regulares, horas_extra)
  SELECT
    p_reporte_id,
    (e->>'trabajador_id')::UUID,
    COALESCE((e->>'presente')::BOOLEAN, true),
    COALESCE((e->>'horas_regulares')::DECIMAL, 0),
    COALESCE((e->>'horas_extra')::DECIMAL, 0)
  FROM jsonb_array_elements(COALESCE(p_asistencias, '[]'::jsonb)) e
  WHERE e->>'trabajador_id' IS NOT NULL;

  -- ON CONFLICT: si p_avances trajera la misma actividad dos veces, la
  -- segunda reemplaza a la primera en vez de duplicarse (migración 065).
  INSERT INTO avance_diario (reporte_id, actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias, fotos)
  SELECT
    p_reporte_id,
    (e->>'actividad_id')::UUID,
    COALESCE((e->>'cantidad_ejecutada_dia')::DECIMAL, 0),
    NULLIF(e->>'porcentaje_avance_total', '')::DECIMAL,
    NULLIF(e->>'incidencias', ''),
    COALESCE(e->'fotos', v_fotos_previas->(e->>'actividad_id'), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_avances, '[]'::jsonb)) e
  WHERE e->>'actividad_id' IS NOT NULL
  ON CONFLICT (reporte_id, actividad_id) DO UPDATE SET
    cantidad_ejecutada_dia = EXCLUDED.cantidad_ejecutada_dia,
    porcentaje_avance_total = EXCLUDED.porcentaje_avance_total,
    incidencias = EXCLUDED.incidencias,
    fotos = EXCLUDED.fotos;

  -- Reutiliza el mismo cálculo de destajo/por hora que un reporte nuevo.
  PERFORM registrar_asistencia_actividad(p_reporte_id, p_horas_actividad);

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB, DATE) TO authenticated;
