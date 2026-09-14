-- ============================================================
-- 078 — Aprobación de estimaciones automáticas + períodos
-- ============================================================
-- Hasta ahora generar_facturas_semanales() insertaba la estimación
-- directamente con estado 'enviada': el dueño/PM nunca la veía antes
-- de que quedara visible en el portal del cliente (y de que saliera
-- el correo automático si estaba configurado el Vault/Resend). Este
-- cambio hace que toda estimación automática nazca como 'borrador'
-- (ese estado ya existía en el enum y cliente_ver_facturas() ya lo
-- excluía -- estaba pensado para esto desde el principio, solo nunca
-- se usó). El dueño/PM la revisa en /facturas y decide:
--   - Aprobar y enviar -> pasa a 'enviada' (ahí sí dispara el correo
--     y se vuelve visible en el portal del cliente).
--   - Editar el monto o la descripción antes de aprobar.
--   - Descartar -> se borra. Como el monto de esa estimación nunca
--     llegó a contarse como "ya facturado" (solo cuentan las filas
--     que sobreviven), ese avance no se pierde: la siguiente corrida
--     automáticamente lo vuelve a incluir, ya que sigue comparando el
--     avance real acumulado contra lo que de verdad sigue existiendo
--     como factura. Si se editó el monto a la baja en vez de
--     descartarla, pasa lo mismo con la diferencia: al quedar un
--     monto menor "ya facturado", la próxima corrida detecta que
--     falta ese resto y lo vuelve a incluir como parte del avance
--     nuevo de la siguiente semana.
--
-- Para poder explicarle al dueño/PM (y al cliente) qué semana(s)
-- cubre cada estimación -- incluso si una semana se generó, no se
-- aprobó y se descartó, y la siguiente corrida termina cubriendo dos
-- semanas de trabajo -- se agrega:
--   - periodo_inicio / periodo_fin en facturas_cliente.
--   - avance_snapshots_semanales: guarda el avance % ponderado de
--     cada proyecto cada vez que corre el motor (sea que genere
--     factura o no), para poder reconstruir cuánto avance/monto
--     corresponde a cada sub-período dentro de una estimación que
--     termina cubriendo más de una semana.
--   - desglose_periodos (JSONB) en facturas_cliente: el desglose ya
--     calculado al momento de generar la estimación, un renglón por
--     sub-período con su rango de fechas, % de avance y monto bruto
--     (antes de descontar amortización de anticipo). La suma de los
--     montos del desglose debe coincidir con monto + amortizacion_anticipo
--     de la factura (el valor bruto reconocido, antes de la amortización).
-- ============================================================

ALTER TABLE facturas_cliente ADD COLUMN IF NOT EXISTS periodo_inicio DATE;
ALTER TABLE facturas_cliente ADD COLUMN IF NOT EXISTS periodo_fin DATE;
ALTER TABLE facturas_cliente ADD COLUMN IF NOT EXISTS desglose_periodos JSONB;

-- Las estimaciones EST- ya existentes (de antes de esta migración) no
-- tienen periodo_fin -- se les asigna su fecha_emision como mejor
-- aproximación, así la próxima corrida calcula el período nuevo desde
-- ahí en vez de retroceder hasta el arranque del proyecto.
UPDATE facturas_cliente
SET periodo_fin = fecha_emision
WHERE numero LIKE 'EST-%' AND periodo_fin IS NULL AND fecha_emision IS NOT NULL;

CREATE TABLE IF NOT EXISTS avance_snapshots_semanales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proyecto_id UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  avance_ponderado_pct DECIMAL(7,4) NOT NULL,
  presupuesto_total DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proyecto_id, fecha)
);

ALTER TABLE avance_snapshots_semanales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_dueno_ven_avance_snapshots" ON avance_snapshots_semanales;
CREATE POLICY "admin_dueno_ven_avance_snapshots" ON avance_snapshots_semanales
  FOR SELECT USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'project_manager', 'dueno', 'superadmin') AND
    usuario_ve_proyecto(proyecto_id)
  );

