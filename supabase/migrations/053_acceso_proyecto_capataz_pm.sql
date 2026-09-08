-- ============================================================
-- 053 — Acceso restringido por proyecto para capataz y project_manager
-- ============================================================
-- Hasta ahora, un usuario con rol 'capataz' o 'project_manager' podía
-- ver y operar sobre TODOS los proyectos de la empresa (RLS solo
-- validaba empresa_id, nunca el proyecto específico). El único
-- mecanismo de "equipo por proyecto" que existía (proyecto_trabajadores,
-- migración 009) es para TRABAJADORES de obra (check-in QR), no para
-- usuarios internos del sistema.
--
-- Esta migración agrega una tabla de asignación (proyecto_usuarios_asignados)
-- y una función usuario_ve_proyecto(proyecto_id) que:
--   - Deja pasar sin restricción a dueno/superadmin/administrador (y
--     cliente, que de todas formas no usa estas políticas directamente).
--   - Para capataz/project_manager, exige una fila en
--     proyecto_usuarios_asignados para ese proyecto específico.
--
-- Luego, cada política existente que hoy da acceso empresa-wide a
-- capataz/project_manager se recrea (DROP + CREATE) con su MISMA
-- condición original, agregando "AND usuario_ve_proyecto(...)" — no se
-- cambia ningún otro comportamiento.
--
-- Deliberadamente NO se tocan en esta migración:
--   - trabajadores, tarifas_trabajo, periodos_nomina, lineas_nomina:
--     Personal y Nómina se mantienen globales (decisión explícita del
--     usuario — un trabajador/nómina no pertenece a un solo proyecto).
--   - materiales_catalogo, equipos, proveedores, subcontratistas,
--     conocimiento_historico: catálogos de toda la empresa, sin
--     proyecto_id propio.
--   - decisiones: su UPDATE lo usa el motor automático de alertas
--     (motor.ts) corriendo con la sesión de quien envía el reporte;
--     migración 036 ya dejó esto pendiente por el mismo motivo — se
--     restringe aparte, con pruebas en vivo.
--   - proyecto_trabajadores "pt_select_public" (USING true): debe
--     seguir siendo público para que el check-in QR sin login funcione.
--
-- IMPORTANTE (acción requerida después de correr esta migración):
-- todo capataz o PM que hoy ya trabaja en un proyecto debe ser asignado
-- a ese proyecto desde la nueva sección "Acceso de capataz/PM" en el
-- detalle del proyecto -- si no, dejará de ver ese proyecto por completo
-- hasta que se le asigne.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Tabla de asignación proyecto ↔ usuario interno
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proyecto_usuarios_asignados (
  id            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  proyecto_id   UUID        NOT NULL REFERENCES proyectos(id)        ON DELETE CASCADE,
  usuario_id    UUID        NOT NULL REFERENCES perfiles_usuario(id) ON DELETE CASCADE,
  asignado_por  UUID        REFERENCES perfiles_usuario(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(proyecto_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_proyecto_usuarios_asignados_usuario ON proyecto_usuarios_asignados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_proyecto_usuarios_asignados_proyecto ON proyecto_usuarios_asignados(proyecto_id);

ALTER TABLE proyecto_usuarios_asignados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pua_select_empresa" ON proyecto_usuarios_asignados
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
  );

-- Solo dueno/superadmin/administrador asignan/quitan -- si project_manager
-- pudiera insertar libremente, podría auto-asignarse a cualquier proyecto
-- y anular la restricción.
CREATE POLICY "pua_insert_managers" ON proyecto_usuarios_asignados
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "pua_delete_managers" ON proyecto_usuarios_asignados
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('dueno', 'superadmin', 'administrador')
  );

-- ────────────────────────────────────────────────────────────
-- 2) Función: ¿el usuario actual puede ver este proyecto?
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION usuario_ve_proyecto(p_proyecto_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM proyectos p
    WHERE p.id = p_proyecto_id
      AND p.empresa_id = get_empresa_id()
      AND (
        get_rol_usuario() NOT IN ('capataz', 'project_manager')
        OR EXISTS (
          SELECT 1 FROM proyecto_usuarios_asignados pua
          WHERE pua.proyecto_id = p_proyecto_id
            AND pua.usuario_id = auth.uid()
        )
      )
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- 3) proyectos
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_proyectos_empresa" ON proyectos;
CREATE POLICY "usuarios_ven_proyectos_empresa" ON proyectos
  FOR SELECT USING (
    empresa_id = get_empresa_id() AND usuario_ve_proyecto(id)
  );

