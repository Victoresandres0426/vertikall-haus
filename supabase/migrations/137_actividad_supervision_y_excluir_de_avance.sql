-- ============================================================
-- 137 — Actividad "Supervisión" reportable en Reporte Diario +
-- bandera excluir_de_avance para actividades administrativas
-- ============================================================
-- Problema: "Supervisión (PM + capataz de tiempo completo)" hoy es
-- solo una partida de costo INDIRECTO (sin actividad_id) -- Reporte
-- Diario solo permite reportar horas contra actividades reales del
-- cronograma, así que no había forma de registrar qué día supervisó
-- el dueño y qué día supervisó el capataz, ni que ese costo se
-- reflejara como gasto real (solo quedaba el monto presupuestado fijo).
--
-- Solución:
--   1. Se crea una actividad real "Supervisión (PM + capataz)" para
--      que aparezca en el selector de Reporte Diario. Ahí se puede
--      registrar horas (dueño o capataz, cualquiera puede aparecer
--      días distintos) y, como ya existe tarifas_trabajo/trabajadores.
--      tarifa_hora, registrar_asistencia_actividad (migración 054) las
--      convierte en costos_reales reales SIN cambios de código -- ya
--      soporta pago "por hora" cuando no hay avance_cantidad/destajo.
--      El costo real de esas horas queda visible en la ficha de la
--      actividad (Actividades) y en los KPIs de costo del proyecto,
--      comparado contra su presupuesto ($9,000, igual que IND-01).
--
--   2. Esta actividad NO representa avance físico real (no se mide en
--      % completado, es trabajo continuo) -- así que NO debe contar en
--      los cálculos de avance ponderado/IIDP/cronograma, ni facturarse
--      como si fuera trabajo de contrato. Se agrega
--      actividades.excluir_de_avance (bandera genérica, reutilizable
--      para futuros casos similares) y se excluyen esas actividades en
--      los mismos lugares que ya excluyen actividades inactivas o de
--      Change Order: cliente_ver_avance_general (portal),
--      proyecto_avance_historico (gráfico interno) y
--      generar_facturas_semanales (factura semanal al cliente).
--
-- Importante -- decisión deliberada: la partida INDIRECTA existente de
-- Supervisión (IND-01, presupuestos > partidas_presupuesto,
-- tipo_recurso='indirecto', actividad_id IS NULL) se deja TAL CUAL, sin
-- tocar. Esa partida es la que generar_facturas_semanales usa para
-- reconocerle al cliente el costo indirecto conforme avanza el
-- proyecto en general -- si se le pusiera actividad_id, saldría del
-- grupo "indirecto sin actividad" y el cliente dejaría de pagar esos
-- $9,000 de indirectos. Por eso su columna "Gastado" en Presupuesto
-- sigue en blanco -- es presupuesto fijo, no gasto real -- y el costo
-- real de las horas de supervisión se ve en la actividad nueva, no ahí.
-- ============================================================

ALTER TABLE actividades
  ADD COLUMN IF NOT EXISTS excluir_de_avance BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN actividades.excluir_de_avance IS
  'TRUE para actividades administrativas/de overhead (ej. Supervisión) que solo existen para registrar horas y costo real en Reporte Diario, pero no representan avance físico de obra -- se excluyen de avance ponderado, IIDP, gráficos de avance y facturación por avance.';

-- ── cliente_ver_avance_general(): agrega el filtro (última versión, migración 124) ──
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
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE AND act.excluir_de_avance = FALSE;

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
  WHERE act.proyecto_id = v_proyecto_id AND act.activa IS NOT FALSE AND act.excluir_de_avance = FALSE;

  RETURN jsonb_build_object(
    'avance_real_pct', ROUND((COALESCE(v_avance_costo, 0) + COALESCE(v_avance_duracion, 0)) / 2, 1),
    'avance_plan_pct', ROUND(LEAST((COALESCE(v_plan_costo, 0) + COALESCE(v_plan_duracion, 0)) / 2, 100), 1)
  );
