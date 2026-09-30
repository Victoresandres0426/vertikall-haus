-- ============================================================
-- 136 — Backfill: cantidades reales de las 8 actividades del CO
-- "Refuerzo en paredes" (Radnor)
-- ============================================================
-- Dato confirmado por el usuario: todas las actividades de Closet
-- suman 539 SF, todas las de Cocina suman 331 SF (misma cantidad para
-- las 4 actividades de cada ambiente -- retirar sheetrock, blocking,
-- instalar sheetrock, acabado -- porque las 4 se hacen sobre la misma
-- área de pared).
--
-- Se actualiza tanto actividades (lo que se ve en Actividades/Gantt)
-- como change_order_renglones (el desglose interno del CO), para que
-- quede consistente si alguien vuelve a mirar el CO original.
-- ============================================================

UPDATE actividades act
SET cantidad_objetivo = 539, unidad = 'SF'
FROM change_order_actividades_creadas caco
JOIN change_order_renglones r ON r.id = caco.renglon_id
JOIN change_orders co ON co.id = caco.change_order_id
WHERE act.id = caco.actividad_id
  AND (co.titulo ILIKE '%refuerzo%pared%' OR co.numero ILIKE '%001%')
  AND act.nombre ILIKE '%closet%';

UPDATE actividades act
SET cantidad_objetivo = 331, unidad = 'SF'
FROM change_order_actividades_creadas caco
JOIN change_order_renglones r ON r.id = caco.renglon_id
JOIN change_orders co ON co.id = caco.change_order_id
WHERE act.id = caco.actividad_id
  AND (co.titulo ILIKE '%refuerzo%pared%' OR co.numero ILIKE '%001%')
  AND act.nombre ILIKE '%cocina%';

UPDATE change_order_renglones r
SET cantidad_objetivo = 539, unidad = 'SF'
FROM change_orders co
WHERE r.change_order_id = co.id
  AND (co.titulo ILIKE '%refuerzo%pared%' OR co.numero ILIKE '%001%')
  AND r.nombre ILIKE '%closet%';

UPDATE change_order_renglones r
SET cantidad_objetivo = 331, unidad = 'SF'
FROM change_orders co
WHERE r.change_order_id = co.id
  AND (co.titulo ILIKE '%refuerzo%pared%' OR co.numero ILIKE '%001%')
  AND r.nombre ILIKE '%cocina%';
