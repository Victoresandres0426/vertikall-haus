-- ============================================================
-- 134 — Facturación automática de Change Orders al reportar avance
-- ============================================================
-- Antes: había que entrar a Change Orders y darle clic a "Facturar
-- avance" cada vez. El usuario pidió que, como las actividades ya
-- quedan identificadas como pertenecientes a un CO desde que se crean
-- (migración 132), se facturen solas en cuanto se les reporte avance
-- -- sin ningún clic.
--
-- Se mueve la misma lógica que tenía la acción de servidor
-- facturarChangeOrder() a un trigger de base de datos: cualquier UPDATE
-- que cambie actividades.avance_porcentaje (venga de Reporte Diario,
-- de editar el historial, del botón "Recalcular", de donde sea) revisa
-- si esa actividad pertenece a un Change Order y, si hay avance nuevo
-- sin facturar, genera automáticamente la factura correspondiente
-- (ligada a ese CO, sin ninguna amortización de anticipo -- el CO no
-- tiene anticipo detrás).
-- ============================================================

CREATE OR REPLACE FUNCTION facturar_avance_co(p_change_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_co RECORD;
  v_avance_directo DECIMAL(15,2);
  v_ya_facturado DECIMAL(15,2);
  v_delta DECIMAL(15,2);
  v_siguiente INTEGER;
  v_numero TEXT;
BEGIN
  SELECT id, proyecto_id, numero, titulo, estado INTO v_co
  FROM change_orders WHERE id = p_change_order_id;

  IF v_co.id IS NULL OR v_co.estado NOT IN ('aprobado', 'facturado', 'cobrado') THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM((COALESCE(act.costo_material, 0) + COALESCE(act.costo_mano_obra, 0)) * COALESCE(act.avance_porcentaje, 0) / 100), 0)
  INTO v_avance_directo
  FROM change_order_actividades_creadas caco
  JOIN actividades act ON act.id = caco.actividad_id
  WHERE caco.change_order_id = p_change_order_id;

  SELECT COALESCE(SUM(monto), 0) INTO v_ya_facturado
  FROM facturas_cliente WHERE change_order_id = p_change_order_id;

  v_delta := ROUND(v_avance_directo - v_ya_facturado, 2);
  IF v_delta <= 0.01 THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_siguiente FROM facturas_cliente WHERE change_order_id = p_change_order_id;
  v_numero := COALESCE(v_co.numero, 'CO') || '-F' || (v_siguiente + 1);

  INSERT INTO facturas_cliente (
    proyecto_id, numero, descripcion, monto, retencion, change_order_id,
    fecha_emision, fecha_vencimiento, estado, monto_cobrado
  ) VALUES (
    v_co.proyecto_id, v_numero,
    'Factura Change Order ' || COALESCE(v_co.numero, '') || ' — ' || v_co.titulo || ' (avance acumulado, sin anticipo)',
    v_delta, 0, p_change_order_id,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '15 days', 'enviada', 0
  );

  UPDATE change_orders SET facturado = true WHERE id = p_change_order_id;
END;
$$;
REVOKE ALL ON FUNCTION facturar_avance_co(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION trg_facturar_avance_co_actividad()
RETURNS TRIGGER AS $$
DECLARE
  v_co_id UUID;
BEGIN
  SELECT change_order_id INTO v_co_id
  FROM change_order_actividades_creadas
  WHERE actividad_id = NEW.id
  LIMIT 1;

  IF v_co_id IS NOT NULL THEN
    PERFORM facturar_avance_co(v_co_id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca debe bloquear el guardado del reporte diario / avance por un
  -- problema de facturación -- se registra y se sigue.
  RAISE NOTICE 'trg_facturar_avance_co_actividad falló para actividad %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_facturar_avance_co ON actividades;
CREATE TRIGGER trg_facturar_avance_co
AFTER UPDATE OF avance_porcentaje ON actividades
FOR EACH ROW
WHEN (NEW.avance_porcentaje IS DISTINCT FROM OLD.avance_porcentaje)
EXECUTE FUNCTION trg_facturar_avance_co_actividad();
