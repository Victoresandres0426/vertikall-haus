-- ============================================================
-- 095 — Factura agrupada por disciplina: solo actividades con
-- movimiento en el período + rango de avance de la disciplina
-- ============================================================
-- Ajustes pedidos sobre la migración 094:
--
-- 1) Dentro de cada disciplina, ya NO se listan todas sus
--    actividades -- solo las que tuvieron avance DURANTE el
--    período que se está facturando (antes se listaban todas,
--    incluyendo las que seguían en 0% o las que ya estaban
--    completas desde un período anterior sin más movimiento).
--    Una actividad que se completa en esta factura simplemente no
--    vuelve a aparecer en la siguiente, porque ya no tuvo cambio.
--
-- 2) Cada disciplina ahora muestra el RANGO de avance del período
--    (desde% - hasta%), no solo un número de avance. En la primera
--    factura el "desde" es 0% para todas (nadie tenía snapshot
--    previo). En las siguientes, "desde" es el avance que tenía al
--    cierre del período anterior. Ej: (15%-55%).
--
-- Los renglones "Costos indirectos" y "Utilidad del contratista"
-- (que no son una disciplina real, son prorrateo) usan el mismo
-- rango pero a nivel de avance general del proyecto.
--
-- El formato plano (proyectos sin disciplina_presupuesto) no
-- cambia -- ya filtraba por movimiento en el período desde la
-- migración 078, y su "avance_pct" ya era el delta del período, no
-- un acumulado.
--
-- Compatibilidad: las facturas ya enviadas con el formato de la
-- migración 094 (con "avance_pct" en vez de "avance_desde_pct" /
-- "avance_hasta_pct") se siguen viendo igual -- el correo y el
-- portal detectan cuál de los dos formatos trae cada renglón.
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
      WHERE act.proyecto_id = v_proyecto.id AND act.activa = true;
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
    WHERE act.proyecto_id = v_proyecto.id AND act.activa = true;

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
          ORDER BY act.codigo
        LOOP
          SELECT asa.avance_porcentaje INTO v_baseline_act
          FROM avance_snapshots_actividad_semanales asa
          WHERE asa.actividad_id = v_act.id AND asa.fecha < v_periodo_inicio
          ORDER BY asa.fecha DESC
          LIMIT 1;

          v_baseline_act := COALESCE(v_baseline_act, 0);
          v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

          -- El peso y el rango de avance de la disciplina se calculan
          -- sobre TODAS sus actividades (para reflejar el estado real
          -- de la disciplina), aunque solo las que se movieron este
          -- período aparezcan listadas abajo.
          v_grupo_peso := v_grupo_peso + GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_delta_pond := v_grupo_delta_pond + v_delta_act * GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_baseline_pond := v_grupo_baseline_pond + v_baseline_act * GREATEST(v_act.costo_presupuesto, 1);
          v_grupo_actual_pond := v_grupo_actual_pond + v_act.avance_porcentaje * GREATEST(v_act.costo_presupuesto, 1);

          IF v_delta_act <> 0 THEN
            -- Solo se lista la actividad si tuvo movimiento en ESTE
            -- período -- las que siguen en 0% o ya estaban completas
            -- desde antes no aparecen en esta factura.
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

