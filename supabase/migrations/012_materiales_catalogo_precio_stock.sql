-- ============================================================
-- 012 — Columnas de precio y stock en materiales_catalogo
-- ============================================================
-- Igual que 011 con partidas_presupuesto: el frontend (materiales/page.tsx,
-- ya existente antes de esta ronda) siempre consultó precio_unitario,
-- stock_actual y stock_minimo en materiales_catalogo para mostrar precios
-- y alertas de stock bajo mínimo. Esas columnas nunca se crearon en
-- 001_initial_schema.sql, así que:
--   - El SELECT fallaba en silencio (Materiales siempre mostraba "Catálogo vacío").
--   - El INSERT del formulario nuevo de "Agregar material" fallaba con
--     PGRST204 "Could not find the 'precio_unitario' column...".
-- ============================================================

ALTER TABLE materiales_catalogo
  ADD COLUMN IF NOT EXISTS precio_unitario DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS stock_actual DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS stock_minimo DECIMAL(12,3);
