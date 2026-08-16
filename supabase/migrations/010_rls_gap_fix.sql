-- ============================================================
-- 010 — CIERRE DE BRECHA DE RLS
-- ============================================================
-- Varias tablas creadas en 001_initial_schema.sql nunca tuvieron
-- Row Level Security habilitado (se quedaron fuera de 002 y 005).
-- Sin RLS, cualquier usuario autenticado con la anon key puede
-- leer/escribir filas de CUALQUIER empresa en estas tablas.
-- Esta migración cierra esa brecha replicando el patrón usado
-- en el resto del esquema: get_empresa_id() / get_rol_usuario().
-- ============================================================

-- ── materiales_catalogo (empresa_id directo) ─────────────────
ALTER TABLE materiales_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materiales_catalogo_select" ON materiales_catalogo
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "materiales_catalogo_insert" ON materiales_catalogo
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "materiales_catalogo_update" ON materiales_catalogo
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── materiales_actividad (vía actividad → proyecto → empresa) ─
ALTER TABLE materiales_actividad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materiales_actividad_select" ON materiales_actividad
  FOR SELECT USING (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    )
  );

CREATE POLICY "materiales_actividad_insert" ON materiales_actividad
  FOR INSERT WITH CHECK (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz')
  );

CREATE POLICY "materiales_actividad_update" ON materiales_actividad
  FOR UPDATE USING (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    )
  );

-- ── presupuestos (vía proyecto → empresa) ────────────────────
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presupuestos_select" ON presupuestos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "presupuestos_insert" ON presupuestos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "presupuestos_update" ON presupuestos
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── partidas_presupuesto (vía presupuesto → proyecto → empresa)
ALTER TABLE partidas_presupuesto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partidas_presupuesto_select" ON partidas_presupuesto
  FOR SELECT USING (
    presupuesto_id IN (
      SELECT id FROM presupuestos WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    )
  );

