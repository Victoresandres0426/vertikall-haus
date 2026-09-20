-- ============================================================
-- 099 — Separar "Aprobar" de "Enviar" en las estimaciones al cliente
-- ============================================================
-- Antes, un solo botón "Aprobar y enviar" pasaba una estimación de
-- 'borrador' directo a 'enviada' -- eso la hacía visible en el
-- portal del cliente Y disparaba el correo automático, todo en un
-- solo paso, sin poder aprobarla internamente sin que el cliente ya
-- la viera.
--
-- Se agrega el estado intermedio 'aprobada' (no requiere ALTER de
-- columna: "estado" en facturas_cliente es TEXT libre, sin CHECK):
--   borrador --[Aprobar]--> aprobada --[Enviar]--> enviada
--
-- 'aprobada' es una estimación ya revisada y aceptada internamente,
-- pero el cliente TODAVÍA NO la ve en su portal ni recibe correo --
-- eso solo pasa al darle "Enviar". Esto responde a una decisión
-- explícita: aprobar no implica visibilidad, envío sí.
-- ============================================================

-- 1) cliente_ver_facturas(): ahora también oculta 'aprobada' además
--    de 'borrador' -- antes solo excluía 'borrador'.
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
      'avance_delta_pct', f.avance_delta_pct,
      'avance_acumulado_pct', f.avance_acumulado_pct,
      'fecha_emision', f.fecha_emision,
      'fecha_vencimiento', f.fecha_vencimiento,
      'estado', f.estado,
      'monto_cobrado', f.monto_cobrado
    ) ORDER BY f.fecha_emision DESC NULLS LAST
  ), '[]'::jsonb) INTO v_result
  FROM facturas_cliente f
  WHERE f.proyecto_id = v_proyecto_id
    AND f.estado NOT IN ('borrador', 'aprobada');

  RETURN v_result;
END;
$$;

-- 2) RLS de borrado: se puede descartar tanto un 'borrador' como una
--    estimación ya 'aprobada' pero no enviada (para poder deshacer
--    una aprobación por error antes de que el cliente la vea).
DROP POLICY IF EXISTS "admin_dueno_borran_borradores_factura_cliente" ON facturas_cliente;
CREATE POLICY "admin_dueno_borran_borradores_factura_cliente" ON facturas_cliente
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin') AND
    estado IN ('borrador', 'aprobada')
  );

