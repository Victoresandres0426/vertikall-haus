-- ============================================================
-- 054 — Pago a destajo por avance de actividad (mano de obra)
-- ============================================================
-- Hasta ahora, el costo de mano de obra por actividad (migración 050)
-- se calculaba SIEMPRE como horas × tarifa_hora del trabajador. El
-- rol/tarifa importaba más que el trabajo realmente producido.
--
-- Ahora, además de horas, cada entrada de "actividad(es) de hoy" puede
-- traer un "avance_cantidad" (cuánto de la unidad de la partida hizo
-- ESE trabajador ese día, ej. 12 m²). Si existe una partida de
-- presupuesto con tipo_recurso='mano_obra' para esa actividad (o, en
-- su defecto, actividades.costo_mano_obra / cantidad_objetivo como
-- tarifa promedio), el pago se calcula A DESTAJO:
--     costo = avance_cantidad × precio_unitario_mano_obra
-- Si no hay avance_cantidad o no hay tarifa unitaria disponible, se
-- mantiene el cálculo anterior (horas × tarifa_hora) sin cambios --
-- esto es 100% retrocompatible con reportes ya guardados y con
-- cualquier llamada que no mande avance_cantidad.
--
-- calcular_nomina_periodo (migración 051) ya suma asistencia_actividad_
-- diaria.costo sin importar cómo se calculó, así que la nómina
-- funciona igual sin cambios ahí.
-- ============================================================

ALTER TABLE asistencia_actividad_diaria ADD COLUMN IF NOT EXISTS avance_cantidad DECIMAL(12,3);
ALTER TABLE asistencia_actividad_diaria ADD COLUMN IF NOT EXISTS tarifa_unitaria_aplicada DECIMAL(12,4);
ALTER TABLE asistencia_actividad_diaria ADD COLUMN IF NOT EXISTS modo_pago TEXT DEFAULT 'hora' CHECK (modo_pago IN ('destajo', 'hora'));

CREATE OR REPLACE FUNCTION registrar_asistencia_actividad(p_reporte_id UUID, p_entradas JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
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

    -- Precio unitario de mano de obra presupuestado para esta actividad
    -- (partida vigente con tipo_recurso = 'mano_obra').
    SELECT pp.precio_unitario INTO v_tarifa_unitaria
    FROM partidas_presupuesto pp
    JOIN presupuestos pr ON pr.id = pp.presupuesto_id
    WHERE pp.actividad_id = v_actividad_id
      AND pp.tipo_recurso = 'mano_obra'
      AND pr.es_baseline_actual = true
    ORDER BY pr.created_at DESC
    LIMIT 1;

    -- Si no hay partida específica, usa una tarifa promedio: costo de
    -- mano de obra total de la actividad entre su cantidad objetivo.
    IF v_tarifa_unitaria IS NULL THEN
      SELECT a.costo_mano_obra / NULLIF(a.cantidad_objetivo, 0) INTO v_tarifa_unitaria
      FROM actividades a WHERE a.id = v_actividad_id;
    END IF;

    IF COALESCE(v_avance, 0) > 0 AND v_tarifa_unitaria IS NOT NULL THEN
      -- Pago a destajo: gana según lo que produjo, no según las horas.
      v_costo := v_avance * v_tarifa_unitaria;
      v_modo := 'destajo';
    ELSE
      -- Respaldo: pago por hora (tarifa específica del rol, o general).
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
        (proyecto_id, actividad_id, tipo_recurso, descripcion, trabajador_id, fecha, monto, aprobado)
      VALUES
        (v_proyecto_id, v_actividad_id, 'mano_obra',
         CASE WHEN v_modo = 'destajo'
           THEN 'Mano de obra (destajo)' || CASE WHEN v_rol IS NOT NULL THEN ' — ' || v_rol ELSE '' END || ' — ' || v_avance || ' unid.'
           ELSE 'Mano de obra' || CASE WHEN v_rol IS NOT NULL THEN ' (' || v_rol || ')' ELSE '' END || ' — ' || v_horas || ' h'
         END,
         v_trabajador_id, v_fecha, v_costo, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'total_costo', v_total);
END;
$$;
