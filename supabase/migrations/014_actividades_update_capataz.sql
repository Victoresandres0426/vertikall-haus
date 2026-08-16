-- ============================================================
-- 014 — Capataz/administrador pueden actualizar actividades
-- ============================================================
-- Diagnóstico (16 ago 2026, al construir el motor de ruta crítica):
-- la única política UPDATE de "actividades" (pm_dueno_administran_actividades,
-- FOR ALL) solo cubre project_manager/dueno/superadmin. Pero:
--   - crearReporteDiario (reporte-diario/actions.ts) actualiza
--     avance_porcentaje/cantidad_ejecutada/estado en "actividades" cada
--     vez que un capataz guarda su reporte del día.
--   - El motor de reglas (cpm.ts + motor.ts) ahora actualiza
--     es_critica/holgura_dias en cada corrida.
-- Un usuario con rol "capataz" (no dueño/admin/superadmin) nunca pudo
-- guardar su propio avance por RLS — esto no se detectó antes porque
-- todas las pruebas en producción se hicieron con la cuenta "dueño".
-- También se agrega "administrador" a la administración completa de
-- actividades, siguiendo el mismo patrón usado en el resto del esquema.
-- ============================================================

CREATE POLICY "capataz_actualiza_avance_actividades" ON actividades
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() = 'capataz'
  );

CREATE POLICY "administrador_administra_actividades" ON actividades
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() = 'administrador'
  );
