-- ============================================================
-- 116 — avance_porcentaje nunca debe pasar de 100%
-- ============================================================
-- _recalcular_avance_actividad (migración 064) calcula
-- avance_porcentaje = ROUND(cantidad_ejecutada / cantidad_objetivo * 100)
-- sin límite superior -- si se reporta más cantidad de la presupuestada
-- (sobre-ejecución, ej. una medida mal tomada o un cambio de alcance
-- no reflejado en cantidad_objetivo), el % sigue subiendo sin tope
-- (200%, 131%...). El portal del cliente mostraba ese número crudo
-- junto a "Completed" -- se ve como un error del sistema, no como lo
-- que realmente es (más trabajo del que decía el presupuesto original).
--
-- Además de verse mal, ese mismo avance_porcentaje sin límite se usa
-- para ponderar el avance físico general del proyecto en Proyectos y
-- el Dashboard (proyectos-client.tsx / lib/dashboard/queries.ts), así
-- que una sola actividad en 200% podía inflar el promedio del proyecto
-- completo por encima de lo real.
--
-- Se limita a 100 en el origen (la función que ya usan el trigger, el
-- editor de Actividades y el botón "Recalcular" de la migración 112),
-- y se corrige de una vez lo que ya estaba mal guardado.
-- ============================================================

CREATE OR REPLACE FUNCTION _recalcular_avance_actividad(p_actividad_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total DECIMAL(14,3);
  v_objetivo DECIMAL(14,3);
  v_estado_actual estado_actividad;
  v_pct DECIMAL(6,2);
BEGIN
  IF p_actividad_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cantidad_ejecutada_dia), 0) INTO v_total
  FROM avance_diario
  WHERE actividad_id = p_actividad_id;

  SELECT cantidad_objetivo, estado INTO v_objetivo, v_estado_actual
  FROM actividades WHERE id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Si no hay cantidad_objetivo (caso raro), no se puede calcular %
  -- a partir de la cantidad -- se deja el avance_porcentaje como está
  -- (seguirá viniendo de lo que mande el cliente en ese caso).
  -- LEAST(...,100): la cantidad ejecutada (cantidad_ejecutada) SIGUE
  -- reflejando la sobre-ejecución real sin límite -- solo el % mostrado
  -- se topa en 100, igual que ya hacía la barra de progreso del portal.
  v_pct := CASE WHEN COALESCE(v_objetivo, 0) > 0
    THEN LEAST(ROUND((v_total / v_objetivo) * 100), 100)
    ELSE NULL
  END;

  UPDATE actividades
  SET
    cantidad_ejecutada = v_total,
    avance_porcentaje = COALESCE(v_pct, avance_porcentaje),
    estado = (CASE
      WHEN v_pct IS NOT NULL AND v_pct >= 100 THEN 'completada'
      WHEN v_total > 0 THEN 'en_progreso'
      ELSE v_estado_actual
    END)::estado_actividad
  WHERE id = p_actividad_id;
END;
$$;

-- Backfill: corrige de una vez lo que ya quedó guardado por encima de 100.
UPDATE actividades
SET avance_porcentaje = 100
WHERE avance_porcentaje > 100;