-- ------------------------------------------------------------
-- enviar_email_estimacion(): el encabezado de cada disciplina
-- ahora muestra el rango "desde%-hasta%" si la factura lo trae
-- (migración 095); si es una factura vieja generada con el formato
-- de la migración 094 (solo "avance_pct"), sigue mostrando ese
-- número único, sin romper nada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enviar_email_estimacion()
RETURNS TRIGGER AS $$
DECLARE
  v_proyecto RECORD;
  v_api_key TEXT;
  v_from TEXT := 'Vertikall Haus <facturacion@vertikallhaus.net>';
  v_html TEXT;
  v_asunto TEXT;
  v_bruto DECIMAL(15,2);
  v_desglose_html TEXT := '';
  v_item JSONB;
  v_sub_item JSONB;
  v_en BOOLEAN;
  v_rango_avance TEXT;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero NOT LIKE 'EST-%' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado <> 'enviada' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (OLD.estado = 'borrador' AND NEW.estado = 'enviada') THEN
    RETURN NEW;
  END IF;

  SELECT nombre, codigo, cliente, cliente_email, idioma_cliente
  INTO v_proyecto
  FROM proyectos
  WHERE id = NEW.proyecto_id;

  IF v_proyecto.cliente_email IS NULL OR v_proyecto.cliente_email = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_api_key := NULL;
  END;

  IF v_api_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_en := COALESCE(v_proyecto.idioma_cliente, 'es') = 'en';
  v_bruto := NEW.monto + COALESCE(NEW.amortizacion_anticipo, 0);

  IF NEW.desglose_actividades IS NOT NULL AND jsonb_array_length(NEW.desglose_actividades) > 0 THEN
    v_desglose_html := '<table style="width:100%;border-collapse:collapse;margin:12px 0">' ||
      '<tr style="background:#f1f5f9;color:#475569;font-size:12px">' ||
      '<td style="padding:4px 8px;text-align:left">' || (CASE WHEN v_en THEN 'Item' ELSE 'Renglón' END) || '</td>' ||
      '<td style="padding:4px 8px;text-align:right">' || (CASE WHEN v_en THEN '% progress' ELSE '% avance' END) || '</td>' ||
      '<td style="padding:4px 8px;text-align:right">' || (CASE WHEN v_en THEN 'Amount' ELSE 'Monto' END) || '</td></tr>';

    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.desglose_actividades)
    LOOP
      IF v_item ? 'actividades' THEN
        -- Grupo por disciplina: fila con $, luego sub-filas de
        -- actividades sin $ (solo las que se movieron este período).
        v_rango_avance := CASE
          WHEN v_item ? 'avance_desde_pct' THEN (v_item->>'avance_desde_pct') || '%-' || (v_item->>'avance_hasta_pct') || '%'
          ELSE (v_item->>'avance_pct') || '%'
        END;

        v_desglose_html := v_desglose_html ||
          '<tr><td style="padding:4px 8px;font-size:13px;font-weight:bold;color:#0f172a">' ||
            (CASE WHEN v_en THEN COALESCE(v_item->>'disciplina_en', v_item->>'disciplina') ELSE v_item->>'disciplina' END) ||
          '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;font-weight:bold;color:#0f172a;text-align:right">' || v_rango_avance || '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;font-weight:bold;color:#0f172a;text-align:right">$' || to_char((v_item->>'monto_bruto')::numeric, 'FM999,999,999.00') || '</td></tr>';

        FOR v_sub_item IN SELECT * FROM jsonb_array_elements(v_item->'actividades')
        LOOP
          v_desglose_html := v_desglose_html ||
            '<tr><td style="padding:2px 8px 2px 20px;font-size:12px;color:#64748b">' ||
              COALESCE(v_sub_item->>'codigo', '') ||
              CASE WHEN v_sub_item->>'codigo' IS NOT NULL THEN ' — ' ELSE '' END ||
              (CASE WHEN v_en THEN COALESCE(v_sub_item->>'nombre_en', v_sub_item->>'nombre') ELSE v_sub_item->>'nombre' END) ||
            '</td>' ||
            '<td style="padding:2px 8px;font-size:12px;color:#64748b;text-align:right">' || (v_sub_item->>'avance_actual_pct') || '%</td>' ||
            '<td></td></tr>';
        END LOOP;
      ELSE
        -- Formato plano (proyectos sin disciplina_presupuesto).
        v_desglose_html := v_desglose_html ||
          '<tr><td style="padding:4px 8px;font-size:13px;color:#475569">' ||
            COALESCE(v_item->>'actividad_codigo', '') ||
            CASE WHEN v_item->>'actividad_codigo' IS NOT NULL THEN ' — ' ELSE '' END ||
            (CASE WHEN v_en THEN COALESCE(v_item->>'actividad_nombre_en', v_item->>'actividad_nombre') ELSE v_item->>'actividad_nombre' END) ||
          '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569;text-align:right">' || (v_item->>'avance_pct') || '%</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569;text-align:right">$' || to_char((v_item->>'monto_bruto')::numeric, 'FM999,999,999.00') || '</td></tr>';
      END IF;
    END LOOP;
    v_desglose_html := v_desglose_html || '</table>';
  END IF;

  IF v_en THEN
    v_asunto := 'New progress estimate — ' || v_proyecto.nombre || ' (' || NEW.numero || ')';
    v_html :=
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
      '<h2 style="color:#0f172a">New progress estimate</h2>' ||
      '<p>Dear ' || COALESCE(v_proyecto.cliente, 'client') || ',</p>' ||
      '<p>A new progress estimate has been generated for project <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ')' ||
      CASE WHEN NEW.periodo_inicio IS NOT NULL AND NEW.periodo_fin IS NOT NULL
        THEN ', covering the period from ' || NEW.periodo_inicio || ' to ' || NEW.periodo_fin
        ELSE '' END ||
      CASE WHEN NEW.avance_delta_pct IS NOT NULL
        THEN ' (' || NEW.avance_delta_pct || '% additional progress, ' || COALESCE(NEW.avance_acumulado_pct::TEXT, '') || '% accumulated)'
        ELSE '' END || '.</p>' ||
      v_desglose_html ||
      '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Number</td><td style="padding:8px">' || NEW.numero || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Progress recognized this period</td><td style="padding:8px">$' || to_char(v_bruto, 'FM999,999,999.00') || '</td></tr>' ||
      CASE WHEN NEW.amortizacion_anticipo > 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Deposit amortization applied</td><td style="padding:8px">−$' || to_char(NEW.amortizacion_anticipo, 'FM999,999,999.00') || '</td></tr>'
      ELSE '' END ||
      CASE WHEN NEW.retencion > 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Retention</td><td style="padding:8px">−$' || to_char(NEW.retencion, 'FM999,999,999.00') || '</td></tr>'
      ELSE '' END ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Total due</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.monto, 'FM999,999,999.00') || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Due date</td><td style="padding:8px">' || COALESCE(NEW.fecha_vencimiento::TEXT, '') || '</td></tr>' ||
      '</table>' ||
      '<p style="color:#64748b;font-size:13px">This email was generated automatically by Vertikall Haus''s project management system.</p>' ||
      '</div>';
  ELSE
    v_asunto := 'Nueva estimación de avance — ' || v_proyecto.nombre || ' (' || NEW.numero || ')';
    v_html :=
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
      '<h2 style="color:#0f172a">Nueva estimación de avance</h2>' ||
      '<p>Estimado(a) ' || COALESCE(v_proyecto.cliente, 'cliente') || ',</p>' ||
      '<p>Se ha generado una nueva estimación de avance para el proyecto <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ')' ||
      CASE WHEN NEW.periodo_inicio IS NOT NULL AND NEW.periodo_fin IS NOT NULL
        THEN ', correspondiente al período del ' || NEW.periodo_inicio || ' al ' || NEW.periodo_fin
        ELSE '' END || '.</p>' ||
      v_desglose_html ||
      '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Número</td><td style="padding:8px">' || NEW.numero || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Avance reconocido este período</td><td style="padding:8px">$' || to_char(v_bruto, 'FM999,999,999.00') || '</td></tr>' ||
      CASE WHEN NEW.amortizacion_anticipo > 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Amortización de anticipo aplicada</td><td style="padding:8px">−$' || to_char(NEW.amortizacion_anticipo, 'FM999,999,999.00') || '</td></tr>'
      ELSE '' END ||
      CASE WHEN NEW.retencion > 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Retención</td><td style="padding:8px">−$' || to_char(NEW.retencion, 'FM999,999,999.00') || '</td></tr>'
      ELSE '' END ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Total a pagar</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.monto, 'FM999,999,999.00') || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Fecha de vencimiento</td><td style="padding:8px">' || COALESCE(NEW.fecha_vencimiento::TEXT, '') || '</td></tr>' ||
      '</table>' ||
      '<p style="color:#64748b;font-size:13px">Este correo fue generado automáticamente por el sistema de gestión de proyectos de Vertikall Haus.</p>' ||
      '</div>';
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', v_from,
        'to', jsonb_build_array(v_proyecto.cliente_email),
        'subject', v_asunto,
        'html', v_html
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo enviar el correo de la estimación %: %', NEW.numero, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enviar_email_estimacion ON facturas_cliente;
CREATE TRIGGER trg_enviar_email_estimacion
  AFTER INSERT OR UPDATE OF estado ON facturas_cliente
  FOR EACH ROW
  EXECUTE FUNCTION enviar_email_estimacion();
