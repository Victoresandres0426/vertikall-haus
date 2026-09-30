-- ============================================================
-- 133 — Backfill: corrige el CO "Refuerzo en paredes" (Radnor)
-- ============================================================
-- Este CO se había aprobado con el código viejo (antes de la
-- migración 132): quedó como UNA sola partida tipo 'subcontrato' por
-- $11K (costo directo + indirectos/contingencia/margen mezclados) y
-- una sola actividad genérica "CO — Change Orders". El usuario dio el
-- desglose real (8 actividades: 4 en Closet + 4 en Cocina, cada una
-- con su costo de material y mano de obra) y pidió que vayan en la
-- división "04 — Preparación de Paredes con Refuerzo".
--
-- Esta migración:
--   1. Crea esa división (procesos) si no existe.
--   2. Borra la partida y la actividad viejas (mal clasificadas).
--   3. Crea las 8 actividades reales -- inicio = mañana -- con sus
--      partidas de material y mano de obra por separado.
--   4. Corrige change_orders.costo_directo al monto real ($8,726.54,
--      la suma exacta del desglose) y recalcula margen/impacto con el
--      mismo % ya guardado en el CO.
--   5. Prorratea los indirectos igual que hará decidir_change_order()
--      de ahora en adelante.
-- ============================================================

DO $$
DECLARE
  v_proyecto_id UUID := '561331ad-3d02-40b4-b10b-19f031711440'; -- Radnor Residence
  v_co_id UUID;
  v_presupuesto_id UUID;
  v_proceso_id UUID;
  v_partida_vieja_id UUID;
  v_actividad_vieja_id UUID;
  v_fecha_inicio DATE := CURRENT_DATE + 1;
  v_margen_pct DECIMAL(6,2);
  v_costo_directo_real DECIMAL(15,2) := 8726.54;
  v_costo_margen DECIMAL(15,2);
  v_total_directo_previo DECIMAL(15,2);
  v_factor DECIMAL(15,6);
  v_incremento_total DECIMAL(15,2) := 0;
  v_actividad_id UUID;
  v_renglon_id UUID;
  v_orden INTEGER := 0;
  v_item RECORD;
