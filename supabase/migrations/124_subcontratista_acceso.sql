-- ============================================================
-- 124 — Acceso del rol 'subcontratista'
-- ============================================================
-- Requiere que 123_rol_subcontratista_enum.sql ya se haya ejecutado
-- en una corrida SEPARADA.
--
-- A diferencia de colaborador_externo (diseñador/arquitecto, ve todo
-- lo del cliente menos Facturas + puede subir archivos), el
-- subcontratista tiene acceso más chico:
--   - Cronograma / avance          -> sí (lectura)
--   - Reportes diarios             -> sí (lectura)
--   - Fotos del proyecto           -> sí (lectura)
--   - Bitácora de obra             -> sí, lectura Y escritura
--     (puede publicar notas y fotos, igual que colaborador_externo)
--   - Planos                       -> sí, SOLO lectura, y SOLO la
--     categoría 'planos' -- nunca 'documentos_colaborador' (specs
--     que sube el colaborador) ni la puede subir él mismo
--   - Facturas                     -> NO (igual que colaborador_externo)
--
-- Reusa titulo_colaborador (migración 118) como campo libre también
-- para el subcontratista -- ej. "Plomería", "Electricidad" -- mismo
-- campo, mismo propósito (texto cosmético que identifica su rol en el
-- proyecto), sin necesidad de una columna nueva.
-- ============================================================

