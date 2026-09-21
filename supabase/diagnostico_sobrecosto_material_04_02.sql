-- ============================================================
-- Diagnóstico: actividad 04.02 "Instalar refuerzos interiores
-- (blocking para millwork/anclajes) — living" (Radnor) al 100%, sin
-- exceso de cantidad (253/253 SF), pero con sobrecosto en MATERIAL
-- ($357 real vs presupuesto) -- el rojo en pantalla está en "Mat:",
-- no en "MO:", así que el problema es de material, no de mano de obra.
-- ============================================================
-- Corre el BLOQUE 1 primero (selecciónalo y Cmd/Ctrl+Enter), luego el
-- BLOQUE 2 por separado.
-- ============================================================

-- BLOQUE 1: presupuesto de material vs. lo realmente registrado.
WITH act AS (
  SELECT a.id, a.codigo, a.nombre, a.costo_material, a.cantidad_objetivo, a.proyecto_id
  FROM actividades a
  JOIN proyectos p ON p.id = a.proyecto_id
  WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '04.02'
  LIMIT 1
)
SELECT
  act.codigo,
  act.nombre,
  act.costo_material AS presupuesto_material,
  pp.precio_unitario AS precio_unitario_en_presupuesto,
  ROUND(pp.precio_unitario * act.cantidad_objetivo, 2) AS total_segun_presupuesto,
  (SELECT COALESCE(SUM(cr.monto), 0) FROM costos_reales cr WHERE cr.actividad_id = act.id AND cr.tipo_recurso = 'material') AS total_material_real,
  (SELECT COUNT(*) FROM costos_reales cr WHERE cr.actividad_id = act.id AND cr.tipo_recurso = 'material') AS num_lineas
FROM act
LEFT JOIN presupuestos pr ON pr.proyecto_id = act.proyecto_id AND pr.es_baseline_actual = true
LEFT JOIN partidas_presupuesto pp ON pp.presupuesto_id = pr.id AND pp.actividad_id = act.id AND pp.tipo_recurso = 'material';

-- BLOQUE 2: cada línea de material registrada para esta actividad --
-- de dónde salió (factura/recibo), cantidad, precio unitario y monto.
WITH act AS (
  SELECT a.id
  FROM actividades a
  JOIN proyectos p ON p.id = a.proyecto_id
  WHERE p.nombre ILIKE '%radnor%' AND a.codigo = '04.02'
  LIMIT 1
)
SELECT
  cr.fecha,
  cr.descripcion,
  cr.cantidad,
  cr.unidad,
  cr.precio_unitario,
  cr.tax,
  cr.monto,
  fg.lugar AS factura_lugar,
  fg.referencia AS factura_referencia,
  cr.factura_id
FROM act
JOIN costos_reales cr ON cr.actividad_id = act.id AND cr.tipo_recurso = 'material'
LEFT JOIN facturas_gasto fg ON fg.id = cr.factura_id
ORDER BY cr.fecha;