DROP POLICY IF EXISTS "pm_dueno_actualizan_proyectos" ON proyectos;
CREATE POLICY "pm_dueno_actualizan_proyectos" ON proyectos
  FOR UPDATE USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(id)
  ) WITH CHECK (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(id)
  );

-- ============================================================
-- 4) procesos
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_procesos" ON procesos;
CREATE POLICY "usuarios_ven_procesos" ON procesos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "pm_dueno_administran_procesos" ON procesos;
CREATE POLICY "pm_dueno_administran_procesos" ON procesos
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 5) actividades
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_actividades" ON actividades;
CREATE POLICY "usuarios_ven_actividades" ON actividades
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "pm_dueno_administran_actividades" ON actividades;
CREATE POLICY "pm_dueno_administran_actividades" ON actividades
  FOR ALL USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "capataz_actualiza_avance_actividades" ON actividades;
CREATE POLICY "capataz_actualiza_avance_actividades" ON actividades
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() = 'capataz' AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 6) reportes_diarios
-- ============================================================
DROP POLICY IF EXISTS "capataz_crea_su_reporte" ON reportes_diarios;
CREATE POLICY "capataz_crea_su_reporte" ON reportes_diarios
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    capataz_id = auth.uid() AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "usuarios_ven_reportes_empresa" ON reportes_diarios;
CREATE POLICY "usuarios_ven_reportes_empresa" ON reportes_diarios
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "capataz_edita_su_reporte_no_enviado" ON reportes_diarios;
CREATE POLICY "capataz_edita_su_reporte_no_enviado" ON reportes_diarios
  FOR UPDATE USING (
    capataz_id = auth.uid() AND estado_reporte = 'borrador' AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 7) avance_diario
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_avance_diario" ON avance_diario;
CREATE POLICY "usuarios_ven_avance_diario" ON avance_diario
  FOR SELECT USING (
    reporte_id IN (
      SELECT r.id FROM reportes_diarios r
      WHERE r.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(r.proyecto_id)
    )
  );

DROP POLICY IF EXISTS "capataz_crea_avance_diario" ON avance_diario;
CREATE POLICY "capataz_crea_avance_diario" ON avance_diario
  FOR INSERT WITH CHECK (
    reporte_id IN (
      SELECT r.id FROM reportes_diarios r
      WHERE r.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
      AND r.capataz_id = auth.uid()
      AND usuario_ve_proyecto(r.proyecto_id)
    )
  );

-- ============================================================
-- 8) asistencia_diaria
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_asistencia" ON asistencia_diaria;
CREATE POLICY "usuarios_ven_asistencia" ON asistencia_diaria
  FOR SELECT USING (
    reporte_id IN (
      SELECT r.id FROM reportes_diarios r
      WHERE r.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(r.proyecto_id)
    )
  );

DROP POLICY IF EXISTS "capataz_crea_asistencia" ON asistencia_diaria;
CREATE POLICY "capataz_crea_asistencia" ON asistencia_diaria
  FOR INSERT WITH CHECK (
    reporte_id IN (
      SELECT r.id FROM reportes_diarios r
      WHERE r.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
      AND r.capataz_id = auth.uid()
      AND usuario_ve_proyecto(r.proyecto_id)
    )
  );

