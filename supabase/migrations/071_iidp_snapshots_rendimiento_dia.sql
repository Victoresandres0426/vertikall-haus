-- ============================================================
-- 071 — Totales diarios de rendimiento en iidp_snapshots
-- ============================================================
-- El motor ahora calcula Productividad como un promedio ACUMULADO
-- (ponderado por horas, no promedio de promedios) del rendimiento real
-- vs. plan desde el inicio del proyecto hasta hoy, en vez de solo el
-- reflejo de un día. Para no tener que releer toda la asistencia
-- histórica en cada corrida, cada snapshot diario guarda también sus
-- propios totales crudos (horas reales trabajadas y su equivalente en
-- horas de plan según lo que realmente se produjo); el acumulado sale
-- de sumar estas columnas con SUM() sobre los días anteriores.
--
-- Ver src/lib/engine/rendimiento.ts y src/lib/engine/motor.ts.
-- ============================================================

ALTER TABLE iidp_snapshots ADD COLUMN IF NOT EXISTS horas_reales_dia DECIMAL(10,2) DEFAULT 0;
ALTER TABLE iidp_snapshots ADD COLUMN IF NOT EXISTS horas_equivalentes_plan_dia DECIMAL(10,2) DEFAULT 0;

COMMENT ON COLUMN iidp_snapshots.horas_reales_dia IS
  'Suma de horas reales trabajadas ese día (de asistencia_actividad_diaria) usadas para el cálculo de rendimiento vs. plan.';
COMMENT ON COLUMN iidp_snapshots.horas_equivalentes_plan_dia IS
  'Suma de horas equivalentes al plan ese día: avance_cantidad real / ritmo planeado de cada actividad.';
