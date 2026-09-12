-- ============================================================
-- 073 — actividades.duracion_plan_dias: INTEGER -> DECIMAL(6,2)
-- ============================================================
-- Hallazgo: al re-leer el Excel de estimación para traer cantidad,
-- duración y costos (actualizar-cuadrilla-actions.ts), la mayoría de
-- las actualizaciones fallaron (ej. 82 de 87 actividades emparejadas
-- en Radnor Residence). Causa: duracion_plan_dias es INTEGER, pero el
-- Excel trae duraciones NO enteras -- cantidad_objetivo / productividad
-- de la cuadrilla casi nunca da un número redondo de días (ej. 9
-- unidades a 6 u/día = 1.5 días). Postgres rechaza el UPDATE completo
-- de esa fila al intentar meter 1.5 en una columna INTEGER.
--
-- Redondear en el cliente antes de guardar perdería exactamente la
-- precisión que se buscaba al traer estos datos del Excel (el
-- rendimiento real vs. plan usa duracion_plan_dias directamente para
-- calcular el ritmo planeado, ver lib/engine/rendimiento.ts). Por eso
-- se amplía la columna en vez de truncar el dato.
-- ============================================================

ALTER TABLE actividades
  ALTER COLUMN duracion_plan_dias TYPE DECIMAL(6,2) USING duracion_plan_dias::DECIMAL(6,2);
