-- ============================================================
-- 072 — Composición de cuadrilla y productividad de referencia
-- ============================================================
-- El Excel original de estimación (del que se importan los proyectos)
-- trae, para muchas actividades, dos columnas que hasta ahora se
-- perdían al importar: "COMPOSICIÓN DE CUADRILLA" (ej. "Carpintero +
-- Peón", "2 Peones") y "PRODUCTIVIDAD" (ej. "6 u/día", "150 sf/día").
--
-- personal_planeado (migración 070) ya existe y es la que alimenta el
-- cálculo de rendimiento real vs. plan -- pero se queda en NULL (se
-- asume 1) para cualquier actividad importada antes de esta migración,
-- porque el importador nunca tuvo de dónde sacar ese número.
--
-- Estas dos columnas nuevas son solo de referencia/consulta (no
-- alimentan ningún cálculo): permiten ver en la vista de Actividades
-- de dónde salió el personal_planeado que sí se usa en el motor, y
-- guardar el texto de productividad del estimador para comparar contra
-- el rendimiento real reportado en obra.
-- ============================================================

ALTER TABLE actividades ADD COLUMN IF NOT EXISTS composicion_cuadrilla TEXT;
ALTER TABLE actividades ADD COLUMN IF NOT EXISTS productividad_plan_texto TEXT;

COMMENT ON COLUMN actividades.composicion_cuadrilla IS
  'Texto libre del estimador describiendo la cuadrilla asumida (ej. "Carpintero + Peón", "2 Peones"). Solo de referencia -- personal_planeado es el número que usa el motor.';
COMMENT ON COLUMN actividades.productividad_plan_texto IS
  'Texto libre del estimador con el ritmo asumido para toda la cuadrilla (ej. "6 u/día", "150 sf/día"). Solo de referencia para comparar contra el rendimiento real reportado.';
