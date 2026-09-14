-- ============================================================
-- 076 — Estado de análisis de IA en facturas_gasto
-- ============================================================
-- Antes, subir una foto obligaba a esperar a que la IA terminara de
-- analizarla dentro del mismo modal antes de poder guardar algo. Ahora la
-- factura se crea de inmediato (con la foto ya archivada) y el análisis de
-- IA corre después, en segundo plano, actualizando esta misma fila cuando
-- termina -- por eso hace falta saber en qué estado va cada una:
--   'manual'    -- se llenó a mano, no involucra IA
--   'pendiente' -- se subió la foto, la IA todavía no ha terminado
--   'analizada' -- la IA ya terminó (con o sin líneas encontradas)
--   'error'     -- la IA falló -- se puede reintentar
-- ============================================================

ALTER TABLE facturas_gasto ADD COLUMN estado_analisis TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE facturas_gasto ADD CONSTRAINT facturas_gasto_estado_analisis_check
  CHECK (estado_analisis IN ('manual', 'pendiente', 'analizada', 'error'));