-- ============================================================
-- 9) alertas
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_alertas_empresa" ON alertas;
CREATE POLICY "usuarios_ven_alertas_empresa" ON alertas
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "alertas_insert" ON alertas;
CREATE POLICY "alertas_insert" ON alertas
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "alertas_update" ON alertas;
CREATE POLICY "alertas_update" ON alertas
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 10) costos_reales
-- ============================================================
DROP POLICY IF EXISTS "admin_pm_dueno_ven_costos" ON costos_reales;
CREATE POLICY "admin_pm_dueno_ven_costos" ON costos_reales
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "admin_crea_costos" ON costos_reales;
CREATE POLICY "admin_crea_costos" ON costos_reales
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 11) iidp_snapshots
-- ============================================================
DROP POLICY IF EXISTS "usuarios_ven_iidp_snapshots" ON iidp_snapshots;
CREATE POLICY "usuarios_ven_iidp_snapshots" ON iidp_snapshots
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "sistema_inserta_iidp" ON iidp_snapshots;
CREATE POLICY "sistema_inserta_iidp" ON iidp_snapshots
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "sistema_actualiza_iidp" ON iidp_snapshots;
CREATE POLICY "sistema_actualiza_iidp" ON iidp_snapshots
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 12) change_orders
-- ============================================================
DROP POLICY IF EXISTS "gestion_ve_change_orders" ON change_orders;
CREATE POLICY "gestion_ve_change_orders" ON change_orders
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "pm_dueno_admin_crean_change_orders" ON change_orders;
CREATE POLICY "pm_dueno_admin_crean_change_orders" ON change_orders
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "pm_dueno_admin_actualizan_change_orders" ON change_orders;
CREATE POLICY "pm_dueno_admin_actualizan_change_orders" ON change_orders
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 13) riesgos
-- ============================================================
DROP POLICY IF EXISTS "gestion_ve_riesgos" ON riesgos;
CREATE POLICY "gestion_ve_riesgos" ON riesgos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "pm_dueno_admin_crean_riesgos" ON riesgos;
CREATE POLICY "pm_dueno_admin_crean_riesgos" ON riesgos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 14) flujo_caja_proyecciones
-- ============================================================
DROP POLICY IF EXISTS "usuarios_autorizados_ven_flujo_caja" ON flujo_caja_proyecciones;
CREATE POLICY "usuarios_autorizados_ven_flujo_caja" ON flujo_caja_proyecciones
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "admin_dueno_crean_flujo_caja" ON flujo_caja_proyecciones;
CREATE POLICY "admin_dueno_crean_flujo_caja" ON flujo_caja_proyecciones
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "admin_dueno_actualizan_flujo_caja" ON flujo_caja_proyecciones;
CREATE POLICY "admin_dueno_actualizan_flujo_caja" ON flujo_caja_proyecciones
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 15) facturas_cliente / facturas_proveedor
-- (solo SELECT incluye a project_manager; INSERT/UPDATE ya lo excluyen)
-- ============================================================
DROP POLICY IF EXISTS "admin_dueno_ven_facturas_cliente" ON facturas_cliente;
CREATE POLICY "admin_dueno_ven_facturas_cliente" ON facturas_cliente
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "admin_dueno_ven_facturas_proveedor" ON facturas_proveedor;
CREATE POLICY "admin_dueno_ven_facturas_proveedor" ON facturas_proveedor
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 16) presupuestos
-- ============================================================
DROP POLICY IF EXISTS "presupuestos_select" ON presupuestos;
CREATE POLICY "presupuestos_select" ON presupuestos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "presupuestos_insert" ON presupuestos;
CREATE POLICY "presupuestos_insert" ON presupuestos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "presupuestos_update" ON presupuestos;
CREATE POLICY "presupuestos_update" ON presupuestos
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 17) partidas_presupuesto (vía presupuesto → proyecto)
-- ============================================================
DROP POLICY IF EXISTS "partidas_presupuesto_select" ON partidas_presupuesto;
CREATE POLICY "partidas_presupuesto_select" ON partidas_presupuesto
  FOR SELECT USING (
    presupuesto_id IN (
      SELECT pr.id FROM presupuestos pr
      WHERE pr.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(pr.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "partidas_presupuesto_insert" ON partidas_presupuesto;
CREATE POLICY "partidas_presupuesto_insert" ON partidas_presupuesto
  FOR INSERT WITH CHECK (
    presupuesto_id IN (
      SELECT pr.id FROM presupuestos pr
      WHERE pr.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(pr.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "partidas_presupuesto_update" ON partidas_presupuesto;
CREATE POLICY "partidas_presupuesto_update" ON partidas_presupuesto
  FOR UPDATE USING (
    presupuesto_id IN (
      SELECT pr.id FROM presupuestos pr
      WHERE pr.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(pr.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ============================================================
-- 18) materiales_actividad (vía actividad → proyecto)
-- ============================================================
DROP POLICY IF EXISTS "materiales_actividad_select" ON materiales_actividad;
CREATE POLICY "materiales_actividad_select" ON materiales_actividad
  FOR SELECT USING (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    )
  );

DROP POLICY IF EXISTS "materiales_actividad_insert" ON materiales_actividad;
CREATE POLICY "materiales_actividad_insert" ON materiales_actividad
  FOR INSERT WITH CHECK (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz')
  );

DROP POLICY IF EXISTS "materiales_actividad_update" ON materiales_actividad;
CREATE POLICY "materiales_actividad_update" ON materiales_actividad
  FOR UPDATE USING (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    )
  );

-- ============================================================
-- 19) equipos_reserva
-- ============================================================
DROP POLICY IF EXISTS "equipos_reserva_select" ON equipos_reserva;
CREATE POLICY "equipos_reserva_select" ON equipos_reserva
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "equipos_reserva_insert" ON equipos_reserva;
CREATE POLICY "equipos_reserva_insert" ON equipos_reserva
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "equipos_reserva_update" ON equipos_reserva;
CREATE POLICY "equipos_reserva_update" ON equipos_reserva
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 20) dependencias_actividad (vía actividad → proyecto)
-- ============================================================
DROP POLICY IF EXISTS "dependencias_actividad_select" ON dependencias_actividad;
CREATE POLICY "dependencias_actividad_select" ON dependencias_actividad
  FOR SELECT USING (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    )
  );

DROP POLICY IF EXISTS "dependencias_actividad_insert" ON dependencias_actividad;
CREATE POLICY "dependencias_actividad_insert" ON dependencias_actividad
  FOR INSERT WITH CHECK (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ============================================================
-- 21) actividades_baseline (vía actividad → proyecto)
-- ============================================================
DROP POLICY IF EXISTS "actividades_baseline_select" ON actividades_baseline;
CREATE POLICY "actividades_baseline_select" ON actividades_baseline
  FOR SELECT USING (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    )
  );

DROP POLICY IF EXISTS "actividades_baseline_insert" ON actividades_baseline;
CREATE POLICY "actividades_baseline_insert" ON actividades_baseline
  FOR INSERT WITH CHECK (
    actividad_id IN (
      SELECT a.id FROM actividades a
      WHERE a.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(a.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ============================================================
-- 22) proyecto_trabajadores (gestión de equipo autorizado en obra)
-- (pt_select_public NO se toca -- debe seguir público para el check-in QR)
-- ============================================================
DROP POLICY IF EXISTS "pt_insert_managers" ON proyecto_trabajadores;
CREATE POLICY "pt_insert_managers"
  ON proyecto_trabajadores
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM   proyectos p
      JOIN   perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE  p.id  = proyecto_trabajadores.proyecto_id
        AND  pu.id = auth.uid()
        AND  pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
        AND  pu.activo = true
    )
    AND usuario_ve_proyecto(proyecto_trabajadores.proyecto_id)
  );

DROP POLICY IF EXISTS "pt_update_managers" ON proyecto_trabajadores;
CREATE POLICY "pt_update_managers"
  ON proyecto_trabajadores
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM   proyectos p
      JOIN   perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE  p.id  = proyecto_trabajadores.proyecto_id
        AND  pu.id = auth.uid()
        AND  pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
        AND  pu.activo = true
    )
    AND usuario_ve_proyecto(proyecto_trabajadores.proyecto_id)
  );

