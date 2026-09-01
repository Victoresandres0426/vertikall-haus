-- ============================================================
-- 045 — Cascada completa para poder borrar un proyecto de verdad
-- ============================================================
-- La migración 044 dejó "eliminar_proyecto_seguro" como borrado
-- permanente, pero se probó en producción y falló: varias tablas
-- referencian actividad_id / proceso_id (no solo proyecto_id) sin
-- ON DELETE CASCADE. Aunque esas filas de todas formas iban a
-- borrarse por la cadena proyecto_id -> ... -> presupuesto_id, el
-- orden en que Postgres resuelve las cascadas no lo garantiza, y la
-- restricción sin CASCADE se dispara antes (error real visto:
-- "partidas_presupuesto_proceso_id_fkey" bloqueando el borrado de
-- "procesos"). Se corrigen aquí TODAS las referencias a actividades
-- y procesos que faltaban, para que no vuelva a pasar con otra tabla.
-- ============================================================

ALTER TABLE contratos_subcontrato DROP CONSTRAINT IF EXISTS contratos_subcontrato_actividad_id_fkey;
ALTER TABLE contratos_subcontrato
  ADD CONSTRAINT contratos_subcontrato_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE asistencia_diaria DROP CONSTRAINT IF EXISTS asistencia_diaria_actividad_principal_id_fkey;
ALTER TABLE asistencia_diaria
  ADD CONSTRAINT asistencia_diaria_actividad_principal_id_fkey
  FOREIGN KEY (actividad_principal_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE avance_diario DROP CONSTRAINT IF EXISTS avance_diario_actividad_id_fkey;
ALTER TABLE avance_diario
  ADD CONSTRAINT avance_diario_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE consumo_material_diario DROP CONSTRAINT IF EXISTS consumo_material_diario_actividad_id_fkey;
ALTER TABLE consumo_material_diario
  ADD CONSTRAINT consumo_material_diario_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE partidas_presupuesto DROP CONSTRAINT IF EXISTS partidas_presupuesto_actividad_id_fkey;
ALTER TABLE partidas_presupuesto
  ADD CONSTRAINT partidas_presupuesto_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE partidas_presupuesto DROP CONSTRAINT IF EXISTS partidas_presupuesto_proceso_id_fkey;
ALTER TABLE partidas_presupuesto
  ADD CONSTRAINT partidas_presupuesto_proceso_id_fkey
  FOREIGN KEY (proceso_id) REFERENCES procesos(id) ON DELETE CASCADE;

ALTER TABLE costos_reales DROP CONSTRAINT IF EXISTS costos_reales_actividad_id_fkey;
ALTER TABLE costos_reales
  ADD CONSTRAINT costos_reales_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE facturas_proveedor DROP CONSTRAINT IF EXISTS facturas_proveedor_actividad_id_fkey;
ALTER TABLE facturas_proveedor
  ADD CONSTRAINT facturas_proveedor_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE alertas DROP CONSTRAINT IF EXISTS alertas_actividad_id_fkey;
ALTER TABLE alertas
  ADD CONSTRAINT alertas_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE decisiones DROP CONSTRAINT IF EXISTS decisiones_actividad_id_fkey;
ALTER TABLE decisiones
  ADD CONSTRAINT decisiones_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;

ALTER TABLE riesgos DROP CONSTRAINT IF EXISTS riesgos_actividad_id_fkey;
ALTER TABLE riesgos
  ADD CONSTRAINT riesgos_actividad_id_fkey
  FOREIGN KEY (actividad_id) REFERENCES actividades(id) ON DELETE CASCADE;
