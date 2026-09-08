-- ============================================================
-- 056 — "Inicio real" (proyecto y actividad) se marca solo
-- ============================================================
-- Hallazgo: fecha_inicio_real existe como columna en actividades y en
-- proyectos desde la migración 001, pero NINGÚN flujo de la app la
-- escribía -- ni el Reporte Diario, ni la edición de actividades. Por
-- eso el resumen del proyecto siempre mostraba "Inicio real: —" aunque
-- ya hubiera avance real registrado.
--
-- Solución: un trigger en la base de datos, no en el código de la app,
-- para que funcione sin importar desde dónde se actualice una
-- actividad (Reporte Diario hoy, importador de Excel, futuras
-- pantallas, etc.) y no dependa de que cada lugar se acuerde de
-- ponerlo.
--
-- 1) Cuando una actividad recibe su primer avance real (avance_porcentaje
--    > 0, o pasa a en_progreso/completada) y todavía no tiene
--    fecha_inicio_real, se marca con la fecha de hoy.
-- 2) Cuando una actividad queda con fecha_inicio_real (por el trigger
--    anterior), se propaga al proyecto -- pero solo si el proyecto
--    todavía no tenía su propia fecha_inicio_real (la primera actividad
--    que arranca marca el inicio real de la obra).
-- 3) Backfill: actividades y proyectos que YA tienen avance real hoy
--    (como Radnor) se corrigen de una vez con este mismo criterio.
-- ============================================================

-- ── 1) Actividad: fecha_inicio_real la primera vez que hay avance real ──
CREATE OR REPLACE FUNCTION marcar_inicio_real_actividad()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_inicio_real IS NULL
     AND (NEW.avance_porcentaje > 0 OR NEW.estado IN ('en_progreso', 'completada')) THEN
    NEW.fecha_inicio_real := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marcar_inicio_real_actividad ON actividades;
CREATE TRIGGER trg_marcar_inicio_real_actividad
BEFORE UPDATE ON actividades
FOR EACH ROW EXECUTE FUNCTION marcar_inicio_real_actividad();

-- ── 2) Proyecto: se marca cuando su primera actividad arranca ──
CREATE OR REPLACE FUNCTION marcar_inicio_real_proyecto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_inicio_real IS NOT NULL AND OLD.fecha_inicio_real IS NULL THEN
    UPDATE proyectos
    SET fecha_inicio_real = NEW.fecha_inicio_real
    WHERE id = NEW.proyecto_id AND fecha_inicio_real IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marcar_inicio_real_proyecto ON actividades;
CREATE TRIGGER trg_marcar_inicio_real_proyecto
AFTER UPDATE ON actividades
FOR EACH ROW EXECUTE FUNCTION marcar_inicio_real_proyecto();

-- ── 3) Backfill de lo que ya tiene avance real hoy ──
UPDATE actividades
SET fecha_inicio_real = CURRENT_DATE
WHERE fecha_inicio_real IS NULL
  AND (avance_porcentaje > 0 OR estado IN ('en_progreso', 'completada'));

UPDATE proyectos p
SET fecha_inicio_real = sub.min_fecha
FROM (
  SELECT proyecto_id, MIN(fecha_inicio_real) AS min_fecha
  FROM actividades
  WHERE fecha_inicio_real IS NOT NULL
  GROUP BY proyecto_id
) sub
WHERE p.id = sub.proyecto_id AND p.fecha_inicio_real IS NULL;
