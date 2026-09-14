-- ============================================================
-- 083 — Costos indirectos de Radnor + presupuestos.total
--        siempre sincronizado con sus partidas
-- ============================================================
-- Parte 1: el importador de Excel (proyectos/importar/actions.ts) sí le
-- pide a la IA identificar costos indirectos y contingencia, pero solo
-- los suma dentro de proyectos.presupuesto_base (un número global) --
-- nunca los crea como partida real en partidas_presupuesto. Por eso
-- nunca aparecían en la página de Presupuesto ni en la facturación
-- automática. El usuario confirmó el desglose exacto de la página 3
-- del Excel original de Radnor (reconcilia exacto contra
-- presupuesto_base = 311,151.1778):
--   Supervisión (PM + capataz de tiempo completo): 9,000.00
--   Seguro GL + Builder's Risk:                     2,782.609548
--   Movilización + logística:                       4,173.914322
--   Contingencia:                                   11,768.69915
-- Se agregan como partidas tipo 'indirecto', sin actividad_id (no
-- corresponden a ninguna actividad puntual -- son costos generales
-- del proyecto completo).
--
-- Parte 2: presupuestos.total es una columna "caché" que hasta ahora
-- solo se recalculaba desde el código de la app (actions.ts,
-- crearPartida) y solo en el momento de crear una partida nueva desde
-- ese formulario -- cualquier otra vía de inserción (import de Excel,
-- backfills SQL como el de esta misma migración) requería acordarse de
-- actualizarla a mano, y no hay ninguna ruta que la recalcule si una
-- partida se edita o se borra. Se agrega un trigger que la mantiene
-- sincronizada siempre, sin importar por dónde se toque
-- partidas_presupuesto.
--
-- Efecto en la facturación automática: generar_facturas_semanales()
-- ya calcula cada estimación como
--   presupuesto_total_del_baseline × (avance_ponderado_actual - avance_ya_facturado)
-- Al quedar los indirectos incluidos en presupuestos.total, el mismo
-- cálculo los prorratea automáticamente según el avance general
-- ponderado del proyecto -- exactamente como se pidió -- sin tener
-- que tocar la lógica de esa función.
-- ============================================================

-- ── Trigger: presupuestos.total siempre = SUM(partidas.monto_presupuestado) ──
CREATE OR REPLACE FUNCTION recalcular_total_presupuesto()
RETURNS TRIGGER AS $$
DECLARE
  v_presupuesto_anterior UUID := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.presupuesto_id ELSE NULL END;
  v_presupuesto_actual UUID := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.presupuesto_id ELSE NULL END;
BEGIN
  IF v_presupuesto_anterior IS NOT NULL AND v_presupuesto_anterior IS DISTINCT FROM v_presupuesto_actual THEN
    UPDATE presupuestos
    SET total = COALESCE((SELECT SUM(monto_presupuestado) FROM partidas_presupuesto WHERE presupuesto_id = v_presupuesto_anterior), 0)
    WHERE id = v_presupuesto_anterior;
  END IF;

  IF v_presupuesto_actual IS NOT NULL THEN
    UPDATE presupuestos
    SET total = COALESCE((SELECT SUM(monto_presupuestado) FROM partidas_presupuesto WHERE presupuesto_id = v_presupuesto_actual), 0)
    WHERE id = v_presupuesto_actual;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_total_presupuesto ON partidas_presupuesto;
CREATE TRIGGER trg_recalcular_total_presupuesto
AFTER INSERT OR UPDATE OR DELETE ON partidas_presupuesto
FOR EACH ROW EXECUTE FUNCTION recalcular_total_presupuesto();

-- ── Backfill de los indirectos de Radnor, tomados de la página 3 ──
INSERT INTO partidas_presupuesto (
  presupuesto_id, actividad_id, proceso_id, codigo, descripcion,
  tipo_recurso, monto_total, monto_presupuestado
)
SELECT
  p.id, NULL, NULL, v.codigo, v.descripcion, 'indirecto'::tipo_recurso, v.monto, v.monto
FROM presupuestos p
CROSS JOIN (VALUES
  ('IND-01', 'Supervisión (PM + capataz de tiempo completo)', 9000.00),
  ('IND-02', 'Seguro GL + Builder''s Risk', 2782.609548),
  ('IND-03', 'Movilización + logística', 4173.914322),
  ('IND-04', 'Contingencia', 11768.69915)
) AS v(codigo, descripcion, monto)
WHERE p.proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440'
  AND p.es_baseline_actual = true;

-- El trigger de arriba ya recalcula presupuestos.total al insertar estas
-- filas, así que no hace falta un UPDATE manual aparte.
