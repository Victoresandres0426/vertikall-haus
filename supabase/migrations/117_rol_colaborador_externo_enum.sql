-- ============================================================
-- 117 — Nuevo rol de enum: colaborador_externo
-- ============================================================
-- Primer paso (obligatoriamente en su propia migración/transacción --
-- Postgres no permite usar un valor de enum nuevo en la misma
-- transacción en que se agrega) para el rol genérico de colaboradores
-- externos con acceso al portal (diseñador, arquitecto, etc.).
--
-- Es un rol único y genérico -- el "título" visible (Diseñador,
-- Arquitecto, Ingeniero...) es un campo de texto libre aparte
-- (titulo_colaborador, agregado en la migración 118), no distintos
-- valores de enum. Varias personas pueden tener este mismo rol en el
-- mismo proyecto a la vez (no hay UNIQUE sobre proyecto_id).
-- ============================================================

ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'colaborador_externo';
