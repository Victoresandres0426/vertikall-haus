-- ============================================================
-- 041 — Fix: activar invitación fallaba con "Error al activar
-- la invitación" para toda persona nueva
-- ============================================================
-- A la función activar_invitacion() (migración 006) nunca se le
-- otorgó permiso explícito de ejecución. Cuando alguien nuevo se
-- registra desde el link de invitación, si la confirmación de
-- correo está activada en Supabase Auth, signUp() no deja una
-- sesión autenticada todavía -- la llamada a la función ocurre
-- como usuario anónimo (anon). Sin el GRANT, Postgres rechaza la
-- llamada por falta de permiso, y eso es justo el error genérico
-- que se veía en pantalla.
--
-- Es seguro otorgar esto a anon: la función igual exige que el
-- token exista, no haya sido usado, no haya expirado, y que el
-- email coincida exactamente -- sin eso no crea ninguna cuenta.
-- ============================================================

GRANT EXECUTE ON FUNCTION activar_invitacion(UUID, UUID, TEXT) TO authenticated, anon;
