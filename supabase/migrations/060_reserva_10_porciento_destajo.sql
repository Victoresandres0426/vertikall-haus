-- ============================================================
-- 060 — Destajo: solo se paga el 90% del valor de mano de obra
--        presupuestado por actividad (10% queda de reserva)
-- ============================================================
-- Hasta ahora el pago a destajo usaba el 100% del precio_unitario de
-- mano de obra presupuestado (partidas_presupuesto, o costo_mano_obra
-- / cantidad_objetivo como respaldo). A partir de esta migración, ese
-- precio unitario se multiplica por 0.90 antes de calcular el pago:
-- el trabajador cobra sobre el 90% del valor listado en el presupuesto,
-- y el 10% restante queda como reserva del proyecto para retrabajo o
-- imprevistos (simplemente no se paga todavía -- si luego hace falta
-- ese retrabajo, se registra aparte como su propio costo cuando pase).
--
-- Esto NO afecta el pago por hora (tarifas_trabajo / trabajadores.
-- tarifa_hora) -- ese es un salario aparte, no viene del presupuesto.
--
-- FACTOR_RESERVA_DESTAJO queda como constante dentro de la función; si
-- el % cambia en el futuro, se puede ajustar aquí sin tocar la app.
-- ============================================================

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
  v_costo DECIMAL(12,2);
  v_modo TEXT;
  v_total DECIMAL(12,2) := 0;
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

    IF COALESCE(v_avance, 0) > 0 AND v_tarifa_unitaria IS NOT NULL THEN
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
       avance_cantidad, tarifa_unitaria_aplicada, modo_pago, costo)
    VALUES
      (p_reporte_id, v_trabajador_id, v_actividad_id, v_rol, v_horas, v_tarifa_hora,
       v_avance, v_tarifa_unitaria, v_modo, v_costo);

    IF v_costo > 0 THEN
      INSERT INTO costos_reales
        (proyecto_id, actividad_id, tipo_recurso, descripcion, trabajador_id, fecha, monto, aprobado, reporte_id)
      VALUES
        (v_proyecto_id, v_actividad_id, 'mano_obra',
         CASE WHEN v_modo = 'destajo'
           THEN 'Mano de obra (destajo, 90% del presupuesto)' || CASE WHEN v_rol IS NOT NULL THEN ' — ' || v_rol ELSE '' END || ' — ' || v_avance || ' unid.'
           ELSE 'Mano de obra' || CASE WHEN v_rol IS NOT NULL THEN ' (' || v_rol || ')' ELSE '' END || ' — ' || v_horas || ' h'
         END,
         v_trabajador_id, v_fecha, v_costo, true, p_reporte_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'total_costo', v_total);
END;
$$;