CREATE POLICY "partidas_presupuesto_insert" ON partidas_presupuesto
  FOR INSERT WITH CHECK (
    presupuesto_id IN (
      SELECT id FROM presupuestos WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "partidas_presupuesto_update" ON partidas_presupuesto
  FOR UPDATE USING (
    presupuesto_id IN (
      SELECT id FROM presupuestos WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── equipos (empresa_id directo) ─────────────────────────────
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipos_select" ON equipos
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "equipos_insert" ON equipos
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "equipos_update" ON equipos
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── equipos_reserva (vía proyecto → empresa) ─────────────────
ALTER TABLE equipos_reserva ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipos_reserva_select" ON equipos_reserva
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "equipos_reserva_insert" ON equipos_reserva
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz')
  );

CREATE POLICY "equipos_reserva_update" ON equipos_reserva
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

-- ── proveedores (empresa_id directo) ─────────────────────────
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proveedores_select" ON proveedores
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "proveedores_insert" ON proveedores
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "proveedores_update" ON proveedores
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── subcontratistas (empresa_id directo) ─────────────────────
ALTER TABLE subcontratistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subcontratistas_select" ON subcontratistas
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "subcontratistas_insert" ON subcontratistas
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "subcontratistas_update" ON subcontratistas
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── contratos_subcontrato (vía proyecto → empresa) ───────────
ALTER TABLE contratos_subcontrato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contratos_subcontrato_select" ON contratos_subcontrato
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "contratos_subcontrato_insert" ON contratos_subcontrato
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "contratos_subcontrato_update" ON contratos_subcontrato
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── cuadrillas (vía proyecto → empresa) ──────────────────────
ALTER TABLE cuadrillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuadrillas_select" ON cuadrillas
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "cuadrillas_insert" ON cuadrillas
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz')
  );

CREATE POLICY "cuadrillas_update" ON cuadrillas
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

-- ── cuadrilla_trabajadores (vía cuadrilla → proyecto → empresa)
ALTER TABLE cuadrilla_trabajadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuadrilla_trabajadores_select" ON cuadrilla_trabajadores
  FOR SELECT USING (
    cuadrilla_id IN (
      SELECT id FROM cuadrillas WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    )
  );

CREATE POLICY "cuadrilla_trabajadores_insert" ON cuadrilla_trabajadores
  FOR INSERT WITH CHECK (
    cuadrilla_id IN (
      SELECT id FROM cuadrillas WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz')
  );

-- ── dependencias_actividad (vía actividad → proyecto → empresa)
ALTER TABLE dependencias_actividad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dependencias_actividad_select" ON dependencias_actividad
  FOR SELECT USING (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    )
  );

CREATE POLICY "dependencias_actividad_insert" ON dependencias_actividad
  FOR INSERT WITH CHECK (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── actividades_baseline (vía actividad → proyecto → empresa) ─
ALTER TABLE actividades_baseline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actividades_baseline_select" ON actividades_baseline
  FOR SELECT USING (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    )
  );

CREATE POLICY "actividades_baseline_insert" ON actividades_baseline
  FOR INSERT WITH CHECK (
    actividad_id IN (
      SELECT id FROM actividades WHERE proyecto_id IN (
        SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()
      )
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── periodos_nomina (empresa_id directo) ─────────────────────
ALTER TABLE periodos_nomina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periodos_nomina_select" ON periodos_nomina
  FOR SELECT USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "periodos_nomina_insert" ON periodos_nomina
  FOR INSERT WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "periodos_nomina_update" ON periodos_nomina
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

-- ── lineas_nomina (vía periodo → empresa) — datos sensibles ──
ALTER TABLE lineas_nomina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lineas_nomina_select" ON lineas_nomina
  FOR SELECT USING (
    periodo_id IN (
      SELECT id FROM periodos_nomina WHERE empresa_id = get_empresa_id()
    ) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "lineas_nomina_insert" ON lineas_nomina
  FOR INSERT WITH CHECK (
    periodo_id IN (
      SELECT id FROM periodos_nomina WHERE empresa_id = get_empresa_id()
    ) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "lineas_nomina_update" ON lineas_nomina
  FOR UPDATE USING (
    periodo_id IN (
      SELECT id FROM periodos_nomina WHERE empresa_id = get_empresa_id()
    ) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

-- ── scores_rol (vía proyecto → empresa) ──────────────────────
ALTER TABLE scores_rol ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scores_rol_select" ON scores_rol
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "scores_rol_insert" ON scores_rol
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

-- ── conocimiento_historico (empresa_id directo) ──────────────
ALTER TABLE conocimiento_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conocimiento_historico_select" ON conocimiento_historico
  FOR SELECT USING (empresa_id = get_empresa_id());

CREATE POLICY "conocimiento_historico_insert" ON conocimiento_historico
  FOR INSERT WITH CHECK (empresa_id = get_empresa_id());

-- ── auditoria (no tiene empresa_id propio; se filtra vía usuario_id) ──
-- Nota: auditoria.usuario_id puede ser NULL (acciones de sistema), así
-- que solo se exponen a roles altos las filas de usuarios de su empresa.
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auditoria_select" ON auditoria
  FOR SELECT USING (
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador') AND
    usuario_id IN (
      SELECT id FROM perfiles_usuario WHERE empresa_id = get_empresa_id()
    )
  );

CREATE POLICY "auditoria_insert" ON auditoria
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- alertas — tenía SELECT (002) pero NUNCA tuvo INSERT ni UPDATE.
-- Esto ya afectaba código existente: alertas/actions.ts hace un
-- .update() sobre "alertas" al registrar una decisión, y fallaba
-- silenciosamente bajo RLS. También bloqueaba por completo al
-- motor de reglas (src/lib/engine/motor.ts), que necesita crear
-- y actualizar alertas automáticamente en cada reporte diario.
-- ============================================================

CREATE POLICY "alertas_insert" ON alertas
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

CREATE POLICY "alertas_update" ON alertas
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );
