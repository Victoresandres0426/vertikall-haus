-- ============================================================
-- 051 — Cálculo automático de nómina por periodo
-- ============================================================
-- Antes, lineas_nomina existía como tabla pero nada la llenaba —
-- no había página de Nómina ni cálculo automático. Esta migración
-- agrega la función que, dado un periodo (fecha_inicio/fecha_fin),
-- calcula por cada trabajador activo de la empresa:
--   - días trabajados y horas (regulares/extra) del periodo
--   - salario_base = suma del costo REAL por actividad (horas ×
--     tarifa de ese rol específico, calculado en cada reporte diario
--     vía registrar_asistencia_actividad — migración 050), no un
--     cálculo plano de tarifa_diaria × días
--   - distribución de ese costo entre los proyectos donde trabajó
-- Los ajustes manuales (bonos, deducciones, anticipos) NO se pisan
-- si ya existían -- recalcular un periodo solo actualiza las horas
-- y el salario base, y vuelve a sumar el neto a pagar.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lineas_nomina_periodo_trabajador_uniq'
  ) THEN
    ALTER TABLE lineas_nomina
      ADD CONSTRAINT lineas_nomina_periodo_trabajador_uniq UNIQUE (periodo_id, trabajador_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION calcular_nomina_periodo(p_periodo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_empresa_id UUID;
  v_inicio DATE;
  v_fin DATE;
  v_trabajador RECORD;
  v_dias DECIMAL(4,2);
  v_horas_reg DECIMAL(6,2);
  v_horas_ext DECIMAL(6,2);
  v_salario DECIMAL(12,2);
  v_distribucion JSONB;
  v_count INTEGER := 0;
BEGIN
  -- Mismo nivel de acceso que lineas_nomina (migración 010): más
  -- estricto que periodos_nomina -- project_manager ve que el periodo
  -- existe, pero no los montos de sueldo de cada trabajador.
  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  SELECT empresa_id, fecha_inicio, fecha_fin INTO v_empresa_id, v_inicio, v_fin
  FROM periodos_nomina
  WHERE id = p_periodo_id;

  IF v_empresa_id IS NULL OR v_empresa_id <> get_empresa_id() THEN
    RAISE EXCEPTION 'periodo_no_encontrado';
  END IF;

  FOR v_trabajador IN
    SELECT id FROM trabajadores WHERE empresa_id = v_empresa_id AND activo = true
  LOOP
    -- Días con horas registradas y total de horas regulares/extra en el periodo
    SELECT
      COUNT(DISTINCT r.fecha) FILTER (WHERE (a.horas_regulares + a.horas_extra) > 0),
      COALESCE(SUM(a.horas_regulares), 0),
      COALESCE(SUM(a.horas_extra), 0)
    INTO v_dias, v_horas_reg, v_horas_ext
    FROM asistencia_diaria a
    JOIN reportes_diarios r ON r.id = a.reporte_id
    WHERE a.trabajador_id = v_trabajador.id
      AND r.fecha BETWEEN v_inicio AND v_fin;

    -- Salario real: suma del costo calculado por actividad/rol ese periodo
    SELECT COALESCE(SUM(aad.costo), 0) INTO v_salario
    FROM asistencia_actividad_diaria aad
    JOIN reportes_diarios r ON r.id = aad.reporte_id
    WHERE aad.trabajador_id = v_trabajador.id
      AND r.fecha BETWEEN v_inicio AND v_fin;

    -- Cómo se reparte ese costo entre los proyectos donde trabajó
    SELECT COALESCE(jsonb_agg(jsonb_build_object('proyecto_id', pid, 'monto', monto)), '[]'::jsonb)
    INTO v_distribucion
    FROM (
      SELECT r.proyecto_id AS pid, SUM(aad.costo) AS monto
      FROM asistencia_actividad_diaria aad
      JOIN reportes_diarios r ON r.id = aad.reporte_id
      WHERE aad.trabajador_id = v_trabajador.id
        AND r.fecha BETWEEN v_inicio AND v_fin
      GROUP BY r.proyecto_id
    ) sub;

    INSERT INTO lineas_nomina
      (periodo_id, trabajador_id, dias_trabajados, horas_regulares, horas_extra, salario_base, distribucion_proyectos, neto_a_pagar)
    VALUES
      (p_periodo_id, v_trabajador.id, v_dias, v_horas_reg, v_horas_ext, v_salario, v_distribucion, v_salario)
    ON CONFLICT (periodo_id, trabajador_id) DO UPDATE SET
      dias_trabajados = EXCLUDED.dias_trabajados,
      horas_regulares = EXCLUDED.horas_regulares,
      horas_extra = EXCLUDED.horas_extra,
      salario_base = EXCLUDED.salario_base,
      distribucion_proyectos = EXCLUDED.distribucion_proyectos,
      -- Recalcula el neto conservando bonos/deducciones/anticipos ya cargados a mano
      neto_a_pagar = EXCLUDED.salario_base + COALESCE(lineas_nomina.extra_monto, 0)
                     + COALESCE(lineas_nomina.bonos, 0)
                     - COALESCE(lineas_nomina.deducciones, 0)
                     - COALESCE(lineas_nomina.anticipos, 0);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'trabajadores', v_count);
END;
$$;

REVOKE ALL ON FUNCTION calcular_nomina_periodo(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calcular_nomina_periodo(UUID) TO authenticated;