-- ── perfiles_usuario: subcontratista también solo ve su propia fila ─
DROP POLICY IF EXISTS "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario;
CREATE POLICY "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario
  FOR SELECT USING (
    (get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') AND empresa_id = get_empresa_id())
    OR id = auth.uid()
  );

-- ------------------------------------------------------------
-- cliente_ver_proyecto() -- último cuerpo (122, con idioma por
-- persona) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_ver_proyecto()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_idioma TEXT;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(pu.idioma_portal, p.idioma_cliente, 'es') INTO v_idioma
  FROM proyectos p
  LEFT JOIN perfiles_usuario pu ON pu.id = auth.uid()
  WHERE p.id = v_proyecto_id;

  SELECT jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'nombre', p.nombre,
    'descripcion', p.descripcion,
    'ubicacion', p.ubicacion,
    'estado', p.estado,
    'fecha_inicio_plan', p.fecha_inicio_plan,
    'fecha_fin_plan', p.fecha_fin_plan,
    'fecha_inicio_real', p.fecha_inicio_real,
    'fecha_fin_forecast', p.fecha_fin_forecast,
    'presupuesto_venta', p.presupuesto_venta,
    'idioma_cliente', v_idioma,
    'empresa_nombre', e.nombre,
    'empresa_logo_url', e.logo_url
  ) INTO v_result
  FROM proyectos p
  JOIN empresas e ON e.id = p.empresa_id
  WHERE p.id = v_proyecto_id;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- cliente_actualizar_idioma() -- último cuerpo (122) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_actualizar_idioma(p_idioma TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  IF p_idioma NOT IN ('es', 'en') THEN
    RAISE EXCEPTION 'idioma_invalido';
  END IF;

  UPDATE perfiles_usuario SET idioma_portal = p_idioma WHERE id = auth.uid();
END;
$$;

-- ------------------------------------------------------------
-- cliente_ver_avance() -- último cuerpo (097) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_ver_avance()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'proceso_id', pr.id,
      'proceso', pr.nombre,
      'proceso_en', COALESCE(pr.nombre_en, pr.nombre),
      'proceso_orden', pr.orden,
      'actividad_id', a.id,
      'codigo', a.codigo,
      'nombre', a.nombre,
      'nombre_en', COALESCE(a.nombre_en, a.nombre),
      'fecha_inicio_plan', a.fecha_inicio_plan,
      'fecha_fin_plan', a.fecha_fin_plan,
      'fecha_inicio_real', a.fecha_inicio_real,
      'fecha_fin_real', a.fecha_fin_real,
      'avance_porcentaje', a.avance_porcentaje,
      'estado', a.estado,
      'es_critica', a.es_critica
    ) ORDER BY pr.orden, a.fecha_inicio_plan NULLS LAST, a.codigo
  ), '[]'::jsonb) INTO v_result
  FROM actividades a
  JOIN procesos pr ON pr.id = a.proceso_id
  WHERE a.proyecto_id = v_proyecto_id AND a.activa IS NOT FALSE;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- cliente_ver_avance_general() -- último cuerpo (093) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_ver_avance_general()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_avance_costo DECIMAL(7,2);
  v_avance_duracion DECIMAL(7,2);
  v_plan_costo DECIMAL(7,2);
  v_plan_duracion DECIMAL(7,2);
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT
    CASE WHEN SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1)) > 0
      THEN SUM(COALESCE(act.avance_porcentaje, 0) * GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
           / SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
      ELSE 0
    END,
    CASE WHEN SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1)) > 0
      THEN SUM(
        (CASE
          WHEN act.fecha_inicio_plan IS NULL OR act.fecha_fin_plan IS NULL THEN 0
          WHEN CURRENT_DATE >= act.fecha_fin_plan THEN 100
          WHEN CURRENT_DATE <= act.fecha_inicio_plan THEN 0
          ELSE (CURRENT_DATE - act.fecha_inicio_plan)::DECIMAL
               / NULLIF((act.fecha_fin_plan - act.fecha_inicio_plan), 0) * 100
        END) * GREATEST(COALESCE(act.costo_presupuesto, 0), 1)
      ) / SUM(GREATEST(COALESCE(act.costo_presupuesto, 0), 1))
      ELSE 0
    END
  INTO v_avance_costo, v_plan_costo
  FROM actividades act
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE;

  SELECT
    CASE WHEN SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)) > 0
      THEN SUM(COALESCE(act.avance_porcentaje, 0) * GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
           / SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
      ELSE 0
    END,
    CASE WHEN SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)) > 0
      THEN SUM(
        (CASE
          WHEN act.fecha_inicio_plan IS NULL OR act.fecha_fin_plan IS NULL THEN 0
          WHEN CURRENT_DATE >= act.fecha_fin_plan THEN 100
          WHEN CURRENT_DATE <= act.fecha_inicio_plan THEN 0
          ELSE (CURRENT_DATE - act.fecha_inicio_plan)::DECIMAL
               / NULLIF((act.fecha_fin_plan - act.fecha_inicio_plan), 0) * 100
        END) * GREATEST(COALESCE(act.duracion_plan_dias, 0), 1)
      ) / SUM(GREATEST(COALESCE(act.duracion_plan_dias, 0), 1))
      ELSE 0
    END
  INTO v_avance_duracion, v_plan_duracion
  FROM actividades act
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE;

  RETURN jsonb_build_object(
    'avance_real_pct', ROUND((COALESCE(v_avance_costo, 0) + COALESCE(v_avance_duracion, 0)) / 2, 1),
    'avance_plan_pct', ROUND(LEAST((COALESCE(v_plan_costo, 0) + COALESCE(v_plan_duracion, 0)) / 2, 100), 1)
  );
END;
$$;

-- ------------------------------------------------------------
-- cliente_ver_reportes() -- último cuerpo (106) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_ver_reportes()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
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
      'avance_por_actividad', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'actividad_id', ad.actividad_id,
            'codigo', a.codigo,
            'nombre', a.nombre,
            'nombre_en', a.nombre_en,
            'avance_dia_pct', CASE
              WHEN a.cantidad_objetivo IS NOT NULL AND a.cantidad_objetivo > 0
                THEN ROUND((ad.cantidad_ejecutada_dia / a.cantidad_objetivo) * 100, 1)
              ELSE NULL
            END
          ) ORDER BY a.codigo
        ), '[]'::jsonb)
        FROM avance_diario ad
        JOIN actividades a ON a.id = ad.actividad_id
        WHERE ad.reporte_id = r.id AND ad.cantidad_ejecutada_dia > 0
      ),
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