-- 3) enviar_email_estimacion(): el correo ahora se dispara al pasar a
--    'enviada' desde 'borrador' O desde 'aprobada' (antes solo
--    reconocía la transición directa borrador -> enviada).
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
  v_item JSONB;
  v_sub_item JSONB;
  v_en BOOLEAN;
  v_rango_avance TEXT;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero NOT LIKE 'EST-%' THEN
    RETURN NEW;
  END IF;

  IF NEW.estado <> 'enviada' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (OLD.estado IN ('borrador', 'aprobada') AND NEW.estado = 'enviada') THEN
    RETURN NEW;
  END IF;

  SELECT nombre, codigo, cliente, cliente_email, idioma_cliente
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

  v_en := COALESCE(v_proyecto.idioma_cliente, 'es') = 'en';
  v_bruto := NEW.monto + COALESCE(NEW.amortizacion_anticipo, 0);

  IF NEW.desglose_actividades IS NOT NULL AND jsonb_array_length(NEW.desglose_actividades) > 0 THEN
    v_desglose_html := '<table style="width:100%;border-collapse:collapse;margin:12px 0">' ||
      '<tr style="background:#f1f5f9;color:#475569;font-size:12px">' ||
      '<td style="padding:4px 8px;text-align:left">' || (CASE WHEN v_en THEN 'Item' ELSE 'Renglón' END) || '</td>' ||
      '<td style="padding:4px 8px;text-align:right">' || (CASE WHEN v_en THEN '% progress' ELSE '% avance' END) || '</td>' ||
      '<td style="padding:4px 8px;text-align:right">' || (CASE WHEN v_en THEN 'Amount' ELSE 'Monto' END) || '</td></tr>';

    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.desglose_actividades)
    LOOP
      IF v_item ? 'actividades' THEN
        v_rango_avance := CASE
          WHEN v_item ? 'avance_desde_pct' THEN (v_item->>'avance_desde_pct') || '%-' || (v_item->>'avance_hasta_pct') || '%'
          ELSE (v_item->>'avance_pct') || '%'
        END;

        v_desglose_html := v_desglose_html ||
          '<tr><td style="padding:4px 8px;font-size:13px;font-weight:bold;color:#0f172a">' ||
            (CASE WHEN v_en THEN COALESCE(v_item->>'disciplina_en', v_item->>'disciplina') ELSE v_item->>'disciplina' END) ||
          '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;font-weight:bold;color:#0f172a;text-align:right">' || v_rango_avance || '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;font-weight:bold;color:#0f172a;text-align:right">$' || to_char((v_item->>'monto_bruto')::numeric, 'FM999,999,999.00') || '</td></tr>';

        FOR v_sub_item IN SELECT * FROM jsonb_array_elements(v_item->'actividades')
        LOOP
          v_desglose_html := v_desglose_html ||
            '<tr><td style="padding:2px 8px 2px 20px;font-size:12px;color:#64748b">' ||
              COALESCE(v_sub_item->>'codigo', '') ||
              CASE WHEN v_sub_item->>'codigo' IS NOT NULL THEN ' — ' ELSE '' END ||
              (CASE WHEN v_en THEN COALESCE(v_sub_item->>'nombre_en', v_sub_item->>'nombre') ELSE v_sub_item->>'nombre' END) ||
            '</td>' ||
            '<td style="padding:2px 8px;font-size:12px;color:#64748b;text-align:right">' || (v_sub_item->>'avance_actual_pct') || '%</td>' ||
            '<td></td></tr>';
        END LOOP;
      ELSE
        v_desglose_html := v_desglose_html ||
          '<tr><td style="padding:4px 8px;font-size:13px;color:#475569">' ||
            COALESCE(v_item->>'actividad_codigo', '') ||
            CASE WHEN v_item->>'actividad_codigo' IS NOT NULL THEN ' — ' ELSE '' END ||
            (CASE WHEN v_en THEN COALESCE(v_item->>'actividad_nombre_en', v_item->>'actividad_nombre') ELSE v_item->>'actividad_nombre' END) ||
          '</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569;text-align:right">' || (v_item->>'avance_pct') || '%</td>' ||
          '<td style="padding:4px 8px;font-size:13px;color:#475569;text-align:right">$' || to_char((v_item->>'monto_bruto')::numeric, 'FM999,999,999.00') || '</td></tr>';
      END IF;
    END LOOP;
    v_desglose_html := v_desglose_html || '</table>';
  END IF;

  IF v_en THEN
    v_asunto := 'New progress estimate — ' || v_proyecto.nombre || ' (' || NEW.numero || ')';
    v_html :=
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
      '<h2 style="color:#0f172a">New progress estimate</h2>' ||
      '<p>Dear ' || COALESCE(v_proyecto.cliente, 'client') || ',</p>' ||
      '<p>A new progress estimate has been generated for project <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ')' ||
      CASE WHEN NEW.periodo_inicio IS NOT NULL AND NEW.periodo_fin IS NOT NULL
        THEN ', covering the period from ' || NEW.periodo_inicio || ' to ' || NEW.periodo_fin
        ELSE '' END ||
      CASE WHEN NEW.avance_delta_pct IS NOT NULL
        THEN ' (' || NEW.avance_delta_pct || '% additional progress, ' || COALESCE(NEW.avance_acumulado_pct::TEXT, '') || '% accumulated)'
        ELSE '' END || '.</p>' ||
      v_desglose_html ||
      '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Number</td><td style="padding:8px">' || NEW.numero || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Progress recognized this period</td><td style="padding:8px">$' || to_char(v_bruto, 'FM999,999,999.00') || '</td></tr>' ||
      CASE WHEN NEW.amortizacion_anticipo > 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Deposit amortization applied</td><td style="padding:8px">−$' || to_char(NEW.amortizacion_anticipo, 'FM999,999,999.00') || '</td></tr>'
      ELSE '' END ||
      CASE WHEN NEW.retencion > 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Retention</td><td style="padding:8px">−$' || to_char(NEW.retencion, 'FM999,999,999.00') || '</td></tr>'
      ELSE '' END ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Total due</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.monto, 'FM999,999,999.00') || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Due date</td><td style="padding:8px">' || COALESCE(NEW.fecha_vencimiento::TEXT, '') || '</td></tr>' ||
      '</table>' ||
      '<p style="color:#64748b;font-size:13px">This email was generated automatically by Vertikall Haus''s project management system.</p>' ||
      '</div>';
  ELSE
    v_asunto := 'Nueva estimación de avance — ' || v_proyecto.nombre || ' (' || NEW.numero || ')';
    v_html :=
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
      '<h2 style="color:#0f172a">Nueva estimación de avance</h2>' ||
      '<p>Estimado(a) ' || COALESCE(v_proyecto.cliente, 'cliente') || ',</p>' ||
      '<p>Se ha generado una nueva estimación de avance para el proyecto <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ')' ||
      CASE WHEN NEW.periodo_inicio IS NOT NULL AND NEW.periodo_fin IS NOT NULL
        THEN ', correspondiente al período del ' || NEW.periodo_inicio || ' al ' || NEW.periodo_fin
        ELSE '' END || '.</p>' ||
      v_desglose_html ||
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
  END IF;

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

DROP TRIGGER IF EXISTS trg_enviar_email_estimacion ON facturas_cliente;
CREATE TRIGGER trg_enviar_email_estimacion
  AFTER INSERT OR UPDATE OF estado ON facturas_cliente
  FOR EACH ROW
  EXECUTE FUNCTION enviar_email_estimacion();
