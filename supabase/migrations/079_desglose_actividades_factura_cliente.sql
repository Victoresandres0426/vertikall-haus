-- ============================================================
-- 079 — Desglose por actividad en las estimaciones automáticas
-- ============================================================
-- El desglose_periodos de la 078 explica CUÁNDO se ganó cada parte
-- del monto (qué semana), pero no QUÉ actividad la generó -- solo
-- existía el avance % global ponderado por presupuesto. Esta
-- migración agrega ese segundo desglose: para cada estimación,
-- calcula qué actividades avanzaron desde el inicio del período y
-- cuánto vale ese avance de cada una.
--
-- Para eso hace falta saber en qué % estaba cada actividad al
-- arrancar el período (no solo el avance ponderado global) -- por
-- eso se agrega avance_snapshots_actividad_semanales, gemela de
-- avance_snapshots_semanales pero por actividad, y se llena en el
-- mismo momento (cada corrida del motor, genere factura o no).
--
-- El "monto_bruto" de cada actividad en el desglose es informativo:
-- se calcula como (avance % ganado en el período) × (costo_presupuesto
-- de la actividad). La suma de todas las actividades debería
-- aproximarse al monto bruto total de la estimación (monto +
-- amortizacion_anticipo), salvo redondeo -- igual que ya pasa con
-- desglose_periodos.
-- ============================================================

ALTER TABLE facturas_cliente ADD COLUMN IF NOT EXISTS desglose_actividades JSONB;

CREATE TABLE IF NOT EXISTS avance_snapshots_actividad_semanales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  actividad_id UUID NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  avance_porcentaje DECIMAL(5,2) NOT NULL,
  costo_presupuesto DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(actividad_id, fecha)
);

ALTER TABLE avance_snapshots_actividad_semanales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_dueno_ven_avance_snapshots_actividad" ON avance_snapshots_actividad_semanales;
CREATE POLICY "admin_dueno_ven_avance_snapshots_actividad" ON avance_snapshots_actividad_semanales
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

