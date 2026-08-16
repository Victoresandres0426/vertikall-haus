-- ============================================================
-- 021 — Fix: pérdida de precisión en % de anticipo
-- ============================================================
-- v_pct_anticipo se declaró como DECIMAL(7,4) (solo 4 decimales).
-- Con anticipos pequeños frente a presupuestos grandes (ej. $300 de
-- $7,000,000 = 0.0043%), ese % se redondeaba a 0.0000 antes de
-- multiplicarlo por el monto de la estimación, y la amortización
-- siempre salía en $0. Se corrige eliminando la variable intermedia
-- y calculando la amortización en una sola expresión, sin redondear
-- hasta el resultado final en pesos.
-- ============================================================

CREATE OR REPLACE FUNCTION generar_facturas_semanales(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(
  proyecto_id UUID,
  proyecto_codigo TEXT,
  numero_generado TEXT,
  monto_generado DECIMAL,
  amortizacion_generada DECIMAL
) AS $$
DECLARE
  v_empresa_id UUID;
  v_rol rol_usuario;
  v_proyecto RECORD;
  v_presupuesto_total DECIMAL(15,2);
  v_avance_ponderado DECIMAL(7,4);
  v_monto_facturado DECIMAL(15,2);
  v_pct_facturado DECIMAL(7,4);
  v_delta_pct DECIMAL(7,4);
  v_monto_bruto DECIMAL(15,2);
  v_anticipo_total DECIMAL(15,2);
  v_anticipo_amortizado DECIMAL(15,2);
  v_anticipo_pendiente DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);
  v_monto_neto DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
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
    SELECT p.id, p.codigo
    FROM proyectos p
    WHERE p.empresa_id = v_empresa_id AND p.activo = true
  LOOP
    SELECT pr.total INTO v_presupuesto_total
    FROM presupuestos pr
    WHERE pr.proyecto_id = v_proyecto.id AND pr.es_baseline_actual = true
    LIMIT 1;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      SELECT COALESCE(SUM(a.costo_presupuesto), 0) INTO v_presupuesto_total
      FROM actividades a
      WHERE a.proyecto_id = v_proyecto.id AND a.activa = true;
    END IF;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      CONTINUE;
    END IF;

    SELECT
      CASE
        WHEN SUM(a.costo_presupuesto) > 0
          THEN SUM(a.avance_porcentaje * a.costo_presupuesto) / SUM(a.costo_presupuesto)
        WHEN COUNT(*) > 0
          THEN AVG(a.avance_porcentaje)
        ELSE 0
      END
    INTO v_avance_ponderado
    FROM actividades a
    WHERE a.proyecto_id = v_proyecto.id AND a.activa = true;

    v_avance_ponderado := COALESCE(v_avance_ponderado, 0);

    SELECT COALESCE(SUM(fc.monto + fc.amortizacion_anticipo), 0) INTO v_monto_facturado
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
      WHERE fc.proyecto_id = v_proyecto.id
        AND fc.numero LIKE 'EST-%'
        AND fc.fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
    ) THEN
      CONTINUE;
    END IF;

    v_monto_bruto := ROUND(v_presupuesto_total * v_delta_pct / 100, 2);
    IF v_monto_bruto <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(fc.monto), 0) INTO v_anticipo_total
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'ANT-%';

    SELECT COALESCE(SUM(fc.amortizacion_anticipo), 0) INTO v_anticipo_amortizado
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_anticipo_pendiente := GREATEST(v_anticipo_total - v_anticipo_amortizado, 0);

    -- Cálculo en una sola expresión (sin variable intermedia de %)
    -- para no perder precisión con anticipos pequeños frente al
    -- presupuesto total.
    v_amortizacion := LEAST(
      ROUND(v_monto_bruto * v_anticipo_total / v_presupuesto_total, 2),
      v_anticipo_pendiente
    );
    v_monto_neto := v_monto_bruto - v_amortizacion;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente fc
    WHERE fc.proyecto_id = v_proyecto.id AND fc.numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion, amortizacion_anticipo,
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
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'enviada',
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
