-- ============================================================
-- 129 — Correo al cliente: Change Orders + fix facturas manuales
-- ============================================================
-- El dueño pidió: "tanto las facturas como los Ch.O cuando se les da
-- enviar deben ir al portal y al correo del cliente". Dos huecos:
--
-- 1) enviar_email_estimacion() (migraciones 022/099) solo mandaba
--    correo cuando NEW.numero empezaba con 'EST-' -- eso cubre las
--    estimaciones automáticas semanales, pero una factura creada a
--    mano desde el dashboard (crearFacturaCliente, con cualquier
--    número) se insertaba directo en estado 'enviada' y NUNCA
--    disparaba el correo. Se quita esa restricción: ahora cualquier
--    factura que llegue a 'enviada' manda correo (si hay cliente_email
--    y la api key de Resend está en el Vault, igual que antes).
--
-- 2) Change Orders no tenía ningún mecanismo de correo -- se agrega el
--    mismo patrón (trigger + pg_net + Resend) para cuando un CO pasa a
--    'enviado_cliente'. El contenido del correo usa título/descripción
--    tal cual estén en la base (normalmente en español, sea cual sea
--    el idioma del cliente) porque la traducción al inglés es
--    perezosa -- se genera la primera vez que el portal se abre en
--    inglés (migración 128) y todavía no existe en el momento de
--    enviar; el asunto y las etiquetas del correo sí van en el idioma
--    del cliente.
-- ============================================================

-- ── 1) Facturas: quitar el filtro por prefijo 'EST-' ──────────────
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
    v_asunto := 'New progress estimate — ' || v_proyecto.nombre || CASE WHEN NEW.numero IS NOT NULL THEN ' (' || NEW.numero || ')' ELSE '' END;
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
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Number</td><td style="padding:8px">' || COALESCE(NEW.numero, '—') || '</td></tr>' ||
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
      '<p><a href="https://vertikall-haus.vercel.app/portal-cliente/facturas" style="display:inline-block;background:#3B72D8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">View in portal</a></p>' ||
      '<p style="color:#64748b;font-size:13px">This email was generated automatically by Vertikall Haus''s project management system.</p>' ||
      '</div>';
  ELSE
    v_asunto := 'Nueva estimación de avance — ' || v_proyecto.nombre || CASE WHEN NEW.numero IS NOT NULL THEN ' (' || NEW.numero || ')' ELSE '' END;
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
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Número</td><td style="padding:8px">' || COALESCE(NEW.numero, '—') || '</td></tr>' ||
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
      '<p><a href="https://vertikall-haus.vercel.app/portal-cliente/facturas" style="display:inline-block;background:#3B72D8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ver en el portal</a></p>' ||
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
    RAISE NOTICE 'No se pudo enviar el correo de la factura %: %', COALESCE(NEW.numero, NEW.id::text), SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- (el trigger ya existe desde la migración 022/099, solo se reemplaza
-- la función -- no hace falta tocar el CREATE TRIGGER)

-- ── 2) Change Orders: correo al pasar a 'enviado_cliente' ─────────
CREATE OR REPLACE FUNCTION enviar_email_change_order()
RETURNS TRIGGER AS $$
DECLARE
  v_proyecto RECORD;
  v_api_key TEXT;
  v_from TEXT := 'Vertikall Haus <facturacion@vertikallhaus.net>';
  v_html TEXT;
  v_asunto TEXT;
  v_en BOOLEAN;
BEGIN
  IF NEW.estado <> 'enviado_cliente' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (OLD.estado = 'en_estimacion' AND NEW.estado = 'enviado_cliente') THEN
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

  IF v_en THEN
    v_asunto := 'New change order for your review — ' || v_proyecto.nombre || CASE WHEN NEW.numero IS NOT NULL THEN ' (' || NEW.numero || ')' ELSE '' END;
    v_html :=
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
      '<h2 style="color:#0f172a">New change order for your review</h2>' ||
      '<p>Dear ' || COALESCE(v_proyecto.cliente, 'client') || ',</p>' ||
      '<p>A change order has been sent to you for approval on project <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ').</p>' ||
      '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Number</td><td style="padding:8px">' || COALESCE(NEW.numero, '—') || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Title</td><td style="padding:8px">' || COALESCE(NEW.titulo, '') || '</td></tr>' ||
      CASE WHEN NEW.descripcion IS NOT NULL THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Description</td><td style="padding:8px">' || NEW.descripcion || '</td></tr>'
      ELSE '' END ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Cost impact</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.impacto_costo, 'FM999,999,999.00') || '</td></tr>' ||
      CASE WHEN COALESCE(NEW.impacto_dias, 0) <> 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Schedule impact</td><td style="padding:8px">+' || NEW.impacto_dias || ' days</td></tr>'
      ELSE '' END ||
      '</table>' ||
      '<p><a href="https://vertikall-haus.vercel.app/portal-cliente/change-orders" style="display:inline-block;background:#3B72D8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Review and respond</a></p>' ||
      '<p style="color:#64748b;font-size:13px">This email was generated automatically by Vertikall Haus''s project management system.</p>' ||
      '</div>';
  ELSE
    v_asunto := 'Nuevo change order para tu revisión — ' || v_proyecto.nombre || CASE WHEN NEW.numero IS NOT NULL THEN ' (' || NEW.numero || ')' ELSE '' END;
    v_html :=
      '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
      '<h2 style="color:#0f172a">Nuevo change order para tu revisión</h2>' ||
      '<p>Estimado(a) ' || COALESCE(v_proyecto.cliente, 'cliente') || ',</p>' ||
      '<p>Se te ha enviado un change order para su aprobación en el proyecto <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ').</p>' ||
      '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Número</td><td style="padding:8px">' || COALESCE(NEW.numero, '—') || '</td></tr>' ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Título</td><td style="padding:8px">' || COALESCE(NEW.titulo, '') || '</td></tr>' ||
      CASE WHEN NEW.descripcion IS NOT NULL THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Descripción</td><td style="padding:8px">' || NEW.descripcion || '</td></tr>'
      ELSE '' END ||
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Impacto en costo</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.impacto_costo, 'FM999,999,999.00') || '</td></tr>' ||
      CASE WHEN COALESCE(NEW.impacto_dias, 0) <> 0 THEN
        '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Impacto en días</td><td style="padding:8px">+' || NEW.impacto_dias || ' días</td></tr>'
      ELSE '' END ||
      '</table>' ||
      '<p><a href="https://vertikall-haus.vercel.app/portal-cliente/change-orders" style="display:inline-block;background:#3B72D8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Revisar y responder</a></p>' ||
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
    RAISE NOTICE 'No se pudo enviar el correo del change order %: %', COALESCE(NEW.numero, NEW.id::text), SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enviar_email_change_order ON change_orders;
CREATE TRIGGER trg_enviar_email_change_order
  AFTER INSERT OR UPDATE OF estado ON change_orders
  FOR EACH ROW
  EXECUTE FUNCTION enviar_email_change_order();
