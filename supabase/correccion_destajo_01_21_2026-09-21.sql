-- ============================================================
-- Corrección puntual de datos (NO es una migración de esquema):
-- pago duplicado de destajo en la actividad 01.21 "Demoler y retirar
-- carpintería/mobiliario empotrado existente — closet master"
-- (proyecto Radnor), reporte del 2026-09-21.
-- ============================================================
-- Diagnóstico: ese día, Alexander Stable (Capataz) y Ruben Orta
-- (Carpintero) quedaron acreditados con 251 sf CADA UNO para la misma
-- actividad, en el mismo reporte -- pero la actividad completa son
-- 552 sf, y ya llevaba 323 sf de los 3 reportes anteriores (50+90+183).
-- Lo que realmente faltaba ese día era 552 - 323 = 229 sf, trabajados
-- por los dos juntos. Se corrige repartiendo esos 229 sf entre ambos:
-- 114.5 sf cada uno, con su pago recalculado a la misma tarifa
-- ($0.4892/sf) que ya se había aplicado: 114.5 × 0.4892 = $56.01.
--
-- Esto NO toca la cantidad_ejecutada_dia ni el % de avance de la
-- actividad (esos ya estaban correctos en 552/552, 100%) -- solo
-- corrige el monto de mano de obra pagado de más ($403.59 -> $313.03,
-- una diferencia de $90.56 menos, ya que antes se pagaban 502 sf entre
-- los dos en vez de 229).
--
-- AVISO: si a Ruben Orta y/o Alexander Stable ya se les pagó en
-- efectivo/transferencia con base en el monto viejo, esta corrección
-- solo ajusta el registro en el sistema -- la diferencia real en el
-- bolsillo de cada quien hay que reconciliarla aparte (ej. descontarla
-- del siguiente pago).
-- ============================================================

WITH act AS (
  SELECT a.id
  FROM actividades a
  JOIN proyectos p ON p.id = a.proyecto_id
  WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '01.21'
  LIMIT 1
),
reporte AS (
  SELECT 'f2397817-972a-475b-b345-d5554722b26e'::uuid AS id
)
UPDATE asistencia_actividad_diaria aad
SET avance_cantidad = 114.5,
    costo = 56.01
FROM act, reporte
WHERE aad.actividad_id = act.id
  AND aad.reporte_id = reporte.id
  AND aad.trabajador_id IN (
    SELECT id FROM trabajadores WHERE nombre_completo IN ('Alexander Stable', 'Ruben Orta')
  );

WITH act AS (
  SELECT a.id
  FROM actividades a
  JOIN proyectos p ON p.id = a.proyecto_id
  WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '01.21'
  LIMIT 1
),
reporte AS (
  SELECT 'f2397817-972a-475b-b345-d5554722b26e'::uuid AS id
)
UPDATE costos_reales cr
SET monto = 56.01,
    descripcion = 'Mano de obra (destajo) — ' || COALESCE(aad.rol_aplicado, '') || ' — 114.5 unid. (corregido: repartido entre 2 trabajadores)'
FROM act, reporte, asistencia_actividad_diaria aad
WHERE cr.actividad_id = act.id
  AND cr.reporte_id = reporte.id
  AND cr.tipo_recurso = 'mano_obra'
  AND aad.reporte_id = cr.reporte_id
  AND aad.actividad_id = cr.actividad_id
  AND aad.trabajador_id = cr.trabajador_id
  AND cr.trabajador_id IN (
    SELECT id FROM trabajadores WHERE nombre_completo IN ('Alexander Stable', 'Ruben Orta')
  );

-- Verificación: corre esto DESPUÉS de los dos UPDATE de arriba, por
-- separado, para confirmar el resultado (debe mostrar 114.5 / $56.01
-- en ambas líneas del 2026-09-21, y el total de mano de obra de la
-- actividad debe bajar de $403.59 a $313.03).
-- SELECT cr.fecha, t.nombre_completo, aad.avance_cantidad, aad.tarifa_unitaria_aplicada, cr.monto
-- FROM costos_reales cr
-- JOIN trabajadores t ON t.id = cr.trabajador_id
-- LEFT JOIN asistencia_actividad_diaria aad ON aad.reporte_id = cr.reporte_id AND aad.actividad_id = cr.actividad_id AND aad.trabajador_id = cr.trabajador_id
-- WHERE cr.actividad_id = (SELECT a.id FROM actividades a JOIN proyectos p ON p.id = a.proyecto_id WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '01.21' LIMIT 1)
--   AND cr.tipo_recurso = 'mano_obra'
-- ORDER BY cr.fecha;
