-- ============================================================
-- 036 — Restringir presupuestos, riesgos y change orders a roles
--        de gestión (capataz no ve montos financieros)
-- ============================================================
-- Hallazgo de auditoría: presupuestos, partidas_presupuesto,
-- riesgos y change_orders permitían SELECT a cualquier usuario
-- autenticado de la empresa (incluido 'capataz'), exponiendo
-- montos presupuestados, impacto de riesgos e impacto de costo de
-- change orders. La UI ya ocultaba el botón de "crear" a capataz,
-- pero la lectura completa quedaba abierta si entraba directo a
-- la página o llamaba a la API.
--
-- No se toca la tabla "decisiones" en esta migración: su UPDATE es
-- usado por el motor automático de alertas (src/lib/engine/motor.ts)
-- durante el procesamiento de Reporte Diario, que corre con la
-- sesión de quien envía el reporte (sin service role). Restringirla
-- sin probarla en vivo podría romper ese flujo ya confirmado
-- funcionando -- queda pendiente para una revisión aparte.
-- ============================================================

DROP POLICY IF EXISTS "presupuestos_select" ON presupuestos;
CREATE POLICY "presupuestos_select" ON presupuestos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "partidas_presupuesto_select" ON partidas_presupuesto;
CREATE POLICY "partidas_presupuesto_select" ON partidas_presupuesto
  FOR SELECT USING (
    presupuesto_id IN (
      SELECT id FROM presupuestos WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "usuarios_ven_riesgos" ON riesgos;
CREATE POLICY "gestion_ve_riesgos" ON riesgos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "usuarios_ven_change_orders" ON change_orders;
CREATE POLICY "gestion_ve_change_orders" ON change_orders
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );
