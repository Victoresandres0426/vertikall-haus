-- Change Orders: separar costo directo (material+mano de obra, lo que
-- captura el usuario) del margen de utilidad+OH que se calcula
-- automáticamente sobre ese directo -- mismo criterio que ya usa el
-- presupuesto base del proyecto (ver PRESUPUESTO RADNOR +5%.pdf:
-- "MARGEN CONTRATISTA (Utilidad + OH)" ≈ 20.91% sobre costos directos).
--
-- El % vive por proyecto (cada contrato puede tener un margen distinto
-- pactado con el cliente) y queda fijo -- no se recalcula solo, el
-- dueño/PM lo ajusta a mano en la ficha del proyecto si cambia.

ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS margen_co_pct NUMERIC(5,2) NOT NULL DEFAULT 20.91;

COMMENT ON COLUMN proyectos.margen_co_pct IS
  'Porcentaje de Utilidad+OH que se aplica automáticamente sobre el costo directo (material+mano de obra) al registrar un Change Order.';

-- costo_directo: lo que el usuario captura (material + mano de obra).
-- margen_pct_aplicado / costo_margen: quedan congelados al momento de
-- crear el CO (snapshot), para que si más adelante se cambia el % del
-- proyecto, los CO ya registrados no cambien de valor retroactivamente.
-- impacto_costo sigue siendo el TOTAL (directo + margen) -- no se toca
-- su significado, para no romper todo lo que ya lo usa (CxC, dashboard,
-- Riesgos, etc.).
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS costo_directo NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS margen_pct_aplicado NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS costo_margen NUMERIC(15,2);
