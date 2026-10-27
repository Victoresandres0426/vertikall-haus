-- 149: Cierra fugas entre proyectos para project_manager / capataz.
-- Agrega usuario_ve_proyecto() / usuario_ve_trabajador() a las políticas de
-- lectura que solo filtraban por empresa. dueno/superadmin/administrador no
-- cambian (usuario_ve_proyecto es true para ellos).

-- ¿El usuario actual puede ver a este trabajador? PM/capataz: solo si está
-- asignado a un proyecto que ellos ven. Resto de roles: sí.
CREATE OR REPLACE FUNCTION usuario_ve_trabajador(p_trabajador_id UUID)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN get_rol_usuario() NOT IN ('capataz', 'project_manager') THEN TRUE
    ELSE EXISTS (
      SELECT 1 FROM proyecto_trabajadores pt
      WHERE pt.trabajador_id = p_trabajador_id
        AND usuario_ve_proyecto(pt.proyecto_id)
    )
  END;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- decisiones
DROP POLICY IF EXISTS "usuarios_ven_decisiones_empresa" ON decisiones;
CREATE POLICY "usuarios_ven_decisiones_empresa" ON decisiones
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    AND usuario_ve_proyecto(proyecto_id)
  );

-- archivos del proyecto
DROP POLICY IF EXISTS "empresa_ve_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "empresa_ve_metadata_archivos" ON proyecto_archivos
  FOR SELECT USING (
    get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') AND
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id)
  );

-- asignaciones de PM/capataz a proyectos
DROP POLICY IF EXISTS "pua_select_empresa" ON proyecto_usuarios_asignados;
CREATE POLICY "pua_select_empresa" ON proyecto_usuarios_asignados
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    AND usuario_ve_proyecto(proyecto_id)
  );

-- asistencia QR
DROP POLICY IF EXISTS "qr_asistencia_select_empresa" ON registros_asistencia_qr;
CREATE POLICY "qr_asistencia_select_empresa" ON registros_asistencia_qr
  FOR SELECT USING (
    proyecto_id IN (
      SELECT p.id FROM proyectos p
      JOIN perfiles_usuario pu ON pu.empresa_id = p.empresa_id
      WHERE pu.id = auth.uid()
    )
    AND usuario_ve_proyecto(proyecto_id)
  );

-- renglones y actividades creadas de Change Orders
DROP POLICY IF EXISTS "gestion_ve_co_renglones" ON change_order_renglones;
CREATE POLICY "gestion_ve_co_renglones" ON change_order_renglones
  FOR SELECT USING (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(proyecto_id)
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

DROP POLICY IF EXISTS "gestion_ve_co_actividades_creadas" ON change_order_actividades_creadas;
CREATE POLICY "gestion_ve_co_actividades_creadas" ON change_order_actividades_creadas
  FOR SELECT USING (
    change_order_id IN (
      SELECT id FROM change_orders
      WHERE proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
        AND usuario_ve_proyecto(proyecto_id)
    ) AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- trabajadores (datos personales / pagos): PM solo los de su proyecto
DROP POLICY IF EXISTS "gestion_ve_trabajadores" ON trabajadores;
CREATE POLICY "gestion_ve_trabajadores" ON trabajadores
  FOR SELECT USING (
    empresa_id = get_empresa_id() AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_trabajador(id)
  );

-- directorio de trabajadores (nombre/código): PM solo los de su proyecto
DROP FUNCTION IF EXISTS trabajadores_directorio_empresa();
CREATE FUNCTION trabajadores_directorio_empresa()
RETURNS TABLE (
  id UUID, nombre_completo TEXT, codigo TEXT, rol_obra TEXT,
  especialidad TEXT, nivel_experiencia TEXT, activo BOOLEAN,
  usuario_id UUID, usuario_rol TEXT
) AS $$
  SELECT
    t.id, t.nombre_completo, t.codigo, t.rol_obra, t.especialidad,
    t.nivel_experiencia, t.activo, t.usuario_id, pu.rol
  FROM trabajadores t
  LEFT JOIN perfiles_usuario pu ON pu.id = t.usuario_id
  WHERE t.empresa_id = get_empresa_id() AND usuario_ve_trabajador(t.id);
$$ LANGUAGE sql SECURITY DEFINER STABLE;
REVOKE ALL ON FUNCTION trabajadores_directorio_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trabajadores_directorio_empresa() TO authenticated;

-- tarifas
DROP POLICY IF EXISTS "gestion_ve_tarifas_trabajo" ON tarifas_trabajo;
CREATE POLICY "gestion_ve_tarifas_trabajo" ON tarifas_trabajo
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM trabajadores t WHERE t.id = tarifas_trabajo.trabajador_id AND t.empresa_id = get_empresa_id())
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
    AND usuario_ve_trabajador(trabajador_id)
  );

