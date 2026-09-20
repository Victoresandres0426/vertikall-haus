-- ============================================================
-- 105 — Fotos vinculadas a la actividad dentro del reporte diario
-- ============================================================
-- Completa lo que empezó la migración 104 (bucket de Storage): ahora
-- que sí se pueden subir fotos por actividad al enviar el reporte
-- (avance_diario.fotos), esta migración hace dos cosas:
--
-- 1) actualizar_reporte_diario (edición de un reporte pasado desde
--    Historial) ya NO pierde las fotos cargadas -- antes, como borra y
--    vuelve a insertar avance_diario en cada edición, cualquier ajuste
--    (aunque fuera solo cambiar una hora) hubiera borrado las fotos de
--    esa actividad sin querer. Ahora las rescata antes de borrar y las
--    vuelve a poner en su lugar, salvo que el llamador mande fotos
--    nuevas explícitamente para esa actividad.
--
-- 2) cliente_ver_reportes() ahora agrupa las fotos POR actividad
--    (código, nombre, nombre_en) en vez de una sola lista plana
--    mezclada -- así el portal del cliente puede mostrar "bajo la
--    actividad X: estas fotos" en vez de fotos sueltas sin contexto.
--    Cambia la forma del JSON que devuelve (clave nueva
--    "fotos_por_actividad" en vez de "fotos") -- como esa función
--    nunca había devuelto fotos reales hasta ahora (la columna estaba
--    vacía en todos los reportes), no hay clientes existentes del
--    formato viejo que romper.
-- ============================================================

CREATE OR REPLACE FUNCTION actualizar_reporte_diario(
  p_reporte_id UUID,
  p_clima TEXT,
  p_observaciones TEXT,
  p_asistencias JSONB,     -- [{trabajador_id, presente, horas_regulares, horas_extra}]
  p_avances JSONB,         -- [{actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias, fotos?}]
  p_horas_actividad JSONB  -- [{trabajador_id, actividad_id, rol_aplicado, horas, avance_cantidad}]
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

REVOKE ALL ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION actualizar_reporte_diario(UUID, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;

-- ── Portal cliente: fotos agrupadas por actividad ───────────────────
CREATE OR REPLACE FUNCTION cliente_ver_reportes()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'fecha', r.fecha,
      'clima', r.clima,
      'clima_en', r.clima_en,
      'observaciones_generales', r.observaciones_generales,
      'observaciones_generales_en', r.observaciones_generales_en,
      'fotos_por_actividad', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'actividad_id', ad.actividad_id,
            'codigo', a.codigo,
            'nombre', a.nombre,
            'nombre_en', a.nombre_en,
            'fotos', ad.fotos
          ) ORDER BY a.codigo
        ), '[]'::jsonb)
        FROM avance_diario ad
        JOIN actividades a ON a.id = ad.actividad_id
        WHERE ad.reporte_id = r.id AND jsonb_array_length(ad.fotos) > 0
      )
    ) ORDER BY r.fecha DESC
  ), '[]'::jsonb) INTO v_result
  FROM reportes_diarios r
  WHERE r.proyecto_id = v_proyecto_id
    AND r.estado_reporte = 'validado';

  RETURN v_result;
END;
$$;
