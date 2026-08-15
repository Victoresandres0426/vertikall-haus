-- ============================================================
-- ROW LEVEL SECURITY — Vertikall Haus
-- Cada empresa solo ve sus propios datos
-- ============================================================

-- Habilitar RLS en todas las tablas principales
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE procesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE iidp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos_reales ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE riesgos ENABLE ROW LEVEL SECURITY;

-- Función auxiliar: obtener empresa del usuario actual
CREATE OR REPLACE FUNCTION get_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id FROM perfiles_usuario WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Función auxiliar: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_rol_usuario()
RETURNS rol_usuario AS $$
  SELECT rol FROM perfiles_usuario WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- POLÍTICAS: empresas
-- ============================================================
CREATE POLICY "usuarios_ven_su_empresa" ON empresas
  FOR SELECT USING (id = get_empresa_id());

CREATE POLICY "solo_dueno_actualiza_empresa" ON empresas
  FOR UPDATE USING (
    id = get_empresa_id() AND get_rol_usuario() IN ('dueno', 'superadmin')
  );

-- ============================================================
-- POLÍTICAS: perfiles_usuario
-- ============================================================
CREATE POLICY "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "usuario_actualiza_su_propio_perfil" ON perfiles_usuario
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "dueno_administra_usuarios" ON perfiles_usuario
  FOR ALL USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin')
  );

-- ============================================================
-- POLÍTICAS: proyectos
-- ============================================================
CREATE POLICY "usuarios_ven_proyectos_empresa" ON proyectos
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "pm_dueno_crean_proyectos" ON proyectos
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "pm_dueno_actualizan_proyectos" ON proyectos
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin')
  );

-- ============================================================
-- POLÍTICAS: procesos y actividades
-- ============================================================
CREATE POLICY "usuarios_ven_procesos" ON procesos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "pm_dueno_administran_procesos" ON procesos
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "usuarios_ven_actividades" ON actividades
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "pm_dueno_administran_actividades" ON actividades
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin')
  );

-- ============================================================
-- POLÍTICAS: reportes diarios (Capataz puede crear, PM/Dueño ven)
-- ============================================================
CREATE POLICY "capataz_crea_su_reporte" ON reportes_diarios
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    capataz_id = auth.uid()
  );

CREATE POLICY "usuarios_ven_reportes_empresa" ON reportes_diarios
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "capataz_edita_su_reporte_no_enviado" ON reportes_diarios
  FOR UPDATE USING (
    capataz_id = auth.uid() AND estado_reporte = 'borrador'
  );

-- ============================================================
-- POLÍTICAS: alertas
-- ============================================================
CREATE POLICY "usuarios_ven_alertas_empresa" ON alertas
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

-- ============================================================
-- POLÍTICAS: decisiones
-- ============================================================
CREATE POLICY "usuarios_ven_decisiones_empresa" ON decisiones
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "usuarios_autorizados_crean_decisiones" ON decisiones
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    aprobado_por = auth.uid()
  );

-- ============================================================
-- POLÍTICAS: costos y finanzas
-- ============================================================
CREATE POLICY "admin_pm_dueno_ven_costos" ON costos_reales
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

CREATE POLICY "admin_crea_costos" ON costos_reales
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin')
  );

-- ============================================================
-- POLÍTICAS: notificaciones (usuario ve solo las suyas)
-- ============================================================
CREATE POLICY "usuario_ve_sus_notificaciones" ON notificaciones
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "usuario_marca_leidas" ON notificaciones
  FOR UPDATE USING (usuario_id = auth.uid());
