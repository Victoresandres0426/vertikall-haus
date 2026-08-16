-- ============================================================
-- 013 — Reintento de políticas RLS que 005 nunca terminó de aplicar
-- ============================================================
-- Diagnóstico (16 ago 2026): al probar el formulario de "Registrar
-- riesgo" en producción, falló con "new row violates row-level
-- security policy" (Postgres 42501). Investigando con pg_policies
-- se confirmó que de las 9 tablas que 005_missing_rls_policies.sql
-- debía cubrir, SOLO "trabajadores" quedó con sus políticas creadas.
-- Las otras 8 tablas (iidp_snapshots, change_orders, riesgos,
-- flujo_caja_proyecciones, facturas_cliente, facturas_proveedor,
-- avance_diario, asistencia_diaria) tienen RLS habilitado pero CERO
-- políticas — es decir, bloquean todo: SELECT devuelve vacío en
-- silencio e INSERT/UPDATE rechaza todo. Esto explica por qué esas
-- páginas siempre se veían vacías y por qué el motor de reglas
-- (iidp_snapshots) y el flujo de reporte diario (avance_diario,
-- asistencia_diaria) fallarían aunque el código esté bien.
--
-- Esta migración recrea exactamente esas 8 secciones de 005 (sin
-- tocar "trabajadores", que ya tiene sus 3 políticas aplicadas).
-- Si por alguna razón alguna de estas políticas SÍ existiera ya,
-- esta migración fallará en esa línea puntual con "policy already
-- exists" — en ese caso, borra solo esa sección del script y vuelve
-- a correr el resto.
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
