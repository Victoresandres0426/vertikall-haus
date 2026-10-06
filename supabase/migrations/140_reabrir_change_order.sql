-- 140: Reabrir un Change Order aprobado para corregirlo y reenviarlo.
-- Revierte lo que decidir_change_order() creó (actividades, partidas y
-- prorrateo de indirectos) y deja el CO en 'en_estimacion'. Se bloquea
-- si ya hay avance reportado o facturas ligadas (habría que ajustarlo a mano).
CREATE OR REPLACE FUNCTION reabrir_change_order(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_co RECORD;
  v_presupuesto_id UUID;
  v_directo_actual DECIMAL(15,2);
  v_directo_co DECIMAL(15,2);
  v_previo DECIMAL(15,2);
  v_factor DECIMAL(15,6);
  v_act_ids UUID[];
BEGIN
  IF get_rol_usuario() NOT IN ('project_manager', 'dueno', 'superadmin', 'administrador') THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  SELECT * INTO v_co FROM change_orders
  WHERE id = p_id
    AND proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id())
    AND estado = 'aprobado'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_order_no_reabrible';
  END IF;

  IF EXISTS (SELECT 1 FROM facturas_cliente WHERE change_order_id = p_id) THEN
    RAISE EXCEPTION 'co_con_facturas';
  END IF;

  SELECT COALESCE(array_agg(actividad_id), '{}') INTO v_act_ids
  FROM change_order_actividades_creadas WHERE change_order_id = p_id;

  IF EXISTS (
    SELECT 1 FROM actividades
    WHERE id = ANY(v_act_ids) AND (COALESCE(avance_porcentaje, 0) > 0 OR estado <> 'no_iniciada')
  ) THEN
    RAISE EXCEPTION 'co_con_avance';
  END IF;

  SELECT id INTO v_presupuesto_id FROM presupuestos
  WHERE proyecto_id = v_co.proyecto_id AND es_baseline_actual = true LIMIT 1;

  -- Revertir prorrateo de indirectos (se aplicó como * (1 + factor)).
  IF v_presupuesto_id IS NOT NULL AND COALESCE(v_co.indirectos_incrementados, 0) > 0 THEN
    SELECT COALESCE(SUM(monto_presupuestado), 0) INTO v_directo_actual
    FROM partidas_presupuesto
    WHERE presupuesto_id = v_presupuesto_id AND tipo_recurso <> 'indirecto';

    SELECT COALESCE(SUM(pp.monto_presupuestado), 0) INTO v_directo_co
    FROM partidas_presupuesto pp
    WHERE pp.id IN (
      SELECT partida_material_id FROM change_order_actividades_creadas WHERE change_order_id = p_id
      UNION
      SELECT partida_mano_obra_id FROM change_order_actividades_creadas WHERE change_order_id = p_id
    );

    v_previo := v_directo_actual - v_directo_co;
    IF v_previo > 0 THEN
      v_factor := v_co.costo_directo / v_previo;
      UPDATE partidas_presupuesto
      SET monto_presupuestado = monto_presupuestado / (1 + v_factor),
          monto_total = monto_total / (1 + v_factor)
      WHERE presupuesto_id = v_presupuesto_id
        AND tipo_recurso = 'indirecto' AND actividad_id IS NULL;
    END IF;
  END IF;

  DELETE FROM avance_snapshots_actividad_semanales WHERE actividad_id = ANY(v_act_ids);
  DELETE FROM partidas_presupuesto WHERE actividad_id = ANY(v_act_ids);
  DELETE FROM change_order_actividades_creadas WHERE change_order_id = p_id;
  DELETE FROM actividades WHERE id = ANY(v_act_ids);

  UPDATE change_orders
  SET estado = 'en_estimacion', aprobado_at = NULL, decidido_at = NULL,
      enviado_at = NULL, motivo_rechazo = NULL, indirectos_incrementados = 0,
      facturado = false
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'estado', 'en_estimacion');
END;
$$;
REVOKE ALL ON FUNCTION reabrir_change_order(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reabrir_change_order(UUID) TO authenticated;
