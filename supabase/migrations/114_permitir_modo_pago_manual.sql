-- ============================================================
-- 114 — Permitir modo_pago = 'manual' (fix migración 113)
-- ============================================================
-- La migración 113 agregó costo_manual y el modo 'manual', pero
-- asistencia_actividad_diaria.modo_pago todavía tiene el constraint
-- original de la migración 054, que solo permite 'destajo' o 'hora'
-- -- cualquier intento de guardar un monto fijado a mano fallaba con
-- "violates check constraint asistencia_actividad_diaria_modo_pago_check".
-- ============================================================

ALTER TABLE asistencia_actividad_diaria DROP CONSTRAINT IF EXISTS asistencia_actividad_diaria_modo_pago_check;
ALTER TABLE asistencia_actividad_diaria ADD CONSTRAINT asistencia_actividad_diaria_modo_pago_check
  CHECK (modo_pago IN ('destajo', 'hora', 'manual'));
