-- ============================================================
-- 084 — Indirectos y utilidad prorateados como líneas propias
--        en la factura, según el avance general del proyecto
-- ============================================================
-- Confirmado con el usuario: la facturación por actividad sigue igual
-- (avance real × valor contratado de esa actividad). Lo que faltaba:
--   1. Los costos indirectos (migración 083, sin actividad_id) no
--      aparecían como línea en el desglose -- solo estaban "escondidos"
--      dentro del monto_bruto total.
--   2. La utilidad del contratista (presupuesto_venta - presupuesto_base,
--      ej. $56,148.46 en Radnor) nunca se facturaba en absoluto -- la
--      función solo trabajaba sobre el presupuesto base (costo), nunca
--      sobre el margen.
-- Ambos se agregan ahora como líneas propias del mismo arreglo
-- desglose_actividades (mismo shape {actividad_id, actividad_codigo,
-- actividad_nombre, avance_pct, monto_bruto} que ya usan
-- facturas-client.tsx y portal-cliente/page.tsx), así que se ven en la
-- UI sin tocar ningún componente.
--
-- Punto importante para no romper el cálculo de avance ya facturado:
-- la utilidad se guarda en su propia columna (facturas_cliente.utilidad)
-- y se SUMA a "monto" (lo que de verdad se le cobra al cliente), pero
-- se RESTA de vuelta al calcular v_monto_facturado histórico -- así
-- v_pct_facturado sigue comparando manzanas con manzanas contra
-- v_presupuesto_total (que es puro costo, sin margen). Si no se hiciera
-- esto, cada dólar de utilidad ya facturado inflaría artificialmente el
-- "% ya facturado" y la función dejaría de facturar antes de tiempo.
-- ============================================================

ALTER TABLE facturas_cliente ADD COLUMN IF NOT EXISTS utilidad DECIMAL(15,2) NOT NULL DEFAULT 0;

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
  v_anticipo_total DECIMAL(15,2);
  v_pct_anticipo DECIMAL(7,4);
  v_anticipo_amortizado DECIMAL(15,2);
  v_anticipo_pendiente DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);
  v_monto_neto DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
  v_periodo_inicio DATE;
  v_desglose JSONB;
  v_avance_previo DECIMAL(7,4);
  v_fecha_desde DATE;
  v_snap RECORD;
  v_act RECORD;
  v_ind RECORD;
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

    -- Utilidad del contratista: presupuesto_venta - presupuesto_base,
    -- ambos capturados al importar el proyecto (o editados manualmente).
    -- Es independiente de partidas_presupuesto -- no es un costo, es el
    -- margen que se factura por encima del costo según el mismo avance.
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

    -- Ojo: se resta la utilidad ya facturada para que este cálculo siga
    -- comparando puro costo contra puro costo (ver nota arriba).
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

    v_pct_anticipo := CASE WHEN v_presupuesto_total > 0
      THEN LEAST(v_anticipo_total / v_presupuesto_total, 1)
      ELSE 0
    END;

    SELECT COALESCE(SUM(fc.amortizacion_anticipo), 0) INTO v_anticipo_amortizado
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_anticipo_pendiente := GREATEST(v_anticipo_total - v_anticipo_amortizado, 0);

    v_amortizacion := LEAST(ROUND(v_monto_bruto * v_pct_anticipo, 2), v_anticipo_pendiente);
    -- La utilidad se suma después de la amortización -- el anticipo
    -- amortiza contra el costo de obra, no contra el margen.
    v_monto_neto := v_monto_bruto - v_amortizacion + v_utilidad_periodo;

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
        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', v_act.id,
          'actividad_codigo', v_act.codigo,
          'actividad_nombre', v_act.nombre,
          'avance_pct', v_delta_act,
          'monto_bruto', ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2)
        );
      END IF;
    END LOOP;

    -- Indirectos: no tienen avance propio -- se facturan al mismo % de
    -- avance general del período que el resto del presupuesto.
    IF v_presupuesto_id IS NOT NULL THEN
      FOR v_ind IN
        SELECT pp.id, pp.codigo, pp.descripcion, pp.monto_presupuestado
        FROM partidas_presupuesto pp
        WHERE pp.presupuesto_id = v_presupuesto_id
          AND pp.tipo_recurso = 'indirecto'
          AND pp.actividad_id IS NULL
        ORDER BY pp.codigo
      LOOP
        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', v_ind.id,
          'actividad_codigo', v_ind.codigo,
          'actividad_nombre', v_ind.descripcion,
          'avance_pct', ROUND(v_delta_pct, 2),
          'monto_bruto', ROUND(v_ind.monto_presupuestado * v_delta_pct / 100, 2)
        );
      END LOOP;
    END IF;

    -- Utilidad del contratista, también prorateada por el avance general.
    IF v_utilidad_periodo > 0 THEN
      v_desglose_act := v_desglose_act || jsonb_build_object(
        'actividad_id', 'utilidad-' || v_proyecto.id,
        'actividad_codigo', NULL,
        'actividad_nombre', 'Utilidad del contratista',
        'avance_pct', ROUND(v_delta_pct, 2),
        'monto_bruto', v_utilidad_periodo
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
           END
        || CASE WHEN v_utilidad_periodo > 0
             THEN ' · incluye $' || v_utilidad_periodo || ' de utilidad'
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
