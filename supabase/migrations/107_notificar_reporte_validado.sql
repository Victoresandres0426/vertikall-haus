-- ============================================================
-- 107 — Notificar al cliente por correo cuando se valida un reporte
-- ============================================================
-- Hasta ahora el cliente solo se enteraba de un reporte nuevo si
-- entraba al portal por su cuenta a revisar. Igual que
-- enviar_email_estimacion() (migración 022) para facturas, esto manda
-- un correo -- directo desde Postgres vía pg_net + la API de Resend,
-- usando la misma api key ya guardada en el Vault -- cuando
-- validar_reporte_diario() hace visible un reporte al portal.
--
-- Si no hay cliente_email, o la api key todavía no está en el Vault,
-- o el envío falla por cualquier motivo: no pasa nada, la validación
-- del reporte de todas formas se completa. Nunca debe bloquear el
-- trabajo del capataz/PM por un problema de correo.
-- ============================================================

CREATE OR REPLACE FUNCTION validar_reporte_diario(p_reporte_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_proyecto_id UUID;
  v_empresa_id UUID;
  v_proyecto RECORD;
  v_fecha DATE;
  v_api_key TEXT;
  v_from TEXT := 'Vertikall Haus <facturacion@vertikallhaus.net>';
  v_asunto TEXT;
  v_html TEXT;
  v_en BOOLEAN;
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

  IF get_rol_usuario() NOT IN ('dueno', 'superadmin', 'administrador', 'project_manager') THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF NOT usuario_ve_proyecto(v_proyecto_id) THEN
    RAISE EXCEPTION 'sin_acceso';
  END IF;

  UPDATE reportes_diarios SET estado_reporte = 'validado' WHERE id = p_reporte_id;

  -- ── Notificación al cliente (mejor esfuerzo, nunca bloquea) ──────
  BEGIN
    SELECT nombre, cliente, cliente_email, idioma_cliente
    INTO v_proyecto
    FROM proyectos
    WHERE id = v_proyecto_id;

    IF v_proyecto.cliente_email IS NULL OR v_proyecto.cliente_email = '' THEN
      RETURN;
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
      RETURN;
    END IF;

    v_en := v_proyecto.idioma_cliente = 'en';

    IF v_en THEN
      v_asunto := 'New site report — ' || v_proyecto.nombre;
      v_html :=
        '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
        '<h2 style="color:#0f172a">New site report published</h2>' ||
        '<p>Hi ' || COALESCE(v_proyecto.cliente, '') || ',</p>' ||
        '<p>A new daily site report (' || to_char(v_fecha, 'FMMonth DD, YYYY') || ') is now available for <strong>' || v_proyecto.nombre || '</strong>, including progress and photos.</p>' ||
        '<p><a href="https://vertikall-haus.vercel.app/portal-cliente/reportes" style="display:inline-block;background:#3B72D8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">View report</a></p>' ||
        '<p style="color:#64748b;font-size:13px">This is an automated message from Vertikall Haus.</p>' ||
        '</div>';
    ELSE
      v_asunto := 'Nuevo reporte de obra — ' || v_proyecto.nombre;
      v_html :=
        '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
        '<h2 style="color:#0f172a">Nuevo reporte de obra publicado</h2>' ||
        '<p>Estimado(a) ' || COALESCE(v_proyecto.cliente, 'cliente') || ',</p>' ||
        '<p>Ya está disponible un nuevo reporte diario (' || to_char(v_fecha, 'FMDD "de" TMMonth "de" YYYY') || ') para <strong>' || v_proyecto.nombre || '</strong>, con su avance y fotos.</p>' ||
        '<p><a href="https://vertikall-haus.vercel.app/portal-cliente/reportes" style="display:inline-block;background:#3B72D8;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ver reporte</a></p>' ||
        '<p style="color:#64748b;font-size:13px">Este correo fue generado automáticamente por el sistema de gestión de Vertikall Haus.</p>' ||
        '</div>';
    END IF;

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
    RAISE NOTICE 'No se pudo enviar el correo de reporte validado (%): %', p_reporte_id, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION validar_reporte_diario(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validar_reporte_diario(UUID) TO authenticated;
