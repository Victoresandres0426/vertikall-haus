-- ============================================================
-- 039 — Respaldo semanal de datos por correo
-- ============================================================
-- Cada lunes (9:00 UTC, una hora después de la facturación
-- automática), arma un JSON con TODA la información de negocio
-- de cada empresa y lo envía como archivo adjunto por correo,
-- usando la misma vía de Resend + pg_net ya usada para las
-- estimaciones automáticas (migración 022) -- no requiere
-- service role key ni infraestructura nueva.
--
-- armar_respaldo_empresa(empresa_id) es genérica: recorre TODAS
-- las tablas del esquema public que tengan una columna
-- empresa_id o proyecto_id, y arma un JSON con el contenido de
-- cada una filtrado a esa empresa. Así cualquier tabla nueva que
-- se agregue en el futuro queda incluida automáticamente sin
-- tener que tocar esta función.
--
-- Requiere que ya exista el secreto 'resend_api_key' en el Vault
-- (ya configurado desde la migración 022). El destino por defecto
-- es oficial@vertikallhaus.net; para cambiarlo sin tocar código,
-- se puede guardar otro secreto:
--
--   select vault.create_secret('correo@destino.com', 'respaldo_email_destino');
--
-- También se expone generar_respaldo_ahora() como RPC para que el
-- dueño/superadmin puedan disparar un envío de prueba manual desde
-- la app, sin esperar al cron del lunes.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION armar_respaldo_empresa(p_empresa_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_tabla TEXT;
  v_query TEXT;
  v_data JSONB;
  v_proyecto_ids UUID[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_proyecto_ids
  FROM proyectos WHERE empresa_id = p_empresa_id;

  FOR v_tabla IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('empresa_id', 'proyecto_id')
  LOOP
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tabla AND column_name = 'empresa_id'
      ) THEN
        v_query := format('SELECT jsonb_agg(to_jsonb(t)) FROM %I t WHERE t.empresa_id = $1', v_tabla);
        EXECUTE v_query INTO v_data USING p_empresa_id;
      ELSE
        v_query := format('SELECT jsonb_agg(to_jsonb(t)) FROM %I t WHERE t.proyecto_id = ANY($1)', v_tabla);
        EXECUTE v_query INTO v_data USING v_proyecto_ids;
      END IF;

      IF v_data IS NOT NULL THEN
        v_result := v_result || jsonb_build_object(v_tabla, v_data);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Si una tabla puntual falla, no se detiene el resto del respaldo.
      CONTINUE;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'generado_en', now(),
    'empresa_id', p_empresa_id,
    'datos', v_result
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION armar_respaldo_empresa(UUID) FROM PUBLIC;

-- ── Envío por correo ────────────────────────────────────────

CREATE OR REPLACE FUNCTION enviar_respaldo_semanal(p_empresa_id UUID)
RETURNS void AS $$
DECLARE
  v_json JSONB;
  v_api_key TEXT;
  v_empresa_nombre TEXT;
  v_destino TEXT;
  v_b64 TEXT;
  v_filename TEXT;
BEGIN
  SELECT nombre INTO v_empresa_nombre FROM empresas WHERE id = p_empresa_id;

  BEGIN
    SELECT decrypted_secret INTO v_api_key FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_api_key := NULL;
  END;
  IF v_api_key IS NULL THEN
    RETURN; -- Resend aún no configurado
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_destino FROM vault.decrypted_secrets WHERE name = 'respaldo_email_destino' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_destino := NULL;
  END;
  v_destino := COALESCE(NULLIF(v_destino, ''), 'oficial@vertikallhaus.net');

  v_json := armar_respaldo_empresa(p_empresa_id);
  v_b64 := encode(convert_to(v_json::text, 'UTF8'), 'base64');
  v_filename := 'respaldo-vertikall-haus-' || to_char(now(), 'YYYY-MM-DD') || '.json';

  BEGIN
    PERFORM net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', 'Vertikall Haus <facturacion@vertikallhaus.net>',
        'to', jsonb_build_array(v_destino),
        'subject', 'Respaldo semanal de datos — ' || COALESCE(v_empresa_nombre, 'Vertikall Haus') || ' (' || to_char(now(), 'YYYY-MM-DD') || ')',
        'html',
          '<div style="font-family:sans-serif;max-width:560px;margin:0 auto">' ||
          '<h2 style="color:#0f172a">Respaldo semanal de datos</h2>' ||
          '<p>Adjunto encontrarás una copia completa de la información del sistema (proyectos, actividades, presupuestos, facturación, personal, etc.) en formato JSON, generada automáticamente.</p>' ||
          '<p style="color:#64748b;font-size:13px">Guarda este archivo en un lugar seguro fuera del sistema. Este correo se envía automáticamente cada semana.</p>' ||
          '</div>',
        'attachments', jsonb_build_array(
          jsonb_build_object('filename', v_filename, 'content', v_b64)
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo enviar el respaldo semanal de la empresa %: %', p_empresa_id, SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION enviar_respaldo_semanal(UUID) FROM PUBLIC;

-- ── Wrapper para el cron (todas las empresas) ──────────────

CREATE OR REPLACE FUNCTION enviar_respaldos_semanales_todas_empresas()
RETURNS void AS $$
DECLARE
  v_empresa RECORD;
BEGIN
  FOR v_empresa IN SELECT id FROM empresas LOOP
    PERFORM enviar_respaldo_semanal(v_empresa.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION enviar_respaldos_semanales_todas_empresas() FROM PUBLIC;

-- ── Disparo manual (botón "Enviar respaldo ahora" en Configuración) ──

CREATE OR REPLACE FUNCTION generar_respaldo_ahora()
RETURNS void AS $$
DECLARE
  v_rol rol_usuario;
  v_empresa_id UUID;
BEGIN
  v_rol := get_rol_usuario();
  IF v_rol IS NULL OR v_rol NOT IN ('dueno', 'superadmin') THEN
    RAISE EXCEPTION 'Solo el dueño puede generar un respaldo manual';
  END IF;

  v_empresa_id := get_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la empresa';
  END IF;

  PERFORM enviar_respaldo_semanal(v_empresa_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION generar_respaldo_ahora() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generar_respaldo_ahora() TO authenticated;

-- ── Programación semanal (lunes 9:00 UTC) ──────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'respaldo-semanal',
    '0 9 * * 1',
    $cron$SELECT enviar_respaldos_semanales_todas_empresas();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar pg_cron para el respaldo semanal (puede que la extensión no esté habilitada). Las funciones igual quedaron creadas; se puede probar con generar_respaldo_ahora() o pedirle a Supabase que habilite pg_cron.';
END $$;
