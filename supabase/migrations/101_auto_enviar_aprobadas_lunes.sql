-- ============================================================
-- 101 — Las estimaciones "aprobadas" se envían solas cada lunes
-- ============================================================
-- Flujo normal (según lo definió el dueño): se genera el borrador
-- automático, se revisa, se aprueba -- y ahí se queda, lista para
-- enviar, hasta el siguiente lunes, cuando el cron la envía sola (le
-- llega al cliente y se dispara el correo). El botón "Enviar" manual
-- de la migración 099 queda solo para casos fuera de ciclo o
-- urgentes -- no hace falta usarlo en el flujo normal.
--
-- Se reprograma el job de pg_cron (creado en la migración 018) para
-- que, cada lunes 8:00 UTC, primero envíe todas las estimaciones que
-- sigan en 'aprobada' (de la semana anterior) y LUEGO genere los
-- nuevos borradores de esta semana -- en ese orden, para no mezclar
-- el envío de lo ya aprobado con el corte de la semana que arranca.
-- ============================================================

-- Envía (aprobada -> enviada) todas las estimaciones aprobadas de
-- TODAS las empresas -- lo dispara el cron, no depende de sesión de
-- usuario. El UPDATE es por fila, así que el trigger de correo
-- (trg_enviar_email_estimacion) se dispara una vez por cada una.
CREATE OR REPLACE FUNCTION enviar_facturas_aprobadas_todas_empresas()
RETURNS void AS $$
BEGIN
  UPDATE facturas_cliente
  SET estado = 'enviada'
  WHERE estado = 'aprobada' AND numero LIKE 'EST-%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION enviar_facturas_aprobadas_todas_empresas() FROM PUBLIC;

-- Reprograma el job semanal para encadenar los dos pasos. cron.schedule
-- con un job_name que ya existe lo actualiza (no crea uno duplicado).
DO $$
BEGIN
  PERFORM cron.schedule(
    'facturacion-semanal',
    '0 8 * * 1',
    $cron$SELECT enviar_facturas_aprobadas_todas_empresas(); SELECT generar_facturas_semanales_todas_empresas();$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo reprogramar pg_cron (puede que la extensión no esté habilitada en este proyecto). La función de auto-envío igual quedó creada.';
END $$;
