-- ============================================================
-- 123 — Nuevo rol de enum: subcontratista
-- ============================================================
-- Primer paso (obligatoriamente en su propia migración/transacción --
-- Postgres no permite usar un valor de enum nuevo en la misma
-- transacción en que se agrega) para el rol de portal para
-- subcontratistas.
--
-- Acceso más limitado que colaborador_externo: Cronograma, Reportes
-- diarios, Bitácora (lectura + escritura de notas/fotos), Fotos del
-- proyecto, y Planos (solo lectura -- ni sube archivos, ni ve la
-- categoría de specs/otros documentos, ni Facturas).
-- ============================================================

ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'subcontratista';