CREATE OR REPLACE FUNCTION generar_facturas_semanales(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(
  proyecto_id UUID,
  proyecto_codigo TEXT,
  numero_generado TEXT,
  monto_generado DECIMAL,
  amortizacion_generada DECIMAL
) AS $$
DECLARE
  v_empresa_id UUID;
  v_rol rol_usuario;
  v_proyecto RECORD;
  v_presupuesto_total DECIMAL(15,2);
  v_avance_ponderado DECIMAL(7,4);
  v_monto_facturado DECIMAL(15,2);
  v_pct_facturado DECIMAL(7,4);
  v_delta_pct DECIMAL(7,4);
  v_monto_bruto DECIMAL(15,2);
  v_anticipo_total DECIMAL(15,2);
  v_pct_anticipo DECIMAL(7,4);
  v_anticipo_amortizado DECIMAL(15,2);
  v_anticipo_pendiente DECIMAL(15,2);
  v_amortizacion DECIMAL(15,2);
  v_monto_neto DECIMAL(15,2);
  v_siguiente_seq INTEGER;
  v_numero TEXT;
  v_periodo_inicio DATE;
  v_desglose JSONB;
  v_avance_previo DECIMAL(7,4);
  v_fecha_desde DATE;
  v_snap RECORD;
  v_act RECORD;
  v_baseline_act DECIMAL(5,2);
  v_delta_act DECIMAL(7,2);
  v_desglose_act JSONB;
BEGIN
  v_empresa_id := COALESCE(p_empresa_id, get_empresa_id());
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF p_empresa_id IS NULL THEN
    v_rol := get_rol_usuario();
    IF v_rol IS NULL OR v_rol NOT IN ('project_manager', 'administrador', 'dueno', 'superadmin') THEN
      RAISE EXCEPTION 'No tienes permisos para generar facturación automática';
    END IF;
  END IF;

  FOR v_proyecto IN
    SELECT p.id, p.codigo
    FROM proyectos p
    WHERE p.empresa_id = v_empresa_id AND p.activo = true
  LOOP
    SELECT total INTO v_presupuesto_total
    FROM presupuestos
    WHERE proyecto_id = v_proyecto.id AND es_baseline_actual = true
    LIMIT 1;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      SELECT COALESCE(SUM(costo_presupuesto), 0) INTO v_presupuesto_total
      FROM actividades
      WHERE proyecto_id = v_proyecto.id AND activa = true;
    END IF;

    IF v_presupuesto_total IS NULL OR v_presupuesto_total <= 0 THEN
      CONTINUE;
    END IF;

    SELECT
      CASE
        WHEN SUM(costo_presupuesto) > 0
          THEN SUM(avance_porcentaje * costo_presupuesto) / SUM(costo_presupuesto)
        WHEN COUNT(*) > 0
          THEN AVG(avance_porcentaje)
        ELSE 0
      END
    INTO v_avance_ponderado
    FROM actividades
    WHERE proyecto_id = v_proyecto.id AND activa = true;

    v_avance_ponderado := COALESCE(v_avance_ponderado, 0);

    INSERT INTO avance_snapshots_semanales (proyecto_id, fecha, avance_ponderado_pct, presupuesto_total)
    VALUES (v_proyecto.id, CURRENT_DATE, v_avance_ponderado, v_presupuesto_total)
    ON CONFLICT (proyecto_id, fecha) DO UPDATE
      SET avance_ponderado_pct = EXCLUDED.avance_ponderado_pct,
          presupuesto_total = EXCLUDED.presupuesto_total;

    -- Snapshot por actividad (mismo momento, misma razón: aunque esta
    -- corrida no termine generando una factura, queda el punto en la
    -- línea de tiempo de cada actividad para poder desglosar después).
    FOR v_act IN
      SELECT id, avance_porcentaje, costo_presupuesto
      FROM actividades
      WHERE proyecto_id = v_proyecto.id AND activa = true
    LOOP
      INSERT INTO avance_snapshots_actividad_semanales (proyecto_id, actividad_id, fecha, avance_porcentaje, costo_presupuesto)
      VALUES (v_proyecto.id, v_act.id, CURRENT_DATE, COALESCE(v_act.avance_porcentaje, 0), v_act.costo_presupuesto)
      ON CONFLICT (actividad_id, fecha) DO UPDATE
        SET avance_porcentaje = EXCLUDED.avance_porcentaje,
            costo_presupuesto = EXCLUDED.costo_presupuesto;
    END LOOP;

    SELECT COALESCE(SUM(monto + amortizacion_anticipo), 0) INTO v_monto_facturado
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id
      AND numero LIKE 'EST-%'
      AND change_order_id IS NULL;

    v_pct_facturado := (v_monto_facturado / v_presupuesto_total) * 100;
    v_delta_pct := v_avance_ponderado - v_pct_facturado;

    IF v_delta_pct < 1 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente
      WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%' AND estado = 'borrador'
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM facturas_cliente
      WHERE proyecto_id = v_proyecto.id
        AND numero LIKE 'EST-%'
        AND estado <> 'borrador'
        AND fecha_emision >= CURRENT_DATE - INTERVAL '6 days'
    ) THEN
      CONTINUE;
    END IF;

    v_monto_bruto := ROUND(v_presupuesto_total * v_delta_pct / 100, 2);
    IF v_monto_bruto <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(monto), 0) INTO v_anticipo_total
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'ANT-%';

    v_pct_anticipo := CASE WHEN v_presupuesto_total > 0
      THEN LEAST(v_anticipo_total / v_presupuesto_total, 1)
      ELSE 0
    END;

    SELECT COALESCE(SUM(amortizacion_anticipo), 0) INTO v_anticipo_amortizado
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%';

    v_anticipo_pendiente := GREATEST(v_anticipo_total - v_anticipo_amortizado, 0);

    v_amortizacion := LEAST(ROUND(v_monto_bruto * v_pct_anticipo, 2), v_anticipo_pendiente);
    v_monto_neto := v_monto_bruto - v_amortizacion;

    SELECT periodo_fin + 1 INTO v_periodo_inicio
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%' AND periodo_fin IS NOT NULL
    ORDER BY periodo_fin DESC
    LIMIT 1;

    IF v_periodo_inicio IS NULL THEN
      SELECT COALESCE(fecha_inicio_real, fecha_inicio_plan) INTO v_periodo_inicio
      FROM proyectos WHERE id = v_proyecto.id;
    END IF;

    v_desglose := '[]'::jsonb;
    v_avance_previo := v_pct_facturado;
    v_fecha_desde := v_periodo_inicio;

    FOR v_snap IN
      SELECT fecha, avance_ponderado_pct
      FROM avance_snapshots_semanales
      WHERE proyecto_id = v_proyecto.id AND fecha >= v_periodo_inicio
      ORDER BY fecha
    LOOP
      v_desglose := v_desglose || jsonb_build_object(
        'periodo_inicio', v_fecha_desde,
        'periodo_fin', v_snap.fecha,
        'avance_pct', ROUND(v_snap.avance_ponderado_pct - v_avance_previo, 2),
        'monto_bruto', ROUND(v_presupuesto_total * (v_snap.avance_ponderado_pct - v_avance_previo) / 100, 2)
      );
      v_avance_previo := v_snap.avance_ponderado_pct;
      v_fecha_desde := v_snap.fecha + 1;
    END LOOP;

    -- Desglose por actividad: para cada actividad activa, compara su
    -- avance % de hoy contra el que tenía en el snapshot más reciente
    -- ANTERIOR al inicio del período (o 0 si no hay ninguno, es decir
    -- si la actividad no existía o no se había medido todavía). Solo
    -- se incluyen las que de verdad avanzaron algo en el período.
    v_desglose_act := '[]'::jsonb;

    FOR v_act IN
      SELECT a.id, a.codigo, a.nombre, COALESCE(a.avance_porcentaje, 0) AS avance_porcentaje, COALESCE(a.costo_presupuesto, 0) AS costo_presupuesto
      FROM actividades a
      WHERE a.proyecto_id = v_proyecto.id AND a.activa = true
      ORDER BY a.codigo
    LOOP
      SELECT avance_porcentaje INTO v_baseline_act
      FROM avance_snapshots_actividad_semanales
      WHERE actividad_id = v_act.id AND fecha < v_periodo_inicio
      ORDER BY fecha DESC
      LIMIT 1;

      v_baseline_act := COALESCE(v_baseline_act, 0);
      v_delta_act := ROUND(v_act.avance_porcentaje - v_baseline_act, 2);

      IF v_delta_act <> 0 THEN
        v_desglose_act := v_desglose_act || jsonb_build_object(
          'actividad_id', v_act.id,
          'actividad_codigo', v_act.codigo,
          'actividad_nombre', v_act.nombre,
          'avance_pct', v_delta_act,
          'monto_bruto', ROUND(v_act.costo_presupuesto * v_delta_act / 100, 2)
        );
      END IF;
    END LOOP;

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion, amortizacion_anticipo,
      periodo_inicio, periodo_fin, desglose_periodos, desglose_actividades,
      fecha_emision, fecha_vencimiento, estado, monto_cobrado
    ) VALUES (
      v_proyecto.id,
      v_numero,
      'Estimación de avance automática — ' || ROUND(v_delta_pct, 1) || '% de avance adicional (acumulado ' || ROUND(v_avance_ponderado, 1) || '%)'
        || CASE WHEN v_amortizacion > 0
             THEN ' · incluye $' || v_amortizacion || ' de amortización de anticipo'
             ELSE ''
           END,
      v_monto_neto,
      0,
      v_amortizacion,
      v_periodo_inicio,
      CURRENT_DATE,
      v_desglose,
      v_desglose_act,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '15 days',
      'borrador',
      0
    );

    proyecto_id := v_proyecto.id;
    proyecto_codigo := v_proyecto.codigo;
    numero_generado := v_numero;
    monto_generado := v_monto_neto;
    amortizacion_generada := v_amortizacion;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_facturas_semanales(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_facturas_semanales(UUID) TO authenticated;

-- ------------------------------------------------------------
-- cliente_ver_facturas(): agrega el desglose por actividad.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION cliente_ver_facturas()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_proyecto_id UUID;
  v_result JSONB;
BEGIN
  IF get_rol_usuario() <> 'cliente' THEN
    RAISE EXCEPTION 'acceso_denegado';
  END IF;

  v_proyecto_id := get_proyecto_cliente();
  IF v_proyecto_id IS NULL THEN
    RAISE EXCEPTION 'sin_proyecto_asignado';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'numero', f.numero,
      'descripcion', f.descripcion,
      'hito_asociado', f.hito_asociado,
      'monto', f.monto,
      'retencion', f.retencion,
      'amortizacion_anticipo', f.amortizacion_anticipo,
      'periodo_inicio', f.periodo_inicio,
      'periodo_fin', f.periodo_fin,
      'desglose_periodos', f.desglose_periodos,
      'desglose_actividades', f.desglose_actividades,
      'fecha_emision', f.fecha_emision,
      'fecha_vencimiento', f.fecha_vencimiento,
      'estado', f.estado,
      'monto_cobrado', f.monto_cobrado
    ) ORDER BY f.fecha_emision DESC NULLS LAST
  ), '[]'::jsonb) INTO v_result
  FROM facturas_cliente f
  WHERE f.proyecto_id = v_proyecto_id
    AND f.estado <> 'borrador';

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- Email: agrega la tabla de desglose por actividad, debajo de la de
-- períodos (si la hay).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION enviar_email_estimacion()
RETURNS TRIGGER AS $$
DECLARE
  v_proyecto RECORD;
  v_api_key TEXT;
  v_from TEXT := 'Vertikall Haus <facturacion@vertikallhaus.net>';
  v_html TEXT;
  v_asunto TEXT;
  v_bruto DECIMAL(15,2);
  v_desglose_html TEXT := '';
  v_desglose_act_html TEXT := '';
  v_item JSONB;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero NOT LIKE 'EST-%' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado <> 'enviada' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (OLD.estado = 'borrador' AND NEW.estado = 'enviada') THEN
    RETURN NEW;
  END IF;

  SELECT nombre, codigo, cliente, cliente_email
  INTO v_proyecto
  FROM proyectos
  WHERE id = NEW.proyecto_id;

  IF v_proyecto.cliente_email IS NULL OR v_proyecto.cliente_email = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_api_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_api_key := NULL;
  END;

  IF v_api_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_bruto := NEW.monto + COALESCE(NEW.amortizacion_anticipo, 0);
  v_asunto := 'Nueva estimación de avance — ' || v_proyecto.nombre || ' (' || NEW.numero || ')';

  IF NEW.desglose_periodos IS NOT NULL THEN
    IF jsonb_array_length(NEW.desglose_periodos) > 1 THEN
      v_desglose_html := '<p style="font-weight:bold;margin:16px 0 4px">Esta estimación cubre más de un período:</p><table style="width:100%;border-collapse:collapse;margin-bottom:12px">';
      FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.desglose_periodos)
      LOOP
        v_desglose_html := v_desglose_html ||
          '<tr><td style="padding:4px 8px;font-size:13px;color:#475569">' || (v_item->>'periodo_inicio') || ' – ' || (v_item->>'periodo_fin') || '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569">' || (v_item->>'avance_pct') || '% avance</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569;text-align:right">$' || to_char((v_item->>'monto_bruto')::numeric, 'FM999,999,999.00') || '</td></tr>';
      END LOOP;
      v_desglose_html := v_desglose_html || '</table>';
    END IF;
  END IF;

  IF NEW.desglose_actividades IS NOT NULL THEN
    IF jsonb_array_length(NEW.desglose_actividades) > 0 THEN
      v_desglose_act_html := '<p style="font-weight:bold;margin:16px 0 4px">Detalle por actividad:</p><table style="width:100%;border-collapse:collapse;margin-bottom:12px">';
      FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.desglose_actividades)
      LOOP
        v_desglose_act_html := v_desglose_act_html ||
          '<tr><td style="padding:4px 8px;font-size:13px;color:#475569">' || (v_item->>'actividad_codigo') || ' — ' || (v_item->>'actividad_nombre') || '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569">' || (v_item->>'avance_pct') || '% avance</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569;text-align:right">$' || to_char((v_item->>'monto_bruto')::numeric, 'FM999,999,999.00') || '</td></tr>';
      END LOOP;
      v_desglose_act_html := v_desglose_act_html || '</table>';
    END IF;
  END IF;

  v_html :=
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
    '<h2 style="color:#0f172a">Nueva estimación de avance</h2>' ||
    '<p>Estimado(a) ' || COALESCE(v_proyecto.cliente, 'cliente') || ',</p>' ||
    '<p>Se ha generado una nueva estimación de avance para el proyecto <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ')' ||
    CASE WHEN NEW.periodo_inicio IS NOT NULL AND NEW.periodo_fin IS NOT NULL
      THEN ', correspondiente al período del ' || NEW.periodo_inicio || ' al ' || NEW.periodo_fin
      ELSE '' END || '.</p>' ||
    v_desglose_html ||
    v_desglose_act_html ||
    '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Número</td><td style="padding:8px">' || NEW.numero || '</td></tr>' ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Avance reconocido este período</td><td style="padding:8px">$' || to_char(v_bruto, 'FM999,999,999.00') || '</td></tr>' ||
    CASE WHEN NEW.amortizacion_anticipo > 0 THEN
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Amortización de anticipo aplicada</td><td style="padding:8px">−$' || to_char(NEW.amortizacion_anticipo, 'FM999,999,999.00') || '</td></tr>'
    ELSE '' END ||
    CASE WHEN NEW.retencion > 0 THEN
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Retención</td><td style="padding:8px">−$' || to_char(NEW.retencion, 'FM999,999,999.00') || '</td></tr>'
    ELSE '' END ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Total a pagar</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.monto, 'FM999,999,999.00') || '</td></tr>' ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Fecha de vencimiento</td><td style="padding:8px">' || COALESCE(NEW.fecha_vencimiento::TEXT, '') || '</td></tr>' ||
    '</table>' ||
    '<p style="color:#64748b;font-size:13px">Este correo fue generado automáticamente por el sistema de gestión de proyectos de Vertikall Haus.</p>' ||
    '</div>';

  BEGIN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', v_from,
        'to', jsonb_build_array(v_proyecto.cliente_email),
        'subject', v_asunto,
        'html', v_html
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo enviar el correo de la estimación %: %', NEW.numero, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
