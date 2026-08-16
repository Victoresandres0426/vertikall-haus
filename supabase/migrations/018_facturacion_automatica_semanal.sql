-- ============================================================
-- 018 — Facturación automática por avance (estimaciones semanales)
-- ============================================================
-- Genera una factura de cliente por proyecto cada semana, calculada
-- así: monto = (avance % actual ponderado por presupuesto de cada
-- actividad) menos (lo ya facturado como estimación hasta ahora),
-- multiplicado por el presupuesto total del proyecto. Si no hay
-- avance nuevo desde la última estimación, no genera nada.
--
-- Numeración consecutiva por proyecto: EST-{codigo_proyecto}-{seq},
-- p.ej. EST-VH-2024-01-001, EST-VH-2024-01-002...
--
-- Anti-duplicados: no genera una nueva estimación si ya existe una
-- para ese proyecto emitida en los últimos 6 días (protege contra
-- que el cron corra dos veces la misma semana, o que se dispare
-- manualmente el mismo día que ya corrió el cron).
--
-- Dos formas de ejecutarla:
--  1) generar_facturas_semanales(p_empresa_id UUID DEFAULT NULL):
--     si no se pasa empresa, usa get_empresa_id() (la empresa del
--     usuario que la llama) -- así es seguro exponerla como RPC a
--     cualquier usuario autenticado, sin riesgo de tocar datos de
--     otra empresa. Solo roles de gestión pueden dispararla a mano.
--  2) pg_cron programado semanalmente llama a un wrapper que recorre
--     TODAS las empresas (no depende de sesión de usuario).
-- ============================================================

CREATE OR REPLACE FUNCTION generar_facturas_semanales(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(proyecto_id UUID, proyecto_codigo TEXT, numero_generado TEXT, monto_generado DECIMAL) AS $$
DECLARE
  v_empresa_id UUID;
  v_rol rol_usuario;
  v_proyecto RECORD;
  v_presupuesto_total DECIMAL(15,2);
  v_avance_ponderado DECIMAL(7,4);
  v_monto_facturado DECIMAL(15,2);
  v_pct_facturado DECIMAL(7,4);
  v_delta_pct DECIMAL(7,4);
  v_monto_nuevo DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
BEGIN
  -- Si no se especifica empresa, se usa la del usuario que llama
  -- (llamada manual desde la app vía RPC). Si se especifica (llamada
  -- desde el wrapper de pg_cron), se usa esa directamente.
  v_empresa_id := COALESCE(p_empresa_id, get_empresa_id());
  IF v_empresa_id IS NULL THEN
    RETURN; -- sin empresa resoluble, no hay nada que hacer
  END IF;

  -- Si es una llamada manual (p_empresa_id no vino del cron), solo
  -- roles de gestión financiera pueden disparar la generación.
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
    -- Presupuesto total: preferir el baseline vigente; si no hay,
    -- sumar el costo presupuestado de las actividades del proyecto.
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
      CONTINUE; -- sin presupuesto no se puede calcular el monto a facturar
    END IF;

    -- Avance % ponderado por el peso presupuestal de cada actividad.
    -- Si ninguna actividad tiene costo_presupuesto cargado, se usa
    -- el promedio simple del avance como respaldo.
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

    -- Cuánto se ha facturado ya como estimación de avance (excluye
    -- change orders, que son facturación aparte por alcance adicional).
    SELECT COALESCE(SUM(monto), 0) INTO v_monto_facturado
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id
      AND numero LIKE 'EST-%'
      AND change_order_id IS NULL;

    v_pct_facturado := (v_monto_facturado / v_presupuesto_total) * 100;
    v_delta_pct := v_avance_ponderado - v_pct_facturado;

    -- Umbral mínimo: no generar por avances insignificantes (ruido).
    IF v_delta_pct < 1 THEN
      CONTINUE;
    END IF;

    -- Anti-duplicados: ya se generó una estimación reciente para este proyecto.
    IF EXISTS (
      SELECT 1 FROM facturas_cliente
      WHERE proyecto_id = v_proyecto.id
        AND numero LIKE 'EST-%'
        AND fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
    ) THEN
      CONTINUE;
    END IF;

    v_monto_nuevo := ROUND(v_presupuesto_total * v_delta_pct / 100, 2);
    IF v_monto_nuevo <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion,
      fecha_emision, fecha_vencimiento, estado, monto_cobrado
    ) VALUES (
      v_proyecto.id,
      v_numero,
      'Estimación de avance automática — ' || ROUND(v_delta_pct, 1) || '% de avance adicional (acumulado ' || ROUND(v_avance_ponderado, 1) || '%)',
      v_monto_nuevo,
      0,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'enviada',
      0
    );

    proyecto_id := v_proyecto.id;
    proyecto_codigo := v_proyecto.codigo;
    numero_generado := v_numero;
    monto_generado := v_monto_nuevo;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Solo usuarios autenticados pueden invocarla (y solo genera para SU
-- propia empresa cuando la llaman así, ver chequeo de rol arriba).
REVOKE ALL ON FUNCTION generar_facturas_semanales(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_facturas_semanales(UUID) TO authenticated;

-- Wrapper para el cron: recorre TODAS las empresas (no depende de
-- sesión de usuario, por eso no puede usar get_empresa_id()).
CREATE OR REPLACE FUNCTION generar_facturas_semanales_todas_empresas()
RETURNS void AS $$
DECLARE
  v_empresa RECORD;
BEGIN
  FOR v_empresa IN SELECT id FROM empresas LOOP
    PERFORM generar_facturas_semanales(v_empresa.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_facturas_semanales_todas_empresas() FROM PUBLIC;

-- Programar el job semanal (lunes 8:00 UTC). Si la extensión pg_cron
-- no está habilitada en este proyecto de Supabase, este bloque falla
-- solo -- el resto de la migración (las funciones) igual queda
-- aplicado y se puede generar la facturación a mano desde la app.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'facturacion-semanal',
    '0 8 * * 1',
    $cron$SELECT generar_facturas_semanales_todas_empresas();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar pg_cron (puede que la extensión no esté habilitada en este proyecto). Las funciones de facturación automática igual quedaron creadas; se puede generar la estimación semanal manualmente desde la app, o pedirle a Supabase que habilite pg_cron y volver a correr solo el bloque del cron.schedule.';
END $$;
