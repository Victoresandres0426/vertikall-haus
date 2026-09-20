-- ============================================================
-- 091 — Aviso de posible factura duplicada por CONTENIDO
--        (lugar + fecha + total), no solo por archivo de foto
-- ============================================================
-- La migración 077 agregó hash_foto para detectar cuando se sube la
-- MISMA foto (mismo archivo) dos veces. Pero si el usuario toma DOS
-- fotos distintas del mismo recibo físico (distinto ángulo, luz, o
-- simplemente se repitió la toma), cada foto es un archivo diferente
-- -- el hash no coincide y el duplicado pasa desconocido. Se detectó
-- en producción: dos facturas de "The Home Depot", mismo día, mismo
-- total ($108.00), pero la IA leyó el número de referencia con
-- puntuación ligeramente distinta en cada foto ("0251 00055 56923" vs.
-- "0251-00055-56923"), confirmando que era el mismo ticket fotografiado
-- dos veces.
--
-- Se agrega posible_duplicado_nota: un texto simple que se llena
-- automáticamente después del análisis de IA (cuando ya se conoce
-- lugar/fecha/total reales) si existe otra factura del mismo proyecto,
-- misma fecha, mismo lugar y mismo total. No bloquea nada -- solo se
-- muestra como aviso en la lista para que el usuario decida si borrar
-- una de las dos.
-- ============================================================

ALTER TABLE facturas_gasto
  ADD COLUMN IF NOT EXISTS posible_duplicado_nota TEXT;
