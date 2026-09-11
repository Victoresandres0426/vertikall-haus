-- ============================================================
-- 063 — actividades.costo_presupuesto se mantiene sincronizado con
--        costo_material + costo_mano_obra (trigger + backfill)
-- ============================================================
-- Hallazgo: costo_presupuesto es lo que usa el motor de alertas y el
-- IIDP como "presupuesto" de la actividad, y la app (actividades/actions.ts)
-- SIEMPRE lo recalcula como costo_material + costo_mano_obra al editar
-- desde la UI. Pero cuando se corrige un presupuesto por SQL directo
-- (como la consolidación de las actividades de puertas) y solo se
-- actualizan costo_material/costo_mano_obra a mano, costo_presupuesto se
-- queda desincronizado -- causando alertas de "sobrecosto" falsas o
-- exageradas (compara el costo real acumulado contra un presupuesto
-- viejo y más chico del que corresponde).
--
-- Ejemplo real: 01.01 "Remover puerta y marco existentes" quedó con
-- costo_presupuesto=$136.71 (presupuesto de 1 puerta, previo a la
-- consolidación) mientras costo_material+costo_mano_obra ya sumaban
-- $575.20 (9 puertas) -- el motor marcaba 776% de sobrecosto comparando
-- contra el número viejo.
--
-- Solución: mismo patrón que la migración 057 (costo_real) -- un
-- trigger que recalcula costo_presupuesto cada vez que cambian
-- costo_material o costo_mano_obra, sin importar si el cambio vino de
-- la UI o de SQL directo. Más un backfill que corrige lo que ya está
-- desincronizado hoy.
-- ============================================================

CREATE OR REPLACE FUNCTION sincronizar_costo_presupuesto()
RETURNS TRIGGER AS $$
BEGIN
  NEW.costo_presupuesto := COALESCE(NEW.costo_material, 0) + COALESCE(NEW.costo_mano_obra, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sincronizar_costo_presupuesto ON actividades;
CREATE TRIGGER trg_sincronizar_costo_presupuesto
BEFORE INSERT OR UPDATE OF costo_material, costo_mano_obra ON actividades
FOR EACH ROW EXECUTE FUNCTION sincronizar_costo_presupuesto();

-- ── Backfill: corrige de una vez todo lo que ya está desincronizado ──
UPDATE actividades
SET costo_presupuesto = COALESCE(costo_material, 0) + COALESCE(costo_mano_obra, 0)
WHERE costo_presupuesto IS DISTINCT FROM (COALESCE(costo_material, 0) + COALESCE(costo_mano_obra, 0));