-- ------------------------------------------------------------
-- cliente_ver_fotos() -- último cuerpo (103) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_ver_fotos()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'nombre_archivo', a.nombre_archivo,
      'storage_path', a.storage_path,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM proyecto_archivos a
  WHERE a.proyecto_id = v_proyecto_id AND a.categoria = 'fotos';

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- cliente_ver_avance_historico() -- último cuerpo (109) + subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_ver_avance_historico()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
  v_hoy_general JSONB;
  v_ultima_fecha DATE;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  WITH fechas AS (
    SELECT DISTINCT r.fecha
    FROM reportes_diarios r
    WHERE r.proyecto_id = v_proyecto_id AND r.estado_reporte = 'validado'
  ),
  acts AS (
    SELECT
      id,
      GREATEST(COALESCE(costo_presupuesto, 0), 1) AS peso_costo,
      GREATEST(COALESCE(duracion_plan_dias, 0), 1) AS peso_dur,
      NULLIF(COALESCE(cantidad_objetivo, 0), 0) AS objetivo,
      fecha_inicio_plan,
      fecha_fin_plan
    FROM actividades
    WHERE proyecto_id = v_proyecto_id AND activa IS NOT FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha,
      a.peso_costo,
      a.peso_dur,
      LEAST(
        COALESCE((
          SELECT SUM(ad.cantidad_ejecutada_dia)
          FROM avance_diario ad
          JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
          WHERE ad.actividad_id = a.id
            AND r2.estado_reporte = 'validado'
            AND r2.fecha <= f.fecha
        ), 0) / a.objetivo * 100
      , 100) AS avance_pct,
      (CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL
             / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END) AS plan_pct
    FROM fechas f
    CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT
      fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur,
      SUM(COALESCE(plan_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS plan_costo,
      SUM(COALESCE(plan_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS plan_dur
    FROM avance_por_fecha
    GROUP BY fecha
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'fecha', fecha,
        'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1),
        'avance_plan_pct', ROUND(LEAST((COALESCE(plan_costo, 0) + COALESCE(plan_dur, 0)) / 2, 100), 1)
      ) ORDER BY fecha
    ), '[]'::jsonb),
    MAX(fecha)
  INTO v_result, v_ultima_fecha
  FROM ponderado;

  IF v_ultima_fecha IS NULL OR v_ultima_fecha < CURRENT_DATE THEN
    v_hoy_general := cliente_ver_avance_general();
    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'fecha', CURRENT_DATE,
        'avance_pct', COALESCE((v_hoy_general->>'avance_real_pct')::DECIMAL, 0),
        'avance_plan_pct', COALESCE((v_hoy_general->>'avance_plan_pct')::DECIMAL, 0)
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- cliente_guardar_traduccion_reporte() -- último cuerpo (098) +
-- subcontratista
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cliente_guardar_traduccion_reporte(
  p_reporte_id UUID,
  p_observaciones_en TEXT,
  p_clima_en TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  IF get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  UPDATE reportes_diarios
  SET observaciones_generales_en = COALESCE(p_observaciones_en, observaciones_generales_en),
      clima_en = COALESCE(p_clima_en, clima_en)
  WHERE id = p_reporte_id AND proyecto_id = v_proyecto_id;
END;
$$;

-- ============================================================
-- Bitácora: subcontratista también puede leer Y escribir
-- ============================================================
DROP POLICY IF EXISTS "ve_bitacora_proyecto" ON bitacora_proyecto;
CREATE POLICY "ve_bitacora_proyecto" ON bitacora_proyecto
  FOR SELECT USING (
    (get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') AND usuario_ve_proyecto(proyecto_id))
    OR (get_rol_usuario() IN ('cliente', 'colaborador_externo', 'subcontratista') AND proyecto_id = get_proyecto_cliente())
  );

DROP POLICY IF EXISTS "escribe_bitacora_proyecto" ON bitacora_proyecto;
CREATE POLICY "escribe_bitacora_proyecto" ON bitacora_proyecto
  FOR INSERT WITH CHECK (
    (get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager') AND usuario_ve_proyecto(proyecto_id))
    OR (get_rol_usuario() IN ('colaborador_externo', 'subcontratista') AND proyecto_id = get_proyecto_cliente())
  );

DROP POLICY IF EXISTS "ve_fotos_bitacora" ON storage.objects;
CREATE POLICY "ve_fotos_bitacora" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bitacora-fotos' AND (
      (get_rol_usuario() NOT IN ('cliente', 'colaborador_externo', 'subcontratista') AND usuario_ve_proyecto((storage.foldername(name))[1]::uuid))
      OR (get_rol_usuario() IN ('cliente', 'colaborador_externo', 'subcontratista') AND (storage.foldername(name))[1]::uuid = get_proyecto_cliente())
    )
  );

DROP POLICY IF EXISTS "sube_fotos_bitacora" ON storage.objects;
CREATE POLICY "sube_fotos_bitacora" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bitacora-fotos' AND (
      (get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager') AND usuario_ve_proyecto((storage.foldername(name))[1]::uuid))
      OR (get_rol_usuario() IN ('colaborador_externo', 'subcontratista') AND (storage.foldername(name))[1]::uuid = get_proyecto_cliente())
    )
  );

-- ============================================================
-- Archivos / Planos: subcontratista ve SOLO categoría 'planos', sin
-- poder subir. colaborador_externo sigue viendo planos +
-- documentos_colaborador y sigue siendo el único que puede subir.
-- ============================================================
DROP POLICY IF EXISTS "portal_ve_archivos_proyecto" ON storage.objects;
CREATE POLICY "portal_ve_archivos_proyecto" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proyecto-archivos' AND (
      (get_rol_usuario() = 'colaborador_externo' AND (storage.foldername(name))[1]::uuid = get_proyecto_cliente() AND (storage.foldername(name))[2] IN ('planos', 'documentos_colaborador'))
      OR (get_rol_usuario() = 'subcontratista' AND (storage.foldername(name))[1]::uuid = get_proyecto_cliente() AND (storage.foldername(name))[2] = 'planos')
    )
  );

