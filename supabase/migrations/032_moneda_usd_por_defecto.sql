-- ============================================================
-- 032 — Moneda por defecto: USD en vez de MXN
-- ============================================================
-- El correo automático de estimaciones (migración 022) tenía "MXN"
-- escrito directo en el HTML. También las tablas trabajadores y
-- costos_reales tenían 'MXN' como default de su columna moneda, y
-- la tarifa diaria de personal se mostraba con "MXN/día" en la UI.
-- Se cambia todo a USD.
-- ============================================================

-- 1. Defaults de las columnas moneda hacia adelante
ALTER TABLE trabajadores ALTER COLUMN moneda SET DEFAULT 'USD';
ALTER TABLE costos_reales ALTER COLUMN moneda SET DEFAULT 'USD';

-- 2. Datos ya existentes que quedaron en MXN (de la carga inicial de ejemplo)
UPDATE trabajadores SET moneda = 'USD' WHERE moneda = 'MXN';
UPDATE costos_reales SET moneda = 'USD' WHERE moneda = 'MXN';

-- 3. Correo automático de estimaciones: mismo cuerpo de la migración 022,
--    solo cambiando el texto "MXN" por "USD" en los dos montos.
CREATE OR REPLACE FUNCTION enviar_email_estimacion()
RETURNS TRIGGER AS $$
DECLARE
  v_proyecto RECORD;
  v_api_key TEXT;
  v_from TEXT := 'Vertikall Haus <facturacion@vertikallhaus.net>';
  v_html TEXT;
  v_asunto TEXT;
BEGIN
  -- Solo estimaciones generadas por el motor automático
  IF NEW.numero IS NULL OR NEW.numero NOT LIKE 'EST-%' THEN
    RETURN NEW;
  END IF;

  SELECT nombre, codigo, cliente, cliente_email
  INTO v_proyecto
  FROM proyectos
  WHERE id = NEW.proyecto_id;

  IF v_proyecto.cliente_email IS NULL OR v_proyecto.cliente_email = '' THEN
    -- Sin correo de contacto registrado para este proyecto, no hay a quién enviar.
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
    -- Envío automático aún no configurado (falta la API key en el Vault).
    RETURN NEW;
  END IF;

  v_asunto := 'Nueva estimación de avance — ' || v_proyecto.nombre || ' (' || NEW.numero || ')';

  v_html :=
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
    '<h2 style="color:#0f172a">Nueva estimación de avance</h2>' ||
    '<p>Estimado(a) ' || COALESCE(v_proyecto.cliente, 'cliente') || ',</p>' ||
    '<p>Se ha generado una nueva estimación de avance para el proyecto <strong>' || v_proyecto.nombre || '</strong> (' || v_proyecto.codigo || ').</p>' ||
    '<table style="width:100%;border-collapse:collapse;margin:16px 0">' ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Número</td><td style="padding:8px">' || NEW.numero || '</td></tr>' ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Descripción</td><td style="padding:8px">' || COALESCE(NEW.descripcion, '') || '</td></tr>' ||
    '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Monto</td><td style="padding:8px;font-size:18px;font-weight:bold">$' || to_char(NEW.monto, 'FM999,999,999.00') || ' USD</td></tr>' ||
    CASE WHEN NEW.amortizacion_anticipo > 0 THEN
      '<tr><td style="padding:8px;background:#f8fafc;font-weight:bold">Amortización de anticipo aplicada</td><td style="padding:8px">$' || to_char(NEW.amortizacion_anticipo, 'FM999,999,999.00') || ' USD</td></tr>'
    ELSE '' END ||
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
    -- Nunca dejar que un fallo de envío de correo bloquee la creación de la factura.
    RAISE NOTICE 'No se pudo enviar el correo de la estimación %: %', NEW.numero, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
