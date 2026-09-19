-- ============================================================
-- 090 — Gastos generales/indirectos sin actividad: vincularlos
--        a una partida directa (nueva columna costos_reales.partida_id)
-- ============================================================
-- Hasta ahora, un gasto sin actividad (ej. herramienta menor, agua,
-- consumibles de obra) se podía registrar (tipo "Indirecto", actividad
-- "Sin asignar"), pero quedaba fuera del trigger de monto_ejercido
-- (082): ese trigger solo empareja por (actividad_id, tipo_recurso), y
-- estos costos no tienen actividad_id. Resultado: el gasto sí sumaba al
-- costo total del proyecto, pero no se reflejaba como "Ejercido" contra
-- ninguna partida del Presupuesto -- quedaba flotando.
--
-- Se agrega partida_id a costos_reales: un enlace DIRECTO y opcional a
-- una partida de presupuesto, para el caso de costos que no
-- corresponden a ninguna actividad puntual. No reemplaza el
-- emparejamiento por actividad -- es una segunda vía, solo para cuando
-- actividad_id es NULL.
--
-- Se crea además una partida catch-all nueva para Radnor,
-- "Gastos generales / herramienta menor y consumibles" (separada de
-- Contingencia, tal como se pidió, para no mezclar imprevistos grandes
-- con gasto corriente chico). Se deja con monto_presupuestado = 0 --
-- no estaba en el Excel original, así que cualquier gasto que se le
-- cargue aparece honestamente como no presupuestado (el usuario puede
-- después editar la partida en Presupuesto y ponerle un monto si
-- quiere planear un monto fijo para esto).
-- ============================================================

-- ── costos_reales.partida_id ──
ALTER TABLE costos_reales
  ADD COLUMN IF NOT EXISTS partida_id UUID REFERENCES partidas_presupuesto(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_costos_reales_partida_id ON costos_reales(partida_id);

-- ── Partida catch-all para Radnor ──
INSERT INTO partidas_presupuesto (
  presupuesto_id, actividad_id, proceso_id, codigo, descripcion,
  tipo_recurso, monto_total, monto_presupuestado
)
SELECT
  p.id, NULL, NULL, 'IND-05', 'Gastos generales / herramienta menor y consumibles',
  'indirecto'::tipo_recurso, 0, 0
FROM presupuestos p
WHERE p.proyecto_id = '561331ad-3d02-40b4-b10b-19f031711440'
  AND p.es_baseline_actual = true
  AND NOT EXISTS (
    SELECT 1 FROM partidas_presupuesto pp
    WHERE pp.presupuesto_id = p.id AND pp.codigo = 'IND-05'
  );

-- ── Trigger: además del emparejamiento por (actividad_id, tipo_recurso),
--    ahora también sincroniza por partida_id directo cuando aplica. ──
CREATE OR REPLACE FUNCTION recalcular_monto_ejercido_partida()
RETURNS TRIGGER AS $$
DECLARE
  v_actividad_anterior UUID := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.actividad_id ELSE NULL END;
  v_tipo_anterior tipo_recurso := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.tipo_recurso ELSE NULL END;
  v_actividad_actual UUID := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.actividad_id ELSE NULL END;
  v_tipo_actual tipo_recurso := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.tipo_recurso ELSE NULL END;
  v_partida_anterior UUID := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.partida_id ELSE NULL END;
  v_partida_actual UUID := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.partida_id ELSE NULL END;
BEGIN
  -- Caso 1 (igual que en 082): costo real ligado a una actividad --
  -- empareja por (actividad_id, tipo_recurso).
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

  -- Caso 2 (nuevo): costo real SIN actividad pero ligado directo a una
  -- partida -- gastos generales/indirectos (herramienta menor, agua,
  -- etc.) que no corresponden a ninguna actividad puntual.
  IF v_partida_anterior IS NOT NULL AND v_partida_anterior IS DISTINCT FROM v_partida_actual THEN
    UPDATE partidas_presupuesto pp
    SET monto_ejercido = COALESCE((
      SELECT SUM(cr.monto) FROM costos_reales cr WHERE cr.partida_id = v_partida_anterior
    ), 0)
    WHERE pp.id = v_partida_anterior;
  END IF;

  IF v_partida_actual IS NOT NULL THEN
    UPDATE partidas_presupuesto pp
    SET monto_ejercido = COALESCE((
      SELECT SUM(cr.monto) FROM costos_reales cr WHERE cr.partida_id = v_partida_actual
    ), 0)
    WHERE pp.id = v_partida_actual;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existía (082) apuntando a esta misma función -- no hace
-- falta recrearlo, CREATE OR REPLACE FUNCTION ya deja el trigger usando
-- la versión nueva del cuerpo.