DROP POLICY IF EXISTS "portal_ve_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "portal_ve_metadata_archivos" ON proyecto_archivos
  FOR SELECT USING (
    (get_rol_usuario() = 'colaborador_externo' AND proyecto_id = get_proyecto_cliente() AND categoria IN ('planos', 'documentos_colaborador'))
    OR (get_rol_usuario() = 'subcontratista' AND proyecto_id = get_proyecto_cliente() AND categoria = 'planos')
  );

-- (las políticas de INSERT -- colaborador_sube_archivos_proyecto /
-- colaborador_inserta_metadata_archivos, migración 119 -- no cambian:
-- siguen exclusivas de colaborador_externo, el subcontratista nunca
-- sube archivos.)

CREATE OR REPLACE FUNCTION colaborador_ver_archivos()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_rol TEXT;
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  v_rol := get_rol_usuario();
  IF v_rol NOT IN ('colaborador_externo', 'subcontratista') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'categoria', a.categoria,
      'nombre_archivo', a.nombre_archivo,
      'storage_path', a.storage_path,
      'tamano_bytes', a.tamano_bytes,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM proyecto_archivos a
  WHERE a.proyecto_id = v_proyecto_id
    AND (
      (v_rol = 'colaborador_externo' AND a.categoria IN ('planos', 'documentos_colaborador'))
      OR (v_rol = 'subcontratista' AND a.categoria = 'planos')
    );

  RETURN v_result;
END;
$$;
