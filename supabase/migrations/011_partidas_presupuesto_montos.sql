-- ============================================================
-- 011 — Columnas de control presupuestal en partidas_presupuesto
-- ============================================================
-- El frontend (presupuesto/page.tsx, ya existente antes de esta
-- migración) siempre consultó monto_presupuestado, monto_comprometido
-- y monto_ejercido en partidas_presupuesto para mostrar la
-- comparación "presupuestado vs. comprometido vs. ejercido" del
-- spec §11.2. Esas columnas nunca se crearon en 001_initial_schema.sql
-- (solo existía monto_total), así que esa consulta fallaba en
-- silencio y la página de Presupuesto nunca mostraba datos reales.
-- Esta migración agrega las columnas faltantes y hace backfill
-- desde monto_total para no perder datos ya cargados.
-- ============================================================

ALTER TABLE partidas_presupuesto
  ADD COLUMN IF NOT EXISTS monto_presupuestado DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_comprometido DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_ejercido DECIMAL(15,2) NOT NULL DEFAULT 0;

UPDATE partidas_presupuesto
SET monto_presupuestado = monto_total
WHERE monto_presupuestado = 0 AND monto_total <> 0;
