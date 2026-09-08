-- ============================================================
-- 057 — actividades.costo_real se mantiene sincronizado con
--        costos_reales (trigger + backfill)
-- ============================================================
-- Hallazgo grave: actividades.costo_real existe desde la migración 001
-- y lo usan el motor de alertas (motor.ts/reglas.ts), el cálculo de
-- IIDP (iidp.ts), la lista de Proyectos ("Ejecutado") y la página de
-- Actividades -- pero NINGÚN flujo de la app lo escribía. El costo
-- real de verdad se registra en la tabla costos_reales (por ejemplo,
-- desde el pago a destajo/por hora del Reporte Diario, migración 054),
-- que sí trae actividad_id, pero nunca se propagaba de vuelta a
-- actividades.costo_real. Resultado: "Ejecutado $0" en Proyectos, y
-- las alertas de desviación de costo por actividad y el score de IIDP
-- nunca detectaban sobrecostos reales por actividad, aunque el costo
-- total del proyecto sí se veía bien en la ficha del proyecto (porque
-- esa pantalla suma costos_reales directamente, no pasa por
-- actividades.costo_real).
--
-- Solución: un trigger en costos_reales que recalcula
-- actividades.costo_real = SUM(monto) de todos sus costos_reales,
-- cada vez que se inserta, edita o borra un costo real con
-- actividad_id. Así queda sincronizado sin importar qué parte de la
-- app inserte el costo (destajo, por hora, materiales, subcontratos,
-- etc.), hoy y en el futuro.
-- ============================================================

CREATE OR REPLACE FUNCTION recalcular_costo_real_actividad()
RETURNS TRIGGER AS $$
DECLARE
  v_actividad_anterior UUID := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.actividad_id ELSE NULL END;
  v_actividad_actual UUID := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.actividad_id ELSE NULL END;
BEGIN
  -- Si una edición movió el costo de una actividad a otra, hay que
  -- recalcular ambas.
  IF v_actividad_anterior IS NOT NULL AND v_actividad_anterior IS DISTINCT FROM v_actividad_actual THEN
    UPDATE actividades
    SET costo_real = COALESCE((SELECT SUM(monto) FROM costos_reales WHERE actividad_id = v_actividad_anterior), 0)
    WHERE id = v_actividad_anterior;
  END IF;

  IF v_actividad_actual IS NOT NULL THEN
    UPDATE actividades
    SET costo_real = COALESCE((SELECT SUM(monto) FROM costos_reales WHERE actividad_id = v_actividad_actual), 0)
    WHERE id = v_actividad_actual;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_costo_real_actividad ON costos_reales;
CREATE TRIGGER trg_recalcular_costo_real_actividad
AFTER INSERT OR UPDATE OR DELETE ON costos_reales
FOR EACH ROW EXECUTE FUNCTION recalcular_costo_real_actividad();

-- ── Backfill: corrige de una vez todo lo que ya está mal hoy ──
UPDATE actividades a
SET costo_real = COALESCE(sub.total, 0)
FROM (
  SELECT actividad_id, SUM(monto) AS total
  FROM costos_reales
  WHERE actividad_id IS NOT NULL
  GROUP BY actividad_id
) sub
WHERE a.id = sub.actividad_id;

-- Actividades sin ningún costo real asociado quedan en 0 (por si alguna
-- vez se cargó algo a mano de forma inconsistente).
UPDATE actividades a
SET costo_real = 0
WHERE costo_real <> 0
  AND NOT EXISTS (SELECT 1 FROM costos_reales cr WHERE cr.actividad_id = a.id);
