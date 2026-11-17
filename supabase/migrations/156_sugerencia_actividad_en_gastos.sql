-- 156: Sugerencia de actividad para las líneas de gasto.
-- La app propone a qué actividad pertenece cada línea de una factura según lo que
-- se reportó en los Reportes Diarios en los días siguientes a la compra. La
-- sugerencia NO afecta costos hasta que el usuario la acepta.

ALTER TABLE costos_reales
  ADD COLUMN IF NOT EXISTS actividad_sugerida_id     UUID REFERENCES actividades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actividad_sugerida_motivo TEXT;

NOTIFY pgrst, 'reload schema';
