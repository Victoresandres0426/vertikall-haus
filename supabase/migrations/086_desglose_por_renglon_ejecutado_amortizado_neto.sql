-- ============================================================
-- 086 — Cada renglón del desglose muestra ejecutado / amortización
--        de anticipo / a cobrar (no solo el bruto)
-- ============================================================
-- Hasta ahora cada línea de desglose_actividades solo traía
-- "monto_bruto" (el valor ejecutado = % de avance × valor contratado
-- de esa línea). La amortización del anticipo se veía únicamente como
-- un solo número a nivel de toda la factura, sin desglosar cuánto le
-- tocaba a cada actividad/indirectos/utilidad.
--
-- Ahora cada línea trae también:
--   - monto_amortizado: la parte de ESA línea que se descuenta para
--     amortizar el anticipo, repartida a prorrata según el peso de la
--     línea dentro del total bruto del período (bruto de actividades +
--     utilidad). Así, si el anticipo ya se agotó (monto_amortizado a
--     nivel factura llega a 0), cada línea también cae a 0
--     automáticamente -- no hace falta ninguna lógica extra para
--     "cuando lo producido supera el 30%": simplemente ya no hay nada
--     que amortizar y el renglón se cobra completo.
--   - monto_neto: monto_bruto - monto_amortizado (lo que realmente se
--     cobra de esa línea).
--
-- Nota: al repartir a prorrata y redondear cada línea por separado, la
-- suma de monto_amortizado de todas las líneas puede diferir del total
-- de la factura por un par de centavos -- diferencia solo de
-- presentación, sin impacto real en el monto cobrado (que sigue
-- viniendo del total ya calculado, no de la suma de las líneas).
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
  v_monto_facturado DECIMAL(15,2);
  v_pct_facturado DECIMAL(7,4);
  v_delta_pct DECIMAL(7,4);
  v_monto_bruto DECIMAL(15,2);
  v_utilidad_periodo DECIMAL(15,2);
  v_indirectos_total DECIMAL(15,2);
  v_anticipo_total DECIMAL(15,2);
  v_pct_anticipo DECIMAL(7,4);
  v_anticipo_amortizado DECIMAL(15,2);
  v_anticipo_pendiente DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);
  v_monto_neto DECIMAL(15,2);
  v_total_bruto_periodo DECIMAL(15,2);
  v_monto_bruto_linea DECIMAL(15,2);
  v_amort_linea DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
  v_periodo_inicio DATE;
  v_desglose JSONB;
  v_avance_previo DECIMAL(7,4);
  v_fecha_desde DATE;
  v_snap RECORD;
  v_act RECORD;
  v_baseline_act DECIMAL(5,2);
  v_delta_act DECIMAL(7,2);
  v_desglose_act JSONB;
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

    SELECT COALESCE(SUM((fc.monto - COALESCE(fc.utilidad, 0)) + fc.amortizacion_anticipo), 0) INTO v_monto_facturado
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id
      AND fc.numero LIKE 'EST-%'
      AND fc.change_order_id IS NULL;

    v_pct_facturado := (v_monto_facturado / v_presupuesto_total) * 100;
    v_delta_pct := v_avance_ponderado - v_pct_facturado;

    IF v_delta_pct < 1 THEN
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

    v_monto_bruto := ROUND(v_presupuesto_total * v_delta_pct / 100, 2);
    IF v_monto_bruto <= 0 THEN
      CONTINUE;
    END IF;

    v_utilidad_periodo := ROUND(v_margen_total * v_delta_pct / 100, 2);

    SELECT COALESCE(SUM(fc.monto), 0) INTO v_anticipo_total
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'ANT-%';

    v_pct_anticipo := CASE WHEN v_presupuesto_venta > 0
      THEN LEAST(v_anticipo_total / v_presupuesto_venta, 1)
      ELSE 0
    END;

    SELECT COALESCE(SUM(fc.amortizacion_anticipo), 0) INTO v_anticipo_amortizado
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_anticipo_pendiente := GREATEST(v_anticipo_total - v_anticipo_amortizado, 0);

    v_amortizacion := LEAST(ROUND((v_monto_bruto + v_utilidad_periodo) * v_pct_anticipo, 2), v_anticipo_pendiente);
    v_monto_neto := v_monto_bruto + v_utilidad_periodo - v_amortizacion;

    -- Base para repartir la amortización entre renglones a prorrata.
    v_total_bruto_periodo := v_monto_bruto + v_utilidad_periodo;

    SELECT fc.periodo_fin + 1 INTO v_periodo_inicio
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%' AND fc.periodo_fin IS NOT NULL
    ORDER BY fc.periodo_fin DESC
    LIMIT 1;

    IF v_periodo_inicio IS NULL THEN
      SELECT COALESCE(pr2.fecha_inicio_real, pr2.fecha_inicio_plan) INTO v_periodo_inicio
      FROM proyectos pr2 WHERE pr2.id = v_proyecto.id;
    END IF;

    v_desglose := '[]'::jsonb;
    v_avance_previo := v_pct_facturado;
    v_fecha_desde := v_periodo_inicio;

    FOR v_snap IN
      SELECT ass.fecha, ass.avance_ponderado_pct
      FROM avance_snapshots_semanales ass
      WHERE ass.proyecto_id = v_proyecto.id AND ass.fecha >= v_periodo_inicio
      ORDER BY ass.fecha
    LOOP
      v_desglose := v_desglose || jsonb_build_object(
        'periodo_inicio', v_fecha_desde,
        'periodo_fin', v_snap.fecha,
        'avance_pct', ROUND(v_snap.avance_ponderado_pct - v_avance_previo, 2),
        'monto_bruto', ROUND(v_presupuesto_total * (v_snap.avance_ponderado_pct - v_avance_previo) / 100, 2)
      );
      v_avance_previo := v_snap.avance_ponderado_pct;
      v_fecha_desde := v_snap.fecha + 1;
    END LOOP;

    v_desglose_act := '[]'::jsonb;

    FOR v_act IN
      SELECT act.id, act.codigo, act.nombre, COALESCE(act.avance_porcentaje, 0) AS avance_porcentaje, COALESCE(act.costo_presupuesto, 0) AS costo_presupuesto
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
        v_monto_bruto_linea := ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2);
        v_amort_linea := CASE WHEN v_total_bruto_periodo > 0
          THEN ROUND(v_monto_bruto_linea * v_amortizacion / v_total_bruto_periodo, 2)
          ELSE 0
        END;
        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', v_act.id,
          'actividad_codigo', v_act.codigo,
          'actividad_nombre', v_act.nombre,
          'avance_pct', v_delta_act,
          'monto_bruto', v_monto_bruto_linea,
          'monto_amortizado', v_amort_linea,
          'monto_neto', v_monto_bruto_linea - v_amort_linea
        );
      END IF;
    END LOOP;

    -- Indirectos: agrupados en UNA sola línea al final.
    IF v_presupuesto_id IS NOT NULL THEN
      SELECT COALESCE(SUM(pp.monto_presupuestado), 0) INTO v_indirectos_total
      FROM partidas_presupuesto pp
      WHERE pp.presupuesto_id = v_presupuesto_id
        AND pp.tipo_recurso = 'indirecto'
        AND pp.actividad_id IS NULL;

      IF v_indirectos_total > 0 THEN
        v_monto_bruto_linea := ROUND(v_indirectos_total * v_delta_pct / 100, 2);
        v_amort_linea := CASE WHEN v_total_bruto_periodo > 0
          THEN ROUND(v_monto_bruto_linea * v_amortizacion / v_total_bruto_periodo, 2)
          ELSE 0
        END;
        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', 'indirectos-' || v_proyecto.id,
          'actividad_codigo', NULL,
          'actividad_nombre', 'Costos indirectos',
          'avance_pct', ROUND(v_delta_pct, 2),
          'monto_bruto', v_monto_bruto_linea,
          'monto_amortizado', v_amort_linea,
          'monto_neto', v_monto_bruto_linea - v_amort_linea
        );
      END IF;
    END IF;

    -- Utilidad del contratista: también al final.
    IF v_utilidad_periodo > 0 THEN
      v_monto_bruto_linea := v_utilidad_periodo;
      v_amort_linea := CASE WHEN v_total_bruto_periodo > 0
        THEN ROUND(v_monto_bruto_linea * v_amortizacion / v_total_bruto_periodo, 2)
        ELSE 0
      END;
      v_desglose_act := v_desglose_act || jsonb_build_object(
        'actividad_id', 'utilidad-' || v_proyecto.id,
        'actividad_codigo', NULL,
        'actividad_nombre', 'Utilidad del contratista',
        'avance_pct', ROUND(v_delta_pct, 2),
        'monto_bruto', v_monto_bruto_linea,
        'monto_amortizado', v_amort_linea,
        'monto_neto', v_monto_bruto_linea - v_amort_linea
      );
    END IF;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion, amortizacion_anticipo, utilidad,
      periodo_inicio, periodo_fin, desglose_periodos, desglose_actividades,
      fecha_emision, fecha_vencimiento, estado, monto_cobrado
    ) VALUES (
      v_proyecto.id,
      v_numero,
      'Estimación de avance automática — ' || ROUND(v_delta_pct, 1) || '% de avance adicional (acumulado ' || ROUND(v_avance_ponderado, 1) || '%)'
        || CASE WHEN v_amortizacion > 0
             THEN ' · incluye $' || v_amortizacion || ' de amortización de anticipo'
             ELSE ''
           END,
      v_monto_neto,
      0,
      v_amortizacion,
      v_utilidad_periodo,
      v_periodo_inicio,
      CURRENT_DATE,
      v_desglose,
      v_desglose_act,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'borrador',
      0
    );

    proyecto_id := v_proyecto.id;
    proyecto_codigo := v_proyecto.codigo;
    numero_generado := v_numero;
    monto_generado := v_monto_neto;
    amortizacion_generada := v_amortizacion;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_facturas_semanales(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_facturas_semanales(UUID) TO authenticated;