DROP POLICY IF EXISTS "pt_delete_managers" ON proyecto_trabajadores;
CREATE POLICY "pt_delete_managers"
  ON proyecto_trabajadores
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM   proyectos p
      JOIN   perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE  p.id  = proyecto_trabajadores.proyecto_id
        AND  pu.id = auth.uid()
        AND  pu.rol IN ('capataz', 'project_manager', 'administrador', 'dueno', 'superadmin')
        AND  pu.activo = true
    )
    AND usuario_ve_proyecto(proyecto_trabajadores.proyecto_id)
  );

-- ============================================================
-- 23) proyecto_archivos + storage.objects (planos, fotos, contratos)
-- (las políticas DELETE ya son solo-dueno, no se tocan)
-- ============================================================
DROP POLICY IF EXISTS "empresa_ve_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_ve_archivos_proyecto" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'proyecto-archivos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "empresa_sube_archivos_proyecto" ON storage.objects;
CREATE POLICY "empresa_sube_archivos_proyecto" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'proyecto-archivos' AND
    (storage.foldername(name))[1]::uuid IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto((storage.foldername(name))[1]::uuid)
  );

DROP POLICY IF EXISTS "empresa_ve_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "empresa_ve_metadata_archivos" ON proyecto_archivos
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "empresa_inserta_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "empresa_inserta_metadata_archivos" ON proyecto_archivos
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    subido_por = auth.uid() AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 24) cuadrillas
-- ============================================================
DROP POLICY IF EXISTS "cuadrillas_select" ON cuadrillas;
CREATE POLICY "cuadrillas_select" ON cuadrillas
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "cuadrillas_insert" ON cuadrillas;
CREATE POLICY "cuadrillas_insert" ON cuadrillas
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "cuadrillas_update" ON cuadrillas;
CREATE POLICY "cuadrillas_update" ON cuadrillas
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 25) cuadrilla_trabajadores (vía cuadrilla → proyecto)
-- ============================================================
DROP POLICY IF EXISTS "cuadrilla_trabajadores_select" ON cuadrilla_trabajadores;
CREATE POLICY "cuadrilla_trabajadores_select" ON cuadrilla_trabajadores
  FOR SELECT USING (
    cuadrilla_id IN (
      SELECT c.id FROM cuadrillas c
      WHERE c.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(c.proyecto_id)
    )
  );

