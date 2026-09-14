-- ============================================================
-- 087 — Anticipo por umbral (no descuento parejo perpetuo)
-- ============================================================
-- Modelo anterior (084/085/086): cada período se descontaba un % PAREJO
-- (anticipo_total / presupuesto_venta, ej. 30%) de TODO lo facturado,
-- para siempre, hasta agotar el anticipo en dólares. Eso significa que
-- el anticipo tardaba en "recuperarse" prácticamente hasta el final del
-- contrato -- no es como se maneja normalmente un anticipo en
-- construcción.
--
-- Modelo nuevo, confirmado con el usuario: por cada renglón (cada
-- actividad individual, el grupo de indirectos, y la utilidad), NO se
-- factura nada mientras su propio % ejecutado ACUMULADO no supere el %
-- de anticipo. En cuanto lo supera, se factura (acumulado - umbral) ×
-- su valor contratado, menos lo que ya se le haya facturado antes a
-- ESE mismo renglón. Así el anticipo se "consume" contra el avance de
-- cada renglón, no como un descuento parejo de por vida.
--
-- Con este modelo, el tope de "anticipo pendiente" en dólares ya no
-- hace falta -- la fórmula GREATEST(acumulado - umbral, 0) nunca deja
-- facturar más del 100% menos el % de anticipo de cada renglón, así
-- que el anticipo se recupera estructuralmente por diseño. Por lo
-- mismo, ya no se necesita rastrear "cuánto se ha facturado en total"
-- en dólares (v_monto_facturado / v_pct_facturado de las versiones
-- anteriores) -- ahora se usa directamente el avance FÍSICO real
-- (actividades.avance_porcentaje y los snapshots por actividad/
-- proyecto que ya existían) como referencia de "antes" y "ahora".
--
-- Si en un período el neto a cobrar da $0 (todo sigue absorbido por el
-- anticipo), ya no se crea un borrador vacío -- los snapshots de
-- avance sí se actualizan igual, solo no se genera factura ese
-- período.
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
  v_desglose JSONB;
  v_avance_previo DECIMAL(7,4);
  v_fecha_desde DATE;
  v_snap RECORD;
  v_act RECORD;
  v_baseline_act DECIMAL(5,2);
  v_delta_act DECIMAL(7,2);
  v_desglose_act JSONB;
  v_ejecutado_linea DECIMAL(15,2);
  v_neto_linea DECIMAL(15,2);
  v_amort_linea DECIMAL(15,2);
  v_facturable_ahora DECIMAL(7,4);
  v_facturable_antes DECIMAL(7,4);
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

    -- Período que cubre esta estimación: desde el día siguiente al fin
    -- del último EST-, o desde el arranque del proyecto si es el primero.
    SELECT fc.periodo_fin + 1 INTO v_periodo_inicio
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%' AND fc.periodo_fin IS NOT NULL
    ORDER BY fc.periodo_fin DESC
    LIMIT 1;

    IF v_periodo_inicio IS NULL THEN
      SELECT COALESCE(pr2.fecha_inicio_real, pr2.fecha_inicio_plan) INTO v_periodo_inicio
      FROM proyectos pr2 WHERE pr2.id = v_proyecto.id;
    END IF;

    -- Avance físico real del proyecto justo antes de este período
    -- (independiente de cuánto se haya facturado en dólares).
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

    v_desglose := '[]'::jsonb;
    v_avance_previo := v_baseline_proyecto;
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
    v_monto_bruto_total := 0;
    v_monto_neto_total := 0;

    -- Actividades: umbral por SU PROPIO % ejecutado acumulado.
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
          'avance_pct', v_delta_act,
          'monto_bruto', v_ejecutado_linea,
          'monto_amortizado', v_amort_linea,
          'monto_neto', v_neto_linea
        );
      END IF;
    END LOOP;

    -- Indirectos agrupados: usan el avance FÍSICO general del proyecto
    -- como su propio "% ejecutado acumulado" (no tienen uno propio).
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

        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', 'indirectos-' || v_proyecto.id,
          'actividad_codigo', NULL,
          'actividad_nombre', 'Costos indirectos',
          'avance_pct', ROUND(v_delta_fisico, 2),
          'monto_bruto', v_ejecutado_linea,
          'monto_amortizado', v_amort_linea,
          'monto_neto', v_neto_linea
        );
      END IF;
    END IF;

    -- Utilidad del contratista: mismo criterio que indirectos.
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

        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', 'utilidad-' || v_proyecto.id,
          'actividad_codigo', NULL,
          'actividad_nombre', 'Utilidad del contratista',
          'avance_pct', ROUND(v_delta_fisico, 2),
          'monto_bruto', v_ejecutado_linea,
          'monto_amortizado', v_amort_linea,
          'monto_neto', v_neto_linea
        );
      END IF;
    END IF;

    -- Si todo el período sigue absorbido por el anticipo, no se genera
    -- borrador (el avance ya quedó registrado en los snapshots de arriba).
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
      fecha_emision, fecha_vencimiento, estado, monto_cobrado
    ) VALUES (
      v_proyecto.id,
      v_numero,
      'Estimación de avance automática — ' || ROUND(v_delta_fisico, 1) || '% de avance adicional (acumulado ' || ROUND(v_avance_ponderado, 1) || '%)'
        || CASE WHEN v_amortizacion > 0
             THEN ' · incluye $' || v_amortizacion || ' de amortización de anticipo'
             ELSE ''
           END,
      v_monto_neto_total,
      0,
      v_amortizacion,
      v_utilidad_neto_total,
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
    monto_generado := v_monto_neto_total;
    amortizacion_generada := v_amortizacion;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_facturas_semanales(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_facturas_semanales(UUID) TO authenticated;