-- Solo se borran los borradores (nunca se llegaron a enviar, así que
-- no hay nada que "deshacer" contablemente -- ver comentario arriba
-- sobre por qué el avance no se pierde al borrar un borrador).
DROP POLICY IF EXISTS "admin_dueno_borran_borradores_factura_cliente" ON facturas_cliente;
CREATE POLICY "admin_dueno_borran_borradores_factura_cliente" ON facturas_cliente
  FOR DELETE USING (
    proyecto_id IN (SELECT id FROM proyectos WHERE empresa_id = get_empresa_id()) AND
    get_rol_usuario() IN ('administrador', 'dueno', 'superadmin') AND
    estado = 'borrador'
  );

DROP FUNCTION IF EXISTS generar_facturas_semanales(UUID);

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

    -- Guarda el avance de hoy sea que esta corrida termine generando
    -- una factura o no -- así queda el punto en la línea de tiempo
    -- para poder desglosar por sub-período más adelante.
    INSERT INTO avance_snapshots_semanales (proyecto_id, fecha, avance_ponderado_pct, presupuesto_total)
    VALUES (v_proyecto.id, CURRENT_DATE, v_avance_ponderado, v_presupuesto_total)
    ON CONFLICT (proyecto_id, fecha) DO UPDATE
      SET avance_ponderado_pct = EXCLUDED.avance_ponderado_pct,
          presupuesto_total = EXCLUDED.presupuesto_total;

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

    -- Si ya hay un borrador sin resolver para este proyecto, no se
    -- genera otro encima -- primero hay que aprobarlo o descartarlo.
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

    -- Período que cubre esta estimación: desde el día siguiente al
    -- fin de la última estimación EST- que sigue existiendo (aprobada
    -- o todavía en borrador), o desde el arranque real del proyecto
    -- si es la primera. Si la semana pasada se generó un borrador y
    -- se descartó, esa fila ya no existe -- por eso el período vuelve
    -- a abarcar desde antes, y el desglose de abajo lo refleja.
    SELECT periodo_fin + 1 INTO v_periodo_inicio
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%' AND periodo_fin IS NOT NULL
    ORDER BY periodo_fin DESC
    LIMIT 1;

    IF v_periodo_inicio IS NULL THEN
      SELECT COALESCE(fecha_inicio_real, fecha_inicio_plan) INTO v_periodo_inicio
      FROM proyectos WHERE id = v_proyecto.id;
    END IF;

    -- Desglose por sub-período recorriendo los snapshots guardados
    -- desde v_periodo_inicio hasta hoy, en orden. Cada snapshot cierra
    -- un sub-período con su propio % de avance y monto bruto.
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

    SELECT COUNT(*) + 1 INTO v_siguiente_seq
    FROM facturas_cliente
    WHERE proyecto_id = v_proyecto.id AND numero LIKE 'EST-%';

    v_numero := 'EST-' || v_proyecto.codigo || '-' || LPAD(v_siguiente_seq::TEXT, 3, '0');

    INSERT INTO facturas_cliente (
      proyecto_id, numero, descripcion, monto, retencion, amortizacion_anticipo,
      periodo_inicio, periodo_fin, desglose_periodos,
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
-- Trigger de correo: antes disparaba en cualquier INSERT de una
-- fila EST-. Ahora esas filas nacen en 'borrador' (no se le manda
-- nada a nadie todavía), así que el correo debe disparar solo:
--   a) al aprobarla (UPDATE que pasa de 'borrador' a 'enviada'), o
--   b) si por alguna vía se inserta ya directamente como 'enviada'
--      (no debería pasar con el motor automático, pero no hace daño
--      cubrir el caso).
-- No debe reenviar el correo en updates posteriores (cobros, cambios
-- de estado a pagada/vencida, etc.) -- de ahí el chequeo de OLD.estado.
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

-- ------------------------------------------------------------
-- cliente_ver_facturas(): ya excluía 'borrador' (desde la 047), pero
-- solo devolvía el monto neto sin explicar de qué se compone. Se
-- agregan retención, amortización de anticipo y el período/desglose,
-- para que el cliente vea lo mismo que el dueño/PM revisó antes de
-- aprobar (qué se le está cobrando y qué se le descontó del anticipo).
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