BEGIN
  SELECT id, margen_pct_aplicado, partida_presupuesto_id, actividad_creada_id
  INTO v_co_id, v_margen_pct, v_partida_vieja_id, v_actividad_vieja_id
  FROM change_orders
  WHERE proyecto_id = v_proyecto_id
    AND (titulo ILIKE '%refuerzo%pared%' OR numero ILIKE '%001%')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_co_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el Change Order "Refuerzo en paredes" para Radnor -- revisar manualmente';
  END IF;

  SELECT id INTO v_presupuesto_id FROM presupuestos
  WHERE proyecto_id = v_proyecto_id AND es_baseline_actual = true LIMIT 1;
  IF v_presupuesto_id IS NULL THEN
    RAISE EXCEPTION 'Radnor no tiene presupuesto baseline -- revisar manualmente';
  END IF;

  -- 1) División "04 — Preparación de Paredes con Refuerzo"
  SELECT id INTO v_proceso_id FROM procesos
  WHERE proyecto_id = v_proyecto_id AND codigo = '04';
  IF v_proceso_id IS NULL THEN
    INSERT INTO procesos (proyecto_id, codigo, nombre, orden)
    VALUES (v_proyecto_id, '04', 'Preparación de Paredes con Refuerzo', 4)
    RETURNING id INTO v_proceso_id;
  END IF;

  -- 2) Borra lo viejo (mal clasificado). Primero hay que soltar las
  -- referencias que change_orders todavía tiene hacia esa partida y esa
  -- actividad (FKs partida_presupuesto_id / actividad_creada_id),
  -- si no el DELETE de abajo falla por llave foránea.
  UPDATE change_orders SET partida_presupuesto_id = NULL, actividad_creada_id = NULL WHERE id = v_co_id;

  IF v_partida_vieja_id IS NOT NULL THEN
    DELETE FROM partidas_presupuesto WHERE id = v_partida_vieja_id;
  END IF;
  IF v_actividad_vieja_id IS NOT NULL THEN
    DELETE FROM actividades WHERE id = v_actividad_vieja_id;
  END IF;

  -- Base para prorratear indirectos: todo lo directo, medido ya sin la
  -- partida vieja de este CO (recién borrada) y antes de meter la nueva.
  SELECT COALESCE(SUM(monto_presupuestado), 0) INTO v_total_directo_previo
  FROM partidas_presupuesto
  WHERE presupuesto_id = v_presupuesto_id AND tipo_recurso <> 'indirecto';

  -- 3) Las 8 actividades reales, con su material y mano de obra
  FOR v_item IN
    SELECT * FROM (VALUES
      ('Retirar placas de sheetrock — closet',      634.40::decimal, 426.03::decimal, 0.89::decimal),
      ('Instalar refuerzos interiores (blocking) — closet', 634.40, 792.65, 1.17),
      ('Instalar placas de sheetrock — closet',      634.40, 808.50, 1.68),
      ('Aplicar acabado (empaste y lijado) — closet', 634.40, 841.65, 1.91),
      ('Retirar placas de sheetrock — cocina',        389.59, 261.62, 0.55),
      ('Instalar refuerzos interiores (blocking) — cocina', 389.59, 486.77, 0.72),
      ('Instalar placas de sheetrock — cocina',       389.59, 496.50, 1.03),
      ('Aplicar acabado (empaste y lijado) — cocina', 389.59, 516.86, 1.17)
    ) AS t(nombre, costo_material, costo_mano_obra, duracion_dias)
  LOOP
    v_orden := v_orden + 1;

    INSERT INTO change_order_renglones (
      change_order_id, proceso_id, nombre, costo_material, costo_mano_obra, duracion_dias, orden
    ) VALUES (
      v_co_id, v_proceso_id, v_item.nombre, v_item.costo_material, v_item.costo_mano_obra, v_item.duracion_dias, v_orden
    ) RETURNING id INTO v_renglon_id;

    INSERT INTO actividades (
      proceso_id, proyecto_id, codigo, nombre, descripcion,
      fecha_inicio_plan, fecha_fin_plan, duracion_plan_dias,
      cantidad_objetivo, unidad, costo_material, costo_mano_obra, estado
    ) VALUES (
      v_proceso_id, v_proyecto_id, '04.' || LPAD(v_orden::TEXT, 2, '0'), v_item.nombre,
      'Change Order — Refuerzo en paredes (Closet + Cocina)',
      v_fecha_inicio, v_fecha_inicio + CEIL(v_item.duracion_dias)::INT - 1, v_item.duracion_dias,
      1, 'CO', v_item.costo_material, v_item.costo_mano_obra, 'no_iniciada'
    ) RETURNING id INTO v_actividad_id;

    INSERT INTO partidas_presupuesto (
      presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado
    ) VALUES (
      v_presupuesto_id, v_proceso_id, v_actividad_id, 'CH.O. Radnor 001',
      v_item.nombre || ' (material)', 'material', v_item.costo_material, v_item.costo_material
    );
    INSERT INTO partidas_presupuesto (
      presupuesto_id, proceso_id, actividad_id, codigo, descripcion, tipo_recurso, monto_total, monto_presupuestado
    ) VALUES (
      v_presupuesto_id, v_proceso_id, v_actividad_id, 'CH.O. Radnor 001',
      v_item.nombre || ' (mano de obra)', 'mano_obra', v_item.costo_mano_obra, v_item.costo_mano_obra
    );

    INSERT INTO change_order_actividades_creadas (change_order_id, renglon_id, actividad_id)
    VALUES (v_co_id, v_renglon_id, v_actividad_id);
  END LOOP;

  -- 4) Corrige el costo directo del CO al monto real y recalcula
  -- margen/impacto con el mismo % que ya tenía aplicado.
  v_costo_margen := ROUND(v_costo_directo_real * (COALESCE(v_margen_pct, 0) / 100), 2);

  UPDATE change_orders
  SET costo_directo = v_costo_directo_real,
      costo_margen = v_costo_margen,
      impacto_costo = v_costo_directo_real + v_costo_margen,
      partida_presupuesto_id = NULL,
      actividad_creada_id = NULL
  WHERE id = v_co_id;

  -- 5) Prorratea los indirectos existentes en proporción al costo
  -- directo real de este CO.
  IF v_total_directo_previo > 0 THEN
    v_factor := v_costo_directo_real / v_total_directo_previo;

    -- Importante: se calcula el incremento ANTES del UPDATE -- usar los
    -- montos ya actualizados inflaría el cálculo (no sería el
    -- incremento real, sino incremento-sobre-incremento).
    SELECT COALESCE(SUM(monto_presupuestado * v_factor), 0) INTO v_incremento_total
    FROM partidas_presupuesto
    WHERE presupuesto_id = v_presupuesto_id
      AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;

    UPDATE partidas_presupuesto
    SET monto_presupuestado = monto_presupuestado + (monto_presupuestado * v_factor),
        monto_total = monto_total + (monto_total * v_factor)
    WHERE presupuesto_id = v_presupuesto_id
      AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;
  END IF;

  UPDATE change_orders SET indirectos_incrementados = v_incremento_total WHERE id = v_co_id;

  RAISE NOTICE 'CO % corregido: costo_directo=%, indirectos +%', v_co_id, v_costo_directo_real, v_incremento_total;
END $$;
