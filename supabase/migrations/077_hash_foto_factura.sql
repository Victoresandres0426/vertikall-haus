-- ============================================================
-- 077 — Hash de la foto en facturas_gasto (detectar duplicados)
-- ============================================================
-- Guarda un hash SHA-256 del archivo de la foto ya comprimida que se sube.
-- Si el usuario vuelve a seleccionar/tomar la misma foto por error, el
-- sistema puede detectar que ya existe una factura con ese mismo hash en el
-- mismo proyecto y avisar antes de crear un duplicado.
-- ============================================================

ALTER TABLE facturas_gasto ADD COLUMN hash_foto TEXT;

CREATE INDEX idx_facturas_gasto_hash ON facturas_gasto(proyecto_id, hash_foto) WHERE hash_foto IS NOT NULL;
