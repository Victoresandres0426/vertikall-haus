-- ============================================================
-- RLS FALTANTES — Vertikall Haus
-- Tablas con RLS habilitado pero sin políticas SELECT
-- ============================================================

-- ── iidp_snapshots ─────────────────────────────────────────
CREATE POLICY "usuarios_ven_iidp_snapshots" ON iidp_snapshots
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "sistema_inserta_iidp" ON iidp_snapshots
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

-- ── trabajadores ───────────────────────────────────────────
CREATE POLICY "usuarios_ven_trabajadores" ON trabajadores
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "pm_dueno_admin_crean_trabajadores" ON trabajadores
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "pm_dueno_admin_actualizan_trabajadores" ON trabajadores
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── change_orders ──────────────────────────────────────────
CREATE POLICY "usuarios_ven_change_orders" ON change_orders
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "pm_dueno_admin_crean_change_orders" ON change_orders
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "pm_dueno_admin_actualizan_change_orders" ON change_orders
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── riesgos ────────────────────────────────────────────────
CREATE POLICY "usuarios_ven_riesgos" ON riesgos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "pm_dueno_admin_crean_riesgos" ON riesgos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── flujo_caja_proyecciones ────────────────────────────────
CREATE POLICY "usuarios_autorizados_ven_flujo_caja" ON flujo_caja_proyecciones
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "admin_dueno_crean_flujo_caja" ON flujo_caja_proyecciones
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

-- ── facturas_cliente ───────────────────────────────────────
CREATE POLICY "admin_dueno_ven_facturas_cliente" ON facturas_cliente
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "admin_dueno_crean_facturas_cliente" ON facturas_cliente
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

-- ── facturas_proveedor ─────────────────────────────────────
CREATE POLICY "admin_dueno_ven_facturas_proveedor" ON facturas_proveedor
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "admin_dueno_crean_facturas_proveedor" ON facturas_proveedor
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin')
  );

-- ── avance_diario ──────────────────────────────────────────
ALTER TABLE avance_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_ven_avance_diario" ON avance_diario
  FOR SELECT USING (
    reporte_id IN (
      SELECT id FROM reportes_diarios
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    )
  );

CREATE POLICY "capataz_crea_avance_diario" ON avance_diario
  FOR INSERT WITH CHECK (
    reporte_id IN (
      SELECT id FROM reportes_diarios
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
      AND capataz_id = auth.uid()
    )
  );

-- ── asistencia_diaria ──────────────────────────────────────
ALTER TABLE asistencia_diaria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_ven_asistencia" ON asistencia_diaria
  FOR SELECT USING (
    reporte_id IN (
      SELECT id FROM reportes_diarios
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    )
  );

CREATE POLICY "capataz_crea_asistencia" ON asistencia_diaria
  FOR INSERT WITH CHECK (
    reporte_id IN (
      SELECT id FROM reportes_diarios
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
      AND capataz_id = auth.uid()
    )
  );
