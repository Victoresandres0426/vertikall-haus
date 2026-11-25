-- 157: Permite re-guardar el avance de un reporte diario ya existente.
-- avance_diario solo tenía políticas de SELECT e INSERT. Al reenviar el reporte
-- del mismo día, la app hace un upsert (INSERT ... ON CONFLICT DO UPDATE) y la
-- parte UPDATE era rechazada por RLS: "new row violates row-level security
-- policy (USING expression) for table avance_diario".
-- Misma regla que el INSERT: solo quien creó ese reporte, en un proyecto que ve.

DROP POLICY IF EXISTS "capataz_actualiza_avance_diario" ON avance_diario;
CREATE POLICY "capataz_actualiza_avance_diario" ON avance_diario
  FOR UPDATE
  USING (
    reporte_id IN (
      SELECT r.id FROM reportes_diarios r
      WHERE r.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND r.capataz_id = auth.uid()
        AND usuario_ve_proyecto(r.proyecto_id)
    )
  )
  WITH CHECK (
    reporte_id IN (
      SELECT r.id FROM reportes_diarios r
      WHERE r.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND r.capataz_id = auth.uid()
        AND usuario_ve_proyecto(r.proyecto_id)
    )
  );
