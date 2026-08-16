-- ============================================================
-- 017 — Falta política UPDATE en iidp_snapshots
-- ============================================================
-- Diagnóstico (16 ago 2026, en Vercel Logs): "Error guardando IIDP:
-- new row violates row-level security policy (USING expression) for
-- table iidp_snapshots". El motor hace upsert sobre (proyecto_id,
-- fecha) en CADA corrida -- la primera vez que se calcula el IIDP de
-- un proyecto en el día es INSERT y funciona, pero si el motor corre
-- una segunda vez el mismo día (por ejemplo al reenviar un reporte),
-- Postgres necesita UPDATE para la fila en conflicto. Mismo patrón
-- que 014/015/016.
-- ============================================================

CREATE POLICY "sistema_actualiza_iidp" ON iidp_snapshots
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );
