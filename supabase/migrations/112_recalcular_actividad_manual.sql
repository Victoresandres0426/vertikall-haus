-- ============================================================
-- 112 — Mecanismo manual para refrescar avance/costo de actividades
-- ============================================================
-- Contexto: se auditó todo el código que escribe
-- actividades.cantidad_ejecutada / avance_porcentaje / estado /
-- costo_real. Conclusión: la capa de triggers (migraciones 057 y 064)
-- ya recalcula bien -- SUMA real desde avance_diario/costos_reales,
-- maneja reasignación y borrado -- así que NO hay un bug de "los
-- valores no cuadran" a nivel de base de datos.
--
-- El riesgo real estaba en dos lugares de la app que, en vez de dejar
-- que el trigger recalculara, reimplementaban la fórmula a mano en
-- TypeScript porque tocan cantidad_objetivo directamente (lo cual no
-- dispara el trigger, que solo escucha cambios en avance_diario):
--   - actividades/actions.ts -> actualizarActividad
--   - actividades/actualizar-cuadrilla-actions.ts -> aplicarActualizacionCuadrilla
-- Este segundo caso además tenía una condición de carrera real: tomaba
-- una "foto" de cantidad_ejecutada al principio del lote y la usaba
-- para las ~90 actividades del Excel, así que un Reporte Diario
-- guardado a la mitad del proceso podía dejar avance_porcentaje/estado
-- desincronizados de la cantidad_ejecutada real (que sí queda bien,
-- porque esa la pone el trigger).
--
-- Solución: exponer la MISMA fórmula que usa el trigger como una
-- función invocable (recalcular_actividad / recalcular_actividades_proyecto),
-- para que la app llame a esto en vez de reimplementarlo, y además dar
-- un botón "Recalcular" en Actividades que el dueño pueda usar cuando
-- sospeche que algo no cuadra -- sin depender de una migración nueva
-- cada vez.
-- ============================================================

-- Recalcula avance (reusando _recalcular_avance_actividad, migración
-- 064) Y costo_real (mismo SUM que usa el trigger de la migración 057)
-- de UNA actividad. Pensada para llamarse después de cualquier cambio
-- manual a cantidad_objetivo/costo_material/costo_mano_obra, y para el
-- botón de refresco.
CREATE OR REPLACE FUNCTION recalcular_actividad(p_actividad_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
BEGIN
  SELECT proyecto_id INTO v_proyecto_id FROM actividades WHERE id = p_actividad_id;

  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'actividad_no_encontrada';
  END IF;

  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador', 'project_manager') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF NOT usuario_ve_proyecto(v_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  PERFORM _recalcular_avance_actividad(p_actividad_id);

  UPDATE actividades
  SET costo_real = COALESCE((SELECT SUM(monto) FROM costos_reales WHERE actividad_id = p_actividad_id), 0)
  WHERE id = p_actividad_id;
END;
$$;

REVOKE ALL ON FUNCTION recalcular_actividad(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recalcular_actividad(UUID) TO authenticated;

-- Versión "botón": recalcula TODAS las actividades activas de un
-- proyecto de una sola llamada. Devuelve cuántas se procesaron.
CREATE OR REPLACE FUNCTION recalcular_actividades_proyecto(p_proyecto_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_total INTEGER := 0;
BEGIN
  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador', 'project_manager') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF NOT usuario_ve_proyecto(p_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  FOR v_id IN SELECT id FROM actividades WHERE proyecto_id = p_proyecto_id AND activa IS NOT FALSE LOOP
    PERFORM _recalcular_avance_actividad(v_id);

    UPDATE actividades
    SET costo_real = COALESCE((SELECT SUM(monto) FROM costos_reales WHERE actividad_id = v_id), 0)
    WHERE id = v_id;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION recalcular_actividades_proyecto(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recalcular_actividades_proyecto(UUID) TO authenticated;
