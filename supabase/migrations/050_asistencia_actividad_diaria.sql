-- ============================================================
-- 050 — Horas y costo de mano de obra por actividad, por día
-- ============================================================
-- Complementa a asistencia_diaria (que solo guarda el total de
-- horas del trabajador ese día, sin decir en qué actividad). Esta
-- tabla nueva permite que UN MISMO trabajador reparta las horas de
-- un mismo día entre varias actividades, cada una con su propio rol
-- aplicado -- así se refleja que, por ejemplo, hizo 4 horas como
-- ayudante en una actividad y 4 horas como electricista en otra,
-- cada una pagada a su tarifa correspondiente.
--
-- El costo se calcula y se guarda en el momento (no se recalcula
-- después), tomando la tarifa vigente de tarifas_trabajo para ese
-- rol, o la tarifa general del trabajador si no hay una específica.
-- Esto también alimenta costos_reales (tipo_recurso='mano_obra')
-- para que el costo de mano de obra por actividad se vea en el
-- proyecto, y más adelante alimenta el cálculo de nómina.
--
-- Datos de costo/salario -- mismo nivel de restricción que
-- costos_reales / trabajadores: capataz NO puede leer esta tabla
-- directamente. Toda escritura pasa por la función
-- registrar_asistencia_actividad(), que sí puede llamar cualquier
-- usuario autenticado de la empresa (el capataz que envía el
-- reporte), porque es SECURITY DEFINER y valida el acceso ella misma.
-- ============================================================

CREATE TABLE IF NOT EXISTS asistencia_actividad_diaria (
  id                   UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporte_id           UUID        NOT NULL REFERENCES reportes_diarios(id) ON DELETE CASCADE,
  trabajador_id        UUID        NOT NULL REFERENCES trabajadores(id)     ON DELETE CASCADE,
  actividad_id         UUID        NOT NULL REFERENCES actividades(id)      ON DELETE CASCADE,
  rol_aplicado         TEXT,
  horas                DECIMAL(5,2)  NOT NULL DEFAULT 0,
  tarifa_hora_aplicada DECIMAL(10,2),
  costo                DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asistencia_actividad_reporte ON asistencia_actividad_diaria(reporte_id);
CREATE INDEX idx_asistencia_actividad_trabajador ON asistencia_actividad_diaria(trabajador_id);
CREATE INDEX idx_asistencia_actividad_actividad ON asistencia_actividad_diaria(actividad_id);

ALTER TABLE asistencia_actividad_diaria ENABLE ROW LEVEL SECURITY;

-- Solo roles de gestión pueden leerla directamente (igual que costos_reales)
CREATE POLICY "gestion_ve_asistencia_actividad" ON asistencia_actividad_diaria
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reportes_diarios r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.id = asistencia_actividad_diaria.reporte_id
        AND p.empresa_id = get_empresa_id()
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- Correcciones manuales, solo gestión (el flujo normal es vía la función de abajo)
CREATE POLICY "gestion_corrige_asistencia_actividad" ON asistencia_actividad_diaria
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM reportes_diarios r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.id = asistencia_actividad_diaria.reporte_id
        AND p.empresa_id = get_empresa_id()
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

CREATE POLICY "gestion_elimina_asistencia_actividad" ON asistencia_actividad_diaria
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM reportes_diarios r
      JOIN proyectos p ON p.id = r.proyecto_id
      WHERE r.id = asistencia_actividad_diaria.reporte_id
        AND p.empresa_id = get_empresa_id()
    )
    AND get_rol_usuario() IN ('project_manager', 'dueno', 'superadmin', 'administrador')
  );

-- ── Función: registra las horas por actividad de un reporte ya creado ──
-- Recibe un JSONB array: [{trabajador_id, actividad_id, rol_aplicado, horas}, ...]
-- Calcula la tarifa aplicable y el costo de cada entrada, inserta en
-- asistencia_actividad_diaria y refleja el costo en costos_reales.
CREATE OR REPLACE FUNCTION registrar_asistencia_actividad(p_reporte_id UUID, p_entradas JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_empresa_id UUID;
  v_fecha DATE;
  v_entrada JSONB;
  v_trabajador_id UUID;
  v_actividad_id UUID;
  v_rol TEXT;
  v_horas DECIMAL(5,2);
  v_tarifa DECIMAL(10,2);
  v_costo DECIMAL(12,2);
  v_total DECIMAL(12,2) := 0;
BEGIN
  SELECT r.proyecto_id, p.empresa_id, r.fecha INTO v_proyecto_id, v_empresa_id, v_fecha
  FROM reportes_diarios r
  JOIN proyectos p ON p.id = r.proyecto_id
  WHERE r.id = p_reporte_id;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'reporte_no_encontrado';
  END IF;

  IF v_empresa_id IS NULL OR v_empresa_id <> get_empresa_id() THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  FOR v_entrada IN SELECT * FROM jsonb_array_elements(COALESCE(p_entradas, '[]'::jsonb))
  LOOP
    v_trabajador_id := (v_entrada->>'trabajador_id')::UUID;
    v_actividad_id  := (v_entrada->>'actividad_id')::UUID;
    v_rol           := NULLIF(v_entrada->>'rol_aplicado', '');
    v_horas         := COALESCE((v_entrada->>'horas')::DECIMAL, 0);

    IF v_trabajador_id IS NULL OR v_actividad_id IS NULL OR v_horas <= 0 THEN
      CONTINUE;
    END IF;

    -- Tarifa específica por rol para este trabajador, si existe;
    -- si no, la tarifa general del trabajador.
    SELECT tt.tarifa_hora INTO v_tarifa
    FROM tarifas_trabajo tt
    WHERE tt.trabajador_id = v_trabajador_id
      AND tt.rol_obra = v_rol
      AND tt.activo = true;

    IF v_tarifa IS NULL THEN
      SELECT t.tarifa_hora INTO v_tarifa FROM trabajadores t WHERE t.id = v_trabajador_id;
    END IF;

    v_costo := v_horas * COALESCE(v_tarifa, 0);
    v_total := v_total + v_costo;

    INSERT INTO asistencia_actividad_diaria
      (reporte_id, trabajador_id, actividad_id, rol_aplicado, horas, tarifa_hora_aplicada, costo)
    VALUES
      (p_reporte_id, v_trabajador_id, v_actividad_id, v_rol, v_horas, v_tarifa, v_costo);

    IF v_costo > 0 THEN
      INSERT INTO costos_reales
        (proyecto_id, actividad_id, tipo_recurso, descripcion, trabajador_id, fecha, monto, aprobado)
      VALUES
        (v_proyecto_id, v_actividad_id, 'mano_obra',
         'Mano de obra' || CASE WHEN v_rol IS NOT NULL THEN ' (' || v_rol || ')' ELSE '' END || ' — ' || v_horas || ' h',
         v_trabajador_id, v_fecha, v_costo, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'total_costo', v_total);
END;
$$;

REVOKE ALL ON FUNCTION registrar_asistencia_actividad(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_asistencia_actividad(UUID, JSONB) TO authenticated;