DROP POLICY IF EXISTS "cuadrilla_trabajadores_insert" ON cuadrilla_trabajadores;
CREATE POLICY "cuadrilla_trabajadores_insert" ON cuadrilla_trabajadores
  FOR INSERT WITH CHECK (
    cuadrilla_id IN (
      SELECT c.id FROM cuadrillas c
      WHERE c.proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(c.proyecto_id)
    ) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador', 'capataz')
  );

-- ============================================================
-- 26) contratos_subcontrato
-- ============================================================
DROP POLICY IF EXISTS "contratos_subcontrato_select" ON contratos_subcontrato;
CREATE POLICY "contratos_subcontrato_select" ON contratos_subcontrato
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "contratos_subcontrato_insert" ON contratos_subcontrato;
CREATE POLICY "contratos_subcontrato_insert" ON contratos_subcontrato
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "contratos_subcontrato_update" ON contratos_subcontrato;
CREATE POLICY "contratos_subcontrato_update" ON contratos_subcontrato
  FOR UPDATE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 27) scores_rol
-- ============================================================
DROP POLICY IF EXISTS "scores_rol_select" ON scores_rol;
CREATE POLICY "scores_rol_select" ON scores_rol
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

DROP POLICY IF EXISTS "scores_rol_insert" ON scores_rol;
CREATE POLICY "scores_rol_insert" ON scores_rol
  FOR INSERT WITH CHECK (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

-- ============================================================
-- 28) asistencia_actividad_diaria (vía reporte → proyecto)
-- ============================================================
DROP POLICY IF EXISTS "gestion_ve_asistencia_actividad" ON asistencia_actividad_diaria;
CREATE POLICY "gestion_ve_asistencia_actividad" ON asistencia_actividad_diaria
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reportes_diarios r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.id = asistencia_actividad_diaria.reporte_id
        AND p.empresa_id = get_empresa_id()
        AND usuario_ve_proyecto(r.proyecto_id)
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "gestion_corrige_asistencia_actividad" ON asistencia_actividad_diaria;
CREATE POLICY "gestion_corrige_asistencia_actividad" ON asistencia_actividad_diaria
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reportes_diarios r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.id = asistencia_actividad_diaria.reporte_id
        AND p.empresa_id = get_empresa_id()
        AND usuario_ve_proyecto(r.proyecto_id)
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "gestion_elimina_asistencia_actividad" ON asistencia_actividad_diaria;
CREATE POLICY "gestion_elimina_asistencia_actividad" ON asistencia_actividad_diaria
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reportes_diarios r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.id = asistencia_actividad_diaria.reporte_id
        AND p.empresa_id = get_empresa_id()
        AND usuario_ve_proyecto(r.proyecto_id)
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );
