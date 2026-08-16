-- ============================================================
-- 019 — Amortización de anticipo en estimaciones automáticas
-- ============================================================
-- Problema: si un proyecto cobró un anticipo (ej. 30% del contrato),
-- la primera vez que el avance real llega a ese 30%, el motor no
-- debía facturarle al cliente el 100% de ese avance -- una parte ya
-- se pagó por adelantado.
--
-- Regla acordada: retención proporcional. Cada estimación descuenta
-- el mismo % que el anticipo representa del presupuesto total, hasta
-- agotar el anticipo. Ej. anticipo=30% del presupuesto → cada
-- estimación nueva se descuenta un 30% (por concepto de amortización
-- de anticipo) hasta que ese anticipo quede completamente aplicado.
--
-- Cómo se detecta el anticipo: se registra igual que cualquier
-- "Nueva factura" de cliente, pero con número que empiece con ANT-
-- (ej. ANT-VH-2024-01). El motor la detecta solo por el prefijo,
-- igual que ya hace con las estimaciones (EST-).
--
-- Cambio de semántica del campo `monto` en las facturas EST-
-- generadas automáticamente: ahora es el monto NETO que el cliente
-- realmente debe pagar (ya descontada la amortización), para que la
-- cuenta por cobrar (CxC) refleje lo que de verdad hay que cobrar.
-- El valor bruto de avance reconocido se reconstruye sumando
-- monto + amortizacion_anticipo, y así el cálculo del % ya facturado
-- (para la siguiente semana) sigue siendo consistente con el % de
-- avance real, sin importar cuánto se haya descontado por anticipo.
-- ============================================================

ALTER TABLE facturas_cliente ADD COLUMN IF NOT EXISTS amortizacion_anticipo DECIMAL(15,2) DEFAULT 0;

-- Postgres no permite CREATE OR REPLACE cuando cambian las columnas de
-- retorno (aquí se agrega amortizacion_generada) -- hay que soltar la
-- función anterior primero.
DROP FUNCTION IF EXISTS generar_facturas_semanales(UUID);

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
  v_monto_facturado DECIMAL(15,2); -- valor BRUTO de avance ya reconocido (monto + amortización de facturas EST- previas)
  v_pct_facturado DECIMAL(7,4);
  v_delta_pct DECIMAL(7,4);
  v_monto_bruto DECIMAL(15,2);     -- valor de avance nuevo de esta corrida, antes de descontar anticipo
  v_anticipo_total DECIMAL(15,2);
  v_pct_anticipo DECIMAL(7,4);
  v_anticipo_amortizado DECIMAL(15,2); -- cuánto del anticipo ya se ha descontado en estimaciones previas
  v_anticipo_pendiente DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);    -- cuánto de esta estimación se descuenta por anticipo
  v_monto_neto DECIMAL(15,2);      -- lo que realmente se factura (bruto - amortización)
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
    SELECT total INTO v_presupuesto_total
    FROM presupuestos
    WHERE proyecto_id = v_proyecto.id AND es_baseline_actual = true
    LIMIT 1;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      SELECT COALESCE(SUM(costo_presupuesto), 0) INTO v_presupuesto_total
      FROM actividades
      WHERE proyecto_id = v_proyecto.id AND activa = true;
    END IF;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      CONTINUE;
    END IF;

    SELECT
      CASE
        WHEN SUM(costo_presupuesto) > 0
          THEN SUM(avance_porcentaje * costo_presupuesto) / SUM(costo_presupuesto)
        WHEN COUNT(*) > 0
          THEN AVG(avance_porcentaje)
        ELSE 0
      END
    INTO v_avance_ponderado
    FROM actividades
    WHERE proyecto_id = v_proyecto.id AND activa = true;

    v_avance_ponderado := COALESCE(v_avance_ponderado, 0);

    -- Valor BRUTO de avance ya reconocido en estimaciones previas
    -- (monto neto + lo que ya se descontó por amortización de anticipo
    -- en cada una de ellas), para comparar en las mismas unidades que
    -- el % de avance real.
    SELECT COALESCE(SUM(monto + amortizacion_anticipo), 0) INTO v_monto_facturado
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id
      AND numero LIKE 'EST-%'
      AND change_order_id IS NULL;

    v_pct_facturado := (v_monto_facturado / v_presupuesto_total) * 100;
    v_delta_pct := v_avance_ponderado - v_pct_facturado;

    IF v_delta_pct < 1 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente
      WHERE proyecto_id = v_proyecto.id
        AND numero LIKE 'EST-%'
        AND fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
    ) THEN
      CONTINUE;
    END IF;

    v_monto_bruto := ROUND(v_presupuesto_total * v_delta_pct / 100, 2);
    IF v_monto_bruto <= 0 THEN
      CONTINUE;
    END IF;

    -- Anticipo cobrado (facturas con prefijo ANT-) y cuánto de ese
    -- anticipo ya se ha aplicado (amortizado) en estimaciones previas.
    SELECT COALESCE(SUM(monto), 0) INTO v_anticipo_total
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'ANT-%';

    v_pct_anticipo := CASE WHEN v_presupuesto_total > 0
      THEN LEAST(v_anticipo_total / v_presupuesto_total, 1)
      ELSE 0
    END;

    SELECT COALESCE(SUM(amortizacion_anticipo), 0) INTO v_anticipo_amortizado
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%';

    v_anticipo_pendiente := GREATEST(v_anticipo_total - v_anticipo_amortizado, 0);

    -- Se descuenta el mismo % que representa el anticipo, sin exceder
    -- lo que quede pendiente de amortizar.
    v_amortizacion := LEAST(ROUND(v_monto_bruto * v_pct_anticipo, 2), v_anticipo_pendiente);
    v_monto_neto := v_monto_bruto - v_amortizacion;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%';

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
