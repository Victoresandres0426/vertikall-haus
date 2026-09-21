-- ============================================================
-- Diagnóstico: por qué una actividad al 100% (sin trabajo de más)
-- muestra sobrecosto en mano de obra -- caso 01.21 "Demoler y retirar
-- carpintería/mobiliario empotrado existente — closet master" (Radnor)
-- ============================================================
-- Corre PRIMERO el bloque 1 (selecciona el texto entre las líneas
-- "-- BLOQUE 1" y "-- BLOQUE 2" y presiona Cmd/Ctrl+Enter). Revisa el
-- resultado. Luego corre el BLOQUE 2 por separado (selecciónalo y
-- corre). Si tu proyecto no se llama "radnor" o el código de la
-- actividad no es "01.21", ajusta el WHERE de "act" abajo.
-- ============================================================

-- BLOQUE 1: comparar la tarifa "presupuesto" (Actividades) contra la
-- tarifa real que se usó para pagar destajo (Presupuesto).
WITH act AS (
  SELECT a.id, a.codigo, a.nombre, a.costo_mano_obra, a.cantidad_objetivo, a.proyecto_id
  FROM actividades a
  JOIN proyectos p ON p.id = a.proyecto_id
  WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '01.21'
  LIMIT 1
)
SELECT
  act.codigo,
  act.nombre,
  act.cantidad_objetivo,
  act.costo_mano_obra AS presupuesto_mostrado_en_actividades,
  pp.precio_unitario AS precio_unitario_en_presupuesto,
  ROUND(pp.precio_unitario * act.cantidad_objetivo, 2) AS total_segun_presupuesto,
  ROUND(act.costo_mano_obra / NULLIF(act.cantidad_objetivo, 0), 4) AS tarifa_implicita_en_actividades,
  (SELECT COALESCE(SUM(cr.monto), 0) FROM costos_reales cr WHERE cr.actividad_id = act.id AND cr.tipo_recurso = 'mano_obra') AS total_pagado_real
FROM act
LEFT JOIN presupuestos pr ON pr.proyecto_id = act.proyecto_id AND pr.es_baseline_actual = true
LEFT JOIN partidas_presupuesto pp ON pp.presupuesto_id = pr.id AND pp.actividad_id = act.id AND pp.tipo_recurso = 'mano_obra';

-- BLOQUE 2: el detalle línea por línea de qué se pagó, a quién, con
-- qué tarifa y en qué reporte -- para ver si hay líneas duplicadas o
-- una tarifa distinta a la esperada.
WITH act AS (
  SELECT a.id
  FROM actividades a
  JOIN proyectos p ON p.id = a.proyecto_id
  WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '01.21'
  LIMIT 1
)
SELECT
  cr.fecha,
  t.nombre_completo AS trabajador,
  aad.rol_aplicado,
  aad.avance_cantidad,
  aad.tarifa_unitaria_aplicada,
  aad.modo_pago,
  cr.monto,
  cr.reporte_id
FROM act
JOIN costos_reales cr ON cr.actividad_id = act.id AND cr.tipo_recurso = 'mano_obra'
LEFT JOIN trabajadores t ON t.id = cr.trabajador_id
LEFT JOIN asistencia_actividad_diaria aad
  ON aad.reporte_id = cr.reporte_id AND aad.actividad_id = cr.actividad_id AND aad.trabajador_id = cr.trabajador_id
ORDER BY cr.fecha;
