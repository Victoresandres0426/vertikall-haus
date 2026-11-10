-- 155: Cargo del contacto principal y un segundo contacto por subcontratista.
-- Idempotente.

ALTER TABLE subcontratistas
  ADD COLUMN IF NOT EXISTS contacto_cargo      TEXT,
  ADD COLUMN IF NOT EXISTS contacto2_nombre    TEXT,
  ADD COLUMN IF NOT EXISTS contacto2_cargo     TEXT,
  ADD COLUMN IF NOT EXISTS contacto2_telefono  TEXT,
  ADD COLUMN IF NOT EXISTS contacto2_email     TEXT;

NOTIFY pgrst, 'reload schema';
