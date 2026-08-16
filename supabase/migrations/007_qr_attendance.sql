-- ============================================================
-- 007 — QR ATTENDANCE SYSTEM
-- ============================================================
-- Adds qr_token to proyectos and creates registros_asistencia_qr
-- for independent field-worker check-in/check-out via QR codes.
-- ============================================================

-- 1. Add qr_token column to proyectos
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS qr_token UUID UNIQUE DEFAULT uuid_generate_v4();

-- Backfill existing rows that have NULL qr_token
UPDATE proyectos
  SET qr_token = uuid_generate_v4()
  WHERE qr_token IS NULL;

-- 2. QR attendance log table
CREATE TABLE IF NOT EXISTS registros_asistencia_qr (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id     UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  trabajador_id   UUID REFERENCES trabajadores(id) ON DELETE SET NULL,
  nombre_manual   TEXT,                     -- fallback when worker not in DB
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  hora            TIME NOT NULL DEFAULT CURRENT_TIME,
  device_info     TEXT,                     -- optional: user-agent or device hint
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast per-project lookups
CREATE INDEX IF NOT EXISTS idx_asistencia_qr_proyecto_fecha
  ON registros_asistencia_qr (proyecto_id, fecha DESC);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE registros_asistencia_qr ENABLE ROW LEVEL SECURITY;

-- Public INSERT: anyone with a valid qr_token URL can record attendance
-- (the route validates the token before inserting, so no extra auth needed)
CREATE POLICY "qr_asistencia_insert_public"
  ON registros_asistencia_qr FOR INSERT
  WITH CHECK (true);

-- SELECT: authenticated users of the same empresa
CREATE POLICY "qr_asistencia_select_empresa"
  ON registros_asistencia_qr FOR SELECT
  USING (
    proyecto_id IN (
      SELECT p.id
      FROM proyectos p
      JOIN perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE pu.id = auth.uid()
    )
  );

-- ── Seed demo data: give existing projects proper qr_tokens ───
-- (already handled by the DEFAULT + backfill UPDATE above)