END;
$$;

-- ── proyecto_avance_historico(): agrega el filtro (última versión, migración 115) ──
CREATE OR REPLACE FUNCTION proyecto_avance_historico(p_proyecto_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT usuario_ve_proyecto(p_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  WITH fechas AS (
    SELECT DISTINCT r.fecha
    FROM reportes_diarios r
    WHERE r.proyecto_id = p_proyecto_id
    UNION
    SELECT CURRENT_DATE
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
    WHERE proyecto_id = p_proyecto_id AND activa IS NOT FALSE AND excluir_de_avance = FALSE
  ),
  avance_por_fecha AS (
    SELECT
      f.fecha, a.peso_costo, a.peso_dur,
      LEAST(COALESCE((
        SELECT SUM(ad.cantidad_ejecutada_dia) FROM avance_diario ad
        JOIN reportes_diarios r2 ON r2.id = ad.reporte_id
        WHERE ad.actividad_id = a.id AND r2.fecha <= f.fecha
      ), 0) / a.objetivo * 100, 100) AS avance_pct,
      (CASE
        WHEN a.fecha_inicio_plan IS NULL OR a.fecha_fin_plan IS NULL THEN 0
        WHEN f.fecha >= a.fecha_fin_plan THEN 100
        WHEN f.fecha <= a.fecha_inicio_plan THEN 0
        ELSE (f.fecha - a.fecha_inicio_plan)::DECIMAL / NULLIF((a.fecha_fin_plan - a.fecha_inicio_plan), 0) * 100
      END) AS plan_pct
    FROM fechas f CROSS JOIN acts a
  ),
  ponderado AS (
    SELECT fecha,
      SUM(COALESCE(avance_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS avance_costo,
      SUM(COALESCE(avance_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS avance_dur,
      SUM(COALESCE(plan_pct, 0) * peso_costo) / NULLIF(SUM(peso_costo), 0) AS plan_costo,
      SUM(COALESCE(plan_pct, 0) * peso_dur) / NULLIF(SUM(peso_dur), 0) AS plan_dur
    FROM avance_por_fecha GROUP BY fecha
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'fecha', fecha,
      'avance_pct', ROUND((COALESCE(avance_costo, 0) + COALESCE(avance_dur, 0)) / 2, 1),
      'avance_plan_pct', ROUND(LEAST((COALESCE(plan_costo, 0) + COALESCE(plan_dur, 0)) / 2, 100), 1)
    ) ORDER BY fecha
  ), '[]'::jsonb) INTO v_result
  FROM ponderado;

  RETURN v_result;
END;
$$;

-- ── generar_facturas_semanales(): agrega el filtro excluir_de_avance
-- (además de la exclusión ya existente de actividades de Change Order,
-- migración 096), para que Supervisión nunca se facture como si fuera
-- trabajo de contrato -- su costo ya está cubierto por la partida
-- indirecta de siempre. ──
CREATE OR REPLACE FUNCTION generar_facturas_semanales(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(
  proyecto_id UUID,
  proyecto_codigo TEXT,
  numero_generado TEXT,
  monto_generado DECIMAL,
  amortizacion_generada DECIMAL
) AS $$
#variable_conflict use_column
DECLARE
  v_empresa_id UUID;
  v_rol rol_usuario;
  v_proyecto RECORD;
  v_presupuesto_id UUID;
  v_presupuesto_total DECIMAL(15,2);
  v_presupuesto_base DECIMAL(15,2);
  v_presupuesto_venta DECIMAL(15,2);
  v_margen_total DECIMAL(15,2);
  v_avance_ponderado DECIMAL(7,4);
  v_baseline_proyecto DECIMAL(7,4);
  v_delta_fisico DECIMAL(7,4);
  v_anticipo_total DECIMAL(15,2);
  v_pct_anticipo DECIMAL(7,4);
  v_pct_anticipo_pct DECIMAL(7,4);
  v_indirectos_total DECIMAL(15,2);
  v_monto_bruto_total DECIMAL(15,2);
  v_monto_neto_total DECIMAL(15,2);
  v_utilidad_neto_total DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
  v_periodo_inicio DATE;
  v_act RECORD;
  v_baseline_act DECIMAL(5,2);
  v_delta_act DECIMAL(7,2);
  v_desglose_act JSONB;
  v_ejecutado_linea DECIMAL(15,2);
  v_neto_linea DECIMAL(15,2);
  v_amort_linea DECIMAL(15,2);
  v_facturable_ahora DECIMAL(7,4);
  v_facturable_antes DECIMAL(7,4);
  v_usa_disciplinas BOOLEAN;
  v_disc RECORD;
  v_grupo_actividades JSONB;
  v_grupo_bruto DECIMAL(15,2);
  v_grupo_amort DECIMAL(15,2);
  v_grupo_neto DECIMAL(15,2);
  v_grupo_peso DECIMAL(15,2);
  v_grupo_delta_pond DECIMAL(15,4);
  v_grupo_baseline_pond DECIMAL(15,4);
  v_grupo_actual_pond DECIMAL(15,4);
  v_avance_desde DECIMAL(7,2);
  v_avance_hasta DECIMAL(7,2);
BEGIN
  v_empresa_id := COALESCE(p_empresa_id, get_empresa_id());
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF p_empresa_id IS NULL THEN
    v_rol := get_rol_usuario();
    IF v_rol IS NULL OR v_rol NOT IN ('project_manager', 'administrador', 'dueno', 'superadmin') THEN
      RAISE EXCEPTION 'No tienes permisos para generar facturación automática';
    END IF;
  END IF;

  FOR v_proyecto IN
    SELECT pr.id, pr.codigo, pr.presupuesto_base, pr.presupuesto_venta
    FROM proyectos pr
    WHERE pr.empresa_id = v_empresa_id AND pr.activo = true
  LOOP
    v_presupuesto_id := NULL;

    SELECT bl.id, bl.total INTO v_presupuesto_id, v_presupuesto_total
    FROM presupuestos bl
    WHERE bl.proyecto_id = v_proyecto.id AND bl.es_baseline_actual = true
    LIMIT 1;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      SELECT COALESCE(SUM(act.costo_presupuesto), 0) INTO v_presupuesto_total
      FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
        AND act.excluir_de_avance = FALSE
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas);
    END IF;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      CONTINUE;
    END IF;

    v_presupuesto_base := COALESCE(v_proyecto.presupuesto_base, 0);
    v_presupuesto_venta := COALESCE(v_proyecto.presupuesto_venta, 0);
    v_margen_total := GREATEST(v_presupuesto_venta - v_presupuesto_base, 0);

    SELECT
      CASE
        WHEN SUM(act.costo_presupuesto) > 0
          THEN SUM(act.avance_porcentaje * act.costo_presupuesto) / SUM(act.costo_presupuesto)
        WHEN COUNT(*) > 0
          THEN AVG(act.avance_porcentaje)
        ELSE 0
      END
    INTO v_avance_ponderado
    FROM actividades act
    WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
      AND act.excluir_de_avance = FALSE
      AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas);

    v_avance_ponderado := COALESCE(v_avance_ponderado, 0);

    INSERT INTO avance_snapshots_semanales (proyecto_id, fecha, avance_ponderado_pct, presupuesto_total)
    VALUES (v_proyecto.id, CURRENT_DATE, v_avance_ponderado, v_presupuesto_total)
    ON CONFLICT (proyecto_id, fecha) DO UPDATE
      SET avance_ponderado_pct = EXCLUDED.avance_ponderado_pct,
          presupuesto_total = EXCLUDED.presupuesto_total;

    FOR v_act IN
      SELECT act.id, act.avance_porcentaje, act.costo_presupuesto
      FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
        AND act.excluir_de_avance = FALSE
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
    LOOP
      INSERT INTO avance_snapshots_actividad_semanales (proyecto_id, actividad_id, fecha, avance_porcentaje, costo_presupuesto)
      VALUES (v_proyecto.id, v_act.id, CURRENT_DATE, COALESCE(v_act.avance_porcentaje, 0), v_act.costo_presupuesto)
      ON CONFLICT (actividad_id, fecha) DO UPDATE
        SET avance_porcentaje = EXCLUDED.avance_porcentaje,
            costo_presupuesto = EXCLUDED.costo_presupuesto;
    END LOOP;

    SELECT fc.periodo_fin + 1 INTO v_periodo_inicio
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%' AND fc.periodo_fin IS NOT NULL
    ORDER BY fc.periodo_fin DESC
    LIMIT 1;

    IF v_periodo_inicio IS NULL THEN
      SELECT COALESCE(pr2.fecha_inicio_real, pr2.fecha_inicio_plan) INTO v_periodo_inicio
      FROM proyectos pr2 WHERE pr2.id = v_proyecto.id;
    END IF;

    SELECT ass.avance_ponderado_pct INTO v_baseline_proyecto
    FROM avance_snapshots_semanales ass
    WHERE ass.proyecto_id = v_proyecto.id AND ass.fecha < v_periodo_inicio
    ORDER BY ass.fecha DESC
    LIMIT 1;
    v_baseline_proyecto := COALESCE(v_baseline_proyecto, 0);

    v_delta_fisico := v_avance_ponderado - v_baseline_proyecto;

    IF v_delta_fisico < 1 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente fc
      WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%' AND fc.estado = 'borrador'
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente fc
      WHERE fc.proyecto_id = v_proyecto.id
        AND fc.numero LIKE 'EST-%'
        AND fc.estado <> 'borrador'
        AND fc.fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(fc.monto), 0) INTO v_anticipo_total
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'ANT-%';

    v_pct_anticipo := CASE WHEN v_presupuesto_venta > 0
      THEN LEAST(v_anticipo_total / v_presupuesto_venta, 1)
      ELSE 0
    END;
    v_pct_anticipo_pct := v_pct_anticipo * 100;

    v_desglose_act := '[]'::jsonb;
    v_monto_bruto_total := 0;
    v_monto_neto_total := 0;

    SELECT EXISTS (
      SELECT 1 FROM actividades act
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true AND act.disciplina_presupuesto IS NOT NULL
        AND act.excluir_de_avance = FALSE
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
    ) INTO v_usa_disciplinas;

    IF v_usa_disciplinas THEN
      FOR v_disc IN
        SELECT
          COALESCE(d.disciplina, 'Otras actividades') AS disciplina,
          COALESCE(d.disciplina_en, 'Other activities') AS disciplina_en,
          MIN(d.orden) AS orden
        FROM (
          SELECT
            act.disciplina_presupuesto AS disciplina,
            act.disciplina_presupuesto_en AS disciplina_en,
            CASE WHEN act.codigo ~ '^[0-9]+\.' THEN (regexp_match(act.codigo, '^([0-9]+)\.'))[1]::int ELSE 999 END AS orden
          FROM actividades act
          WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
            AND act.excluir_de_avance = FALSE
            AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
        ) d
        GROUP BY d.disciplina, d.disciplina_en
        ORDER BY MIN(d.orden)
      LOOP
        v_grupo_actividades := '[]'::jsonb;
        v_grupo_bruto := 0;
        v_grupo_amort := 0;
        v_grupo_neto := 0;
        v_grupo_peso := 0;
        v_grupo_delta_pond := 0;
        v_grupo_baseline_pond := 0;
        v_grupo_actual_pond := 0;

        FOR v_act IN
          SELECT act.id, act.codigo, act.nombre, act.nombre_en,
                 COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje,
                 COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
          FROM actividades act
          WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
            AND COALESCE(act.disciplina_presupuesto, 'Otras actividades') = v_disc.disciplina
            AND act.excluir_de_avance = FALSE
            AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
          ORDER BY act.codigo
        LOOP
          SELECT asa.avance_porcentaje INTO v_baseline_act
          FROM avance_snapshots_actividad_semanales asa
          WHERE asa.actividad_id = v_act.id AND asa.fecha < v_periodo_inicio
          ORDER BY asa.fecha DESC
          LIMIT 1;

          v_baseline_act := COALESCE(v_baseline_act, 0);
          v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

          v_grupo_peso := v_grupo_peso + GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_delta_pond := v_grupo_delta_pond + v_delta_act * GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_baseline_pond := v_grupo_baseline_pond + v_baseline_act * GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_actual_pond := v_grupo_actual_pond + v_act.avance_porcentaje * GREATEST(v_act.costo_presupuesto, 1);

          IF v_delta_act <> 0 THEN
            v_grupo_actividades := v_grupo_actividades || jsonb_build_object(
              'actividad_id', v_act.id,
              'codigo', v_act.codigo,
              'nombre', v_act.nombre,
              'nombre_en', COALESCE(v_act.nombre_en, v_act.nombre),
              'avance_actual_pct', ROUND(v_act.avance_porcentaje, 1)
            );

            v_ejecutado_linea := ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2);
            v_facturable_ahora := GREATEST(v_act.avance_porcentaje - v_pct_anticipo_pct, 0);
            v_facturable_antes := GREATEST(v_baseline_act - v_pct_anticipo_pct, 0);
            v_neto_linea := ROUND(v_act.costo_presupuesto * (v_facturable_ahora - v_facturable_antes) / 100, 2);
            v_amort_linea := v_ejecutado_linea - v_neto_linea;

            v_grupo_bruto := v_grupo_bruto + v_ejecutado_linea;
            v_grupo_neto := v_grupo_neto + v_neto_linea;
            v_grupo_amort := v_grupo_amort + v_amort_linea;
          END IF;
        END LOOP;

        v_avance_desde := CASE WHEN v_grupo_peso > 0 THEN ROUND(v_grupo_baseline_pond / v_grupo_peso, 1) ELSE 0 END;
        v_avance_hasta := CASE WHEN v_grupo_peso > 0 THEN ROUND(v_grupo_actual_pond / v_grupo_peso, 1) ELSE 0 END;

        IF v_grupo_bruto <> 0 THEN
          v_monto_bruto_total := v_monto_bruto_total + v_grupo_bruto;
          v_monto_neto_total := v_monto_neto_total + v_grupo_neto;

          v_desglose_act := v_desglose_act || jsonb_build_object(
            'disciplina', v_disc.disciplina,
            'disciplina_en', v_disc.disciplina_en,
            'avance_desde_pct', v_avance_desde,
            'avance_hasta_pct', v_avance_hasta,
            'monto_bruto', v_grupo_bruto,
            'monto_amortizado', v_grupo_amort,
            'monto_neto', v_grupo_neto,
            'actividades', v_grupo_actividades
          );
        END IF;
      END LOOP;
    ELSE
      FOR v_act IN
        SELECT act.id, act.codigo, act.nombre, act.nombre_en, COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje, COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
        FROM actividades act
        WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
          AND act.excluir_de_avance = FALSE
          AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
        ORDER BY act.codigo
      LOOP
        SELECT asa.avance_porcentaje INTO v_baseline_act
        FROM avance_snapshots_actividad_semanales asa
        WHERE asa.actividad_id = v_act.id AND asa.fecha < v_periodo_inicio
        ORDER BY asa.fecha DESC
        LIMIT 1;

        v_baseline_act := COALESCE(v_baseline_act, 0);
        v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

        IF v_delta_act <> 0 THEN
          v_ejecutado_linea := ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2);
          v_facturable_ahora := GREATEST(v_act.avance_porcentaje - v_pct_anticipo_pct, 0);
          v_facturable_antes := GREATEST(v_baseline_act - v_pct_anticipo_pct, 0);
          v_neto_linea := ROUND(v_act.costo_presupuesto * (v_facturable_ahora - v_facturable_antes) / 100, 2);
          v_amort_linea := v_ejecutado_linea - v_neto_linea;

          v_monto_bruto_total := v_monto_bruto_total + v_ejecutado_linea;
          v_monto_neto_total := v_monto_neto_total + v_neto_linea;

          v_desglose_act := v_desglose_act || jsonb_build_object(
            'actividad_id', v_act.id,
            'actividad_codigo', v_act.codigo,
            'actividad_nombre', v_act.nombre,
            'actividad_nombre_en', COALESCE(v_act.nombre_en, v_act.nombre),
            'avance_pct', v_delta_act,
            'monto_bruto', v_ejecutado_linea,
            'monto_amortizado', v_amort_linea,
            'monto_neto', v_neto_linea
          );
        END IF;
      END LOOP;
    END IF;

    IF v_presupuesto_id IS NOT NULL THEN
      SELECT COALESCE(SUM(pp.monto_presupuestado), 0) INTO v_indirectos_total
      FROM partidas_presupuesto pp
      WHERE pp.presupuesto_id = v_presupuesto_id
        AND pp.tipo_recurso = 'indirecto'
        AND pp.actividad_id IS NULL;

      IF v_indirectos_total > 0 THEN
        v_ejecutado_linea := ROUND(v_indirectos_total * v_delta_fisico / 100, 2);
        v_facturable_ahora := GREATEST(v_avance_ponderado - v_pct_anticipo_pct, 0);
        v_facturable_antes := GREATEST(v_baseline_proyecto - v_pct_anticipo_pct, 0);
        v_neto_linea := ROUND(v_indirectos_total * (v_facturable_ahora - v_facturable_antes) / 100, 2);
        v_amort_linea := v_ejecutado_linea - v_neto_linea;

        v_monto_bruto_total := v_monto_bruto_total + v_ejecutado_linea;
        v_monto_neto_total := v_monto_neto_total + v_neto_linea;

        v_desglose_act := v_desglose_act || (
          CASE WHEN v_usa_disciplinas THEN
            jsonb_build_object(
              'disciplina', 'Costos indirectos',
              'disciplina_en', 'Indirect costs',
              'avance_desde_pct', ROUND(v_baseline_proyecto, 1),
              'avance_hasta_pct', ROUND(v_avance_ponderado, 1),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea,
              'actividades', '[]'::jsonb
            )
          ELSE
            jsonb_build_object(
              'actividad_id', 'indirectos-' || v_proyecto.id,
              'actividad_codigo', NULL,
              'actividad_nombre', 'Costos indirectos',
              'actividad_nombre_en', 'Indirect costs',
              'avance_pct', ROUND(v_delta_fisico, 2),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea
            )
          END
        );
      END IF;
    END IF;

    v_utilidad_neto_total := 0;
    IF v_margen_total > 0 THEN
      v_ejecutado_linea := ROUND(v_margen_total * v_delta_fisico / 100, 2);
      v_facturable_ahora := GREATEST(v_avance_ponderado - v_pct_anticipo_pct, 0);
      v_facturable_antes := GREATEST(v_baseline_proyecto - v_pct_anticipo_pct, 0);
      v_neto_linea := ROUND(v_margen_total * (v_facturable_ahora - v_facturable_antes) / 100, 2);
      v_amort_linea := v_ejecutado_linea - v_neto_linea;

      IF v_ejecutado_linea > 0 THEN
        v_monto_bruto_total := v_monto_bruto_total + v_ejecutado_linea;
        v_monto_neto_total := v_monto_neto_total + v_neto_linea;
        v_utilidad_neto_total := v_neto_linea;

        v_desglose_act := v_desglose_act || (
          CASE WHEN v_usa_disciplinas THEN
            jsonb_build_object(
              'disciplina', 'Utilidad del contratista',
              'disciplina_en', 'Contractor profit',
              'avance_desde_pct', ROUND(v_baseline_proyecto, 1),
              'avance_hasta_pct', ROUND(v_avance_ponderado, 1),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea,
              'actividades', '[]'::jsonb
            )
          ELSE
            jsonb_build_object(
              'actividad_id', 'utilidad-' || v_proyecto.id,
              'actividad_codigo', NULL,
              'actividad_nombre', 'Utilidad del contratista',
              'actividad_nombre_en', 'Contractor profit',
              'avance_pct', ROUND(v_delta_fisico, 2),
              'monto_bruto', v_ejecutado_linea,
              'monto_amortizado', v_amort_linea,
              'monto_neto', v_neto_linea
            )
          END
        );
      END IF;
    END IF;

    IF v_monto_neto_total <= 0 THEN
      CONTINUE;
    END IF;

    v_amortizacion := v_monto_bruto_total - v_monto_neto_total;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion, amortizacion_anticipo, utilidad,
      periodo_inicio, periodo_fin, desglose_periodos, desglose_actividades,
      avance_delta_pct, avance_acumulado_pct,
      fecha_emision, fecha_vencimiento, estado, monto_cobrado
    ) VALUES (
      v_proyecto.id,
      v_numero,
      'Estimación de avance automática — ' || ROUND(v_delta_fisico, 1) || '% de avance adicional (acumulado ' || ROUND(v_avance_ponderado, 1) || '%)',
      v_monto_neto_total,
      0,
      v_amortizacion,
      v_utilidad_neto_total,
      v_periodo_inicio,
      CURRENT_DATE,
      '[]'::jsonb,
      v_desglose_act,
      ROUND(v_delta_fisico, 1),
      ROUND(v_avance_ponderado, 1),
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'borrador',
      0
    );

    proyecto_id := v_proyecto.id;
    proyecto_codigo := v_proyecto.codigo;
    numero_generado := v_numero;
    monto_generado := v_monto_neto_total;
    amortizacion_generada := v_amortizacion;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_facturas_semanales(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_facturas_semanales(UUID) TO authenticated;

-- ── Radnor: crea la división y la actividad de Supervisión ──
DO $$
DECLARE
  v_proyecto_id UUID := '561331ad-3d02-40b4-b10b-19f031711440';
  v_proceso_id UUID;
  v_fecha_inicio DATE;
  v_fecha_fin DATE;
BEGIN
  SELECT id INTO v_proceso_id FROM procesos
  WHERE proyecto_id = v_proyecto_id AND codigo = 'ADM';
  IF v_proceso_id IS NULL THEN
    INSERT INTO procesos (proyecto_id, codigo, nombre, orden)
    VALUES (v_proyecto_id, 'ADM', 'Administración y Supervisión', 100)
    RETURNING id INTO v_proceso_id;
  END IF;

  SELECT COALESCE(fecha_inicio_real, fecha_inicio_plan), fecha_fin_plan
  INTO v_fecha_inicio, v_fecha_fin
  FROM proyectos WHERE id = v_proyecto_id;

  IF NOT EXISTS (
    SELECT 1 FROM actividades
    WHERE proyecto_id = v_proyecto_id AND codigo = 'ADM.01'
  ) THEN
    INSERT INTO actividades (
      proceso_id, proyecto_id, codigo, nombre, descripcion,
      fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
      cantidad_objetivo, unidad, costo_material, costo_mano_obra,
      estado, excluir_de_avance
    ) VALUES (
      v_proceso_id, v_proyecto_id, 'ADM.01', 'Supervisión (PM + capataz)',
      'Horas de supervisión de obra -- no representa avance físico, es trabajo continuo. Se reporta en Reporte Diario para registrar quién supervisó cada día y llevar el costo real.',
      v_fecha_inicio, v_fecha_fin, GREATEST(COALESCE(v_fecha_fin - v_fecha_inicio, 90), 1),
      NULL, NULL, 0, 9000,
      'en_progreso', TRUE
    );
  END IF;
END $$;
