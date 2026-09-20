-- ============================================================
-- 093 — Avance general del portal cliente: mezcla costo + duración
-- ============================================================
-- El portal cliente calculaba "Avance general" como un promedio
-- SIMPLE de avance_porcentaje entre todas las actividades (sin
-- ponderar). El dashboard interno usaba un promedio ponderado SOLO
-- por costo_presupuesto (mismo criterio que la facturación
-- automática -- "Earned Value"). Resultado: el cliente veía un
-- número distinto al del dueño (ej. 26% vs 8%).
--
-- Al corregirlo se planteó una duda válida: ponderar solo por costo
-- puede distorsionar el avance "real" de obra -- una actividad cara
-- (ej. compra de materiales importados) puede pesar mucho en dólares
-- sin representar mucho trabajo físico instalado, mientras que una
-- actividad barata pero de varias semanas de duración pesa poco.
--
-- Se decidió mezclar dos criterios de ponderación en partes iguales:
--   1) costo_presupuesto (material + mano de obra) -- refleja el
--      peso económico/contractual de cada actividad.
--   2) duracion_plan_dias -- refleja el peso en tiempo/cronograma.
-- El avance final es el promedio de ambos resultados ponderados.
--
-- IMPORTANTE: esto es solo para las pantallas de estatus (portal
-- cliente y KPI "Avance físico" del dashboard interno, ver también
-- src/lib/dashboard/queries.ts). La facturación automática
-- (generar_facturas_semanales) sigue usando SOLO costo_presupuesto,
-- porque ahí "avance ponderado" es Earned Value real: representa
-- cuánto dinero del contrato ya se ganó, y eso debe ser puramente
-- económico, no mezclado con días de cronograma.
-- ============================================================

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
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  -- Ponderado por costo_presupuesto (material + mano de obra)
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

  -- Ponderado por duracion_plan_dias (peso en cronograma)
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
