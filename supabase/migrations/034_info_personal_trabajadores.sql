-- ============================================================
-- 034 — Información de contacto personal de trabajadores
-- ============================================================
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS telefono_personal TEXT;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre TEXT;
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono TEXT;
