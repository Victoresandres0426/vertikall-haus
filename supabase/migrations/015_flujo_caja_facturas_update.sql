-- ============================================================
-- 015 — Políticas UPDATE faltantes: flujo_caja_proyecciones,
--        facturas_cliente, facturas_proveedor
-- ============================================================
-- Diagnóstico (16 ago 2026, al automatizar el flujo de caja y agregar
-- la pantalla de Facturas):
--
-- 1) flujo_caja_proyecciones solo tenía SELECT e INSERT (005/013).
--    Tanto la carga manual como el nuevo recálculo automático hacen
--    upsert sobre (proyecto_id, semana): la primera vez es INSERT y
--    funciona, pero la segunda vez que se toca la misma semana,
--    Postgres necesita permiso de UPDATE para la fila en conflicto.
--
-- 2) facturas_cliente y facturas_proveedor solo tenían SELECT e
--    INSERT (005/013) — nunca UPDATE. Sin eso, no hay forma de marcar
--    una factura como cobrada/pagada (que es precisamente lo que
--    alimenta ingresos_real/egresos_real del flujo de caja).
-- ============================================================

CREATE POLICY "admin_dueno_actualizan_flujo_caja" ON flujo_caja_proyecciones
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "admin_dueno_actualizan_facturas_cliente" ON facturas_cliente
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

CREATE POLICY "admin_dueno_actualizan_facturas_proveedor" ON facturas_proveedor
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );
