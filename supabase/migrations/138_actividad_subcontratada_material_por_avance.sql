-- ============================================================
-- 138 — Actividades subcontratadas: reconocer material junto con
-- mano de obra al reportar % de avance
-- ============================================================
-- Problema: para una actividad hecha por un subcontratista (ej.
-- "Fabricación e instalación de encimera"), el sub cobra UNA sola
-- factura/anticipo que cubre material y mano de obra juntos, atada al
-- % de avance (ej. 50% de avance = 50% de su cobro). Pero
-- registrar_asistencia_actividad (migración 054, última redefinición
-- en 113) SOLO generaba un costos_reales con tipo_recurso='mano_obra'
-- al reportar avance en Reporte Diario -- la partida de MATERIAL de
-- esa actividad se quedaba sin su "Gastado" actualizado, aunque en
-- realidad ya se le debe (o pagó) al subcontratista esa parte también.
--
-- Solución: se agrega actividades.subcontratada (bandera, editable
-- desde Actividades). Cuando una actividad así tiene avance_cantidad
-- reportado (modo destajo), además del costos_reales de mano_obra de
-- siempre, se genera un segundo costos_reales de tipo_recurso='material'
-- por el mismo % de avance aplicado al presupuesto de material de la
-- actividad (avance_cantidad × costo_material/cantidad_objetivo) -- SIN
-- el 10% de reserva que sí aplica a la mano de obra (esa reserva es una
-- retención sobre el pago a la cuadrilla, no sobre el costo de material).
--
-- No cambia nada para actividades normales (subcontratada=false, el
-- default): siguen generando solo el costos_reales de mano_obra, igual
-- que siempre.
-- ============================================================

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS subcontratada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN actividades.subcontratada IS
  'Si la actividad la hace un subcontratista que cobra material + mano de obra en una sola factura atada a % de avance -- al reportar avance en Reporte Diario, además del costo de mano de obra se reconoce proporcionalmente el presupuesto de material como Gastado (ver registrar_asistencia_actividad, migración 138).';

CREATE OR REPLACE FUNCTION registrar_asistencia_actividad(p_reporte_id UUID, p_entradas JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  FACTOR_RESERVA_DESTAJO CONSTANT DECIMAL(4,3) := 0.90;
  v_proyecto_id UUID;
  v_empresa_id UUID;
  v_fecha DATE;
  v_entrada JSONB;
  v_trabajador_id UUID;
  v_actividad_id UUID;
  v_rol TEXT;
  v_horas DECIMAL(5,2);
  v_avance DECIMAL(12,3);
  v_tarifa_hora DECIMAL(10,2);
  v_tarifa_unitaria DECIMAL(12,4);
  v_costo_manual DECIMAL(12,2);
  v_costo DECIMAL(12,2);
  v_modo TEXT;
  v_total DECIMAL(12,2) := 0;
  v_subcontratada BOOLEAN;
  v_costo_material_presup DECIMAL(12,2);
  v_cantidad_objetivo DECIMAL(12,3);
  v_tarifa_unitaria_material DECIMAL(12,4);
  v_costo_material DECIMAL(12,2);
BEGIN
  SELECT r.proyecto_id, p.empresa_id, r.fecha INTO v_proyecto_id, v_empresa_id, v_fecha
  FROM reportes_diarios r
  JOIN proyectos p ON p.id = r.proyecto_id
  WHERE r.id = p_reporte_id;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'reporte_no_encontrado';
  END IF;

  IF v_empresa_id IS NULL OR v_empresa_id <> get_empresa_id() THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  FOR v_entrada IN SELECT * FROM jsonb_array_elements(COALESCE(p_entradas, '[]'::jsonb))
  LOOP
    v_trabajador_id := (v_entrada->>'trabajador_id')::UUID;
    v_actividad_id  := (v_entrada->>'actividad_id')::UUID;
    v_rol           := NULLIF(v_entrada->>'rol_aplicado', '');
    v_horas         := COALESCE((v_entrada->>'horas')::DECIMAL, 0);
    v_avance        := NULLIF(v_entrada->>'avance_cantidad', '')::DECIMAL;
    v_costo_manual  := NULLIF(v_entrada->>'costo_manual', '')::DECIMAL;

    IF v_trabajador_id IS NULL OR v_actividad_id IS NULL
       OR (v_horas <= 0 AND COALESCE(v_avance, 0) <= 0) THEN
      CONTINUE;
    END IF;

    v_tarifa_hora := NULL;
    v_tarifa_unitaria := NULL;
    v_modo := 'hora';

    -- Precio unitario de mano de obra presupuestado para esta actividad.
    SELECT pp.precio_unitario INTO v_tarifa_unitaria
    FROM partidas_presupuesto pp
    JOIN presupuestos pr ON pr.id = pp.presupuesto_id
    WHERE pp.actividad_id = v_actividad_id
      AND pp.tipo_recurso = 'mano_obra'
      AND pr.es_baseline_actual = true
    ORDER BY pr.created_at DESC
    LIMIT 1;

    IF v_tarifa_unitaria IS NULL THEN
      SELECT a.costo_mano_obra / NULLIF(a.cantidad_objetivo, 0) INTO v_tarifa_unitaria
      FROM actividades a WHERE a.id = v_actividad_id;
    END IF;

    -- Solo se paga el 90% de ese valor presupuestado -- el 10% restante
    -- queda de reserva del proyecto (retrabajo/imprevistos), no se paga.
    IF v_tarifa_unitaria IS NOT NULL THEN
      v_tarifa_unitaria := v_tarifa_unitaria * FACTOR_RESERVA_DESTAJO;
    END IF;

    IF v_costo_manual IS NOT NULL THEN
      -- Monto negociado a mano -- se usa tal cual, sin tocar la fórmula
      -- automática (que sigue disponible por si luego se quita el
      -- override). El avance/horas reportados no cambian.
      v_costo := v_costo_manual;
      v_modo := 'manual';
    ELSIF COALESCE(v_avance, 0) > 0 AND v_tarifa_unitaria IS NOT NULL THEN
      v_costo := v_avance * v_tarifa_unitaria;
      v_modo := 'destajo';
    ELSE
      -- Pago por hora: tarifa del trabajador, no viene del presupuesto,
      -- así que no se le aplica la reserva del 10%.
      SELECT tt.tarifa_hora INTO v_tarifa_hora
      FROM tarifas_trabajo tt
      WHERE tt.trabajador_id = v_trabajador_id
        AND tt.rol_obra = v_rol
        AND tt.activo = true;

      IF v_tarifa_hora IS NULL THEN
        SELECT t.tarifa_hora INTO v_tarifa_hora FROM trabajadores t WHERE t.id = v_trabajador_id;
      END IF;

      v_costo := v_horas * COALESCE(v_tarifa_hora, 0);
      v_modo := 'hora';
    END IF;

    v_total := v_total + v_costo;

    INSERT INTO asistencia_actividad_diaria
      (reporte_id, trabajador_id, actividad_id, rol_aplicado, horas, tarifa_hora_aplicada,
       avance_cantidad, tarifa_unitaria_aplicada, modo_pago, costo, costo_manual)
    VALUES
      (p_reporte_id, v_trabajador_id, v_actividad_id, v_rol, v_horas, v_tarifa_hora,
       v_avance, v_tarifa_unitaria, v_modo, v_costo, v_costo_manual);

    IF v_costo > 0 THEN
      INSERT INTO costos_reales
        (proyecto_id, actividad_id, tipo_recurso, descripcion, trabajador_id, fecha, monto, aprobado, reporte_id)
      VALUES
        (v_proyecto_id, v_actividad_id, 'mano_obra',
         CASE WHEN v_modo = 'manual'
           THEN 'Mano de obra (monto fijado a mano)' || CASE WHEN v_rol IS NOT NULL THEN ' — ' || v_rol ELSE '' END
           WHEN v_modo = 'destajo'
           THEN 'Mano de obra (destajo, 90% del presupuesto)' || CASE WHEN v_rol IS NOT NULL THEN ' — ' || v_rol ELSE '' END || ' — ' || v_avance || ' unid.'
           ELSE 'Mano de obra' || CASE WHEN v_rol IS NOT NULL THEN ' (' || v_rol || ')' ELSE '' END || ' — ' || v_horas || ' h'
         END,
         v_trabajador_id, v_fecha, v_costo, true, p_reporte_id);
    END IF;

    -- Actividad subcontratada + avance reportado (destajo): el mismo %
    -- que generó el costo de mano de obra también consume presupuesto
    -- de MATERIAL, porque el sub cobra ambos juntos en su anticipo. Sin
    -- la reserva del 10% -- esa retención es sobre el pago a la
    -- cuadrilla, no sobre el costo de material.
    IF v_modo = 'destajo' AND COALESCE(v_avance, 0) > 0 THEN
      SELECT a.subcontratada, a.costo_material, a.cantidad_objetivo
        INTO v_subcontratada, v_costo_material_presup, v_cantidad_objetivo
      FROM actividades a WHERE a.id = v_actividad_id;

      IF v_subcontratada AND v_costo_material_presup IS NOT NULL AND COALESCE(v_cantidad_objetivo, 0) > 0 THEN
        v_tarifa_unitaria_material := v_costo_material_presup / v_cantidad_objetivo;
        v_costo_material := ROUND(v_avance * v_tarifa_unitaria_material, 2);

        IF v_costo_material > 0 THEN
          INSERT INTO costos_reales
            (proyecto_id, actividad_id, tipo_recurso, descripcion, trabajador_id, fecha, monto, aprobado, reporte_id)
          VALUES
            (v_proyecto_id, v_actividad_id, 'material',
             'Material (subcontrato, proporcional al % de avance) — ' || v_avance || ' unid.',
             v_trabajador_id, v_fecha, v_costo_material, true, p_reporte_id);
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'total_costo', v_total);
END;
$$;

-- ── Backfill para Radnor: marcar como subcontratadas las 3 actividades
-- que el usuario reportó con este problema (encimeras/Living Room
-- fabricadas e instaladas por el mismo subcontratista de piedra) ──
DO $$
DECLARE
  v_proyecto_id UUID := '561331ad-3d02-40b4-b10b-19f031711440';
BEGIN
  UPDATE actividades
  SET subcontratada = TRUE
  WHERE proyecto_id = v_proyecto_id
    AND codigo IN ('11.05', '11.06', '11.08');
END $$;