DROP POLICY IF EXISTS "gestion_administra_tarifas_trabajo" ON tarifas_trabajo;
CREATE POLICY "gestion_administra_tarifas_trabajo" ON tarifas_trabajo
  FOR ALL USING (
    EXISTS (SELECT 1 FROM trabajadores t WHERE t.id = tarifas_trabajo.trabajador_id AND t.empresa_id = get_empresa_id())
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
    AND usuario_ve_trabajador(trabajador_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM trabajadores t WHERE t.id = tarifas_trabajo.trabajador_id AND t.empresa_id = get_empresa_id())
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
    AND usuario_ve_trabajador(trabajador_id)
  );

-- dispositivos de trabajadores
DROP POLICY IF EXISTS "trabajador_dispositivos_select_empresa" ON trabajador_dispositivos;
CREATE POLICY "trabajador_dispositivos_select_empresa" ON trabajador_dispositivos
  FOR SELECT USING (
    trabajador_id IN (SELECT id FROM trabajadores WHERE empresa_id = get_empresa_id())
    AND usuario_ve_trabajador(trabajador_id)
  );

-- nómina: PM solo ve líneas de trabajadores de su proyecto
DROP POLICY IF EXISTS "lineas_nomina_select" ON lineas_nomina;
CREATE POLICY "lineas_nomina_select" ON lineas_nomina
  FOR SELECT USING (
    periodo_id IN (SELECT id FROM periodos_nomina WHERE empresa_id = get_empresa_id())
    AND get_rol_usuario() IN ('dueno', 'superadmin', 'administrador', 'project_manager')
    AND usuario_ve_trabajador(trabajador_id)
  );

-- perfiles de usuario: el PM solo ve su propio perfil, a quienes estén
-- asignados a sus mismos proyectos y al dueño/administradores de la empresa
DROP POLICY IF EXISTS "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario;
CREATE POLICY "usuarios_ven_perfiles_misma_empresa" ON perfiles_usuario
  FOR SELECT USING (
    (
      get_rol_usuario() <> ALL (ARRAY['cliente'::rol_usuario, 'colaborador_externo'::rol_usuario, 'subcontratista'::rol_usuario])
      AND empresa_id = get_empresa_id()
      AND (
        get_rol_usuario() <> 'project_manager'
        OR rol IN ('dueno', 'superadmin', 'administrador')
        OR EXISTS (
          SELECT 1 FROM proyecto_usuarios_asignados a
          WHERE a.usuario_id = perfiles_usuario.id AND usuario_ve_proyecto(a.proyecto_id)
        )
      )
    )
    OR id = auth.uid()
  );

-- registrar archivos solo en proyectos propios
DROP POLICY IF EXISTS "empresa_inserta_metadata_archivos" ON proyecto_archivos;
CREATE POLICY "empresa_inserta_metadata_archivos" ON proyecto_archivos
  FOR INSERT WITH CHECK (
    get_rol_usuario() NOT IN ('cliente', 'colaborador_externo') AND
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    usuario_ve_proyecto(proyecto_id) AND
    subido_por = auth.uid()
  );
