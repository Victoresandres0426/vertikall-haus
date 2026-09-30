-- ============================================================
-- 096 — Excluir actividades de Change Order de la factura semanal
-- regular + preparar marcador de CO en Facturas
-- ============================================================
-- Contexto: desde la migración 132, aprobar un CO crea actividades
-- reales (para que aparezcan en presupuesto/cronograma). Desde la
-- migración 134, esas actividades se facturan solas -- en su propia
-- factura ligada a change_order_id, sin anticipo -- en cuanto se les
-- reporta avance.
--
-- Pero esas mismas actividades tienen costo_presupuesto = 0 (nunca se
-- llenó esa columna -- solo costo_material/costo_mano_obra), así que
-- cada vez que su avance cambiaba, generar_facturas_semanales() las
-- seguía recogiendo en su propio desglose_actividades con
-- monto_bruto = costo_presupuesto * delta / 100 = $0. Resultado: una
-- actividad de CO aparecía como renglón de $0 en la factura semanal
-- normal, Y por separado en su propia factura de CO con el monto
-- real -- justo la confusión que se pidió evitar.
--
-- Esta migración excluye las actividades ligadas a un Change Order
-- (tabla change_order_actividades_creadas) de TODO el cálculo de la
-- factura semanal regular: del avance ponderado, del agrupado por
-- disciplina y del formato plano. Ya no aparecen ahí -- su único
-- rastro de facturación es su propia factura de CO, que ya se
-- identifica con change_order_id y (con el cambio de UI que acompaña
-- esta migración) se marca visiblemente en la lista de Facturas.
-- ============================================================

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
        AND act.id NOT IN (SELECT actividad_id FROM change_order_actividades_creadas)
    ) INTO v_usa_disciplinas;

    IF v_usa_disciplinas THEN
      -- ── Formato agrupado por disciplina ──────────────────────
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
      -- ── Formato plano (proyectos sin disciplina_presupuesto cargada) ──
      FOR v_act IN
        SELECT act.id, act.codigo, act.nombre, act.nombre_en, COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje, COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
        FROM actividades act
        WHERE act.proyecto_id = v_proyecto.id AND act.activa = true
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
