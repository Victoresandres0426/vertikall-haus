-- ============================================================
-- 046 — Agregar el valor 'cliente' al enum de roles
-- ============================================================
-- Postgres NO permite usar un valor nuevo de un enum en la misma
-- transacción en la que se agrega. Por eso este cambio va en un
-- archivo aparte: ejecuta primero éste, y SOLO DESPUÉS (en otra
-- ejecución separada) el archivo 047_rol_cliente_acceso.sql.
-- ============================================================

ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'cliente';
