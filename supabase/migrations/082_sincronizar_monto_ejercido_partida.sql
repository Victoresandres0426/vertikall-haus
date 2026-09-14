-- ============================================================
-- 082 — partidas_presupuesto.monto_ejercido se mantiene
--        sincronizado con costos_reales (trigger + backfill)
-- ============================================================
-- La migración 011 agregó monto_ejercido a partidas_presupuesto para
-- que la página de Presupuesto pudiera comparar presupuestado vs.
-- ejercido, pero nunca se creó nada que escribiera en esa columna.
-- La migración 057 sí sincroniza actividades.costo_real desde
-- costos_reales (mismo problema, resuelto ahí), pero ese trigger no
-- toca partidas_presupuesto. Resultado: "Ejercido" siempre mostraba
-- $0 en Presupuesto, sin importar cuántos gastos reales se hubieran
-- registrado (destajo, materiales, facturas de gasto, etc.).
--
-- Igual que en la 057, se usa (actividad_id, tipo_recurso) como llave
-- de emparejamiento: cada costo real trae ambos campos, y cada
-- partida de presupuesto también. Un mismo costo real puede afectar
-- partidas de distintas versiones de presupuesto para la misma
-- actividad (igual que actividades.costo_real es un valor único por
-- actividad sin importar la versión de presupuesto).
--
-- Los costos reales sin actividad_id (ej. costos indirectos generales
-- del proyecto, no ligados a una actividad puntual) no se pueden
-- emparejar por esta vía y quedan fuera de este fix -- es un caso
-- aparte que se está revisando por separado.
-- ============================================================

CREATE OR REPLACE FUNCTION recalcular_monto_ejercido_partida()
RETURNS TRIGGER AS $$
DECLARE
  v_actividad_anterior UUID := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.actividad_id ELSE NULL END;
  v_tipo_anterior tipo_recurso := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.tipo_recurso ELSE NULL END;
  v_actividad_actual UUID := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.actividad_id ELSE NULL END;
  v_tipo_actual tipo_recurso := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.tipo_recurso ELSE NULL END;
BEGIN
  -- Si una edición movió el costo de actividad y/o tipo de recurso,
  -- hay que recalcular ambos lados.
  IF v_actividad_anterior IS NOT NULL
     AND (v_actividad_anterior IS DISTINCT FROM v_actividad_actual OR v_tipo_anterior IS DISTINCT FROM v_tipo_actual)
  THEN
    UPDATE partidas_presupuesto pp
    SET monto_ejercido = COALESCE((
      SELECT SUM(cr.monto) FROM costos_reales cr
      WHERE cr.actividad_id = v_actividad_anterior AND cr.tipo_recurso = v_tipo_anterior
    ), 0)
    WHERE pp.actividad_id = v_actividad_anterior AND pp.tipo_recurso = v_tipo_anterior;
  END IF;

  IF v_actividad_actual IS NOT NULL THEN
    UPDATE partidas_presupuesto pp
    SET monto_ejercido = COALESCE((
      SELECT SUM(cr.monto) FROM costos_reales cr
      WHERE cr.actividad_id = v_actividad_actual AND cr.tipo_recurso = v_tipo_actual
    ), 0)
    WHERE pp.actividad_id = v_actividad_actual AND pp.tipo_recurso = v_tipo_actual;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalcular_monto_ejercido_partida ON costos_reales;
CREATE TRIGGER trg_recalcular_monto_ejercido_partida
AFTER INSERT OR UPDATE OR DELETE ON costos_reales
FOR EACH ROW EXECUTE FUNCTION recalcular_monto_ejercido_partida();

-- ── Backfill: corrige de una vez todo lo que ya está mal hoy ──
UPDATE partidas_presupuesto pp
SET monto_ejercido = COALESCE(sub.total, 0)
FROM (
  SELECT actividad_id, tipo_recurso, SUM(monto) AS total
  FROM costos_reales
  WHERE actividad_id IS NOT NULL
  GROUP BY actividad_id, tipo_recurso
) sub
WHERE pp.actividad_id = sub.actividad_id AND pp.tipo_recurso = sub.tipo_recurso;

-- Partidas cuya actividad/tipo no tiene ningún costo real asociado
-- quedan en 0 (por si algo se cargó mal a mano antes).
UPDATE partidas_presupuesto pp
SET monto_ejercido = 0
WHERE monto_ejercido <> 0
  AND pp.actividad_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM costos_reales cr
    WHERE cr.actividad_id = pp.actividad_id AND cr.tipo_recurso = pp.tipo_recurso
  );
