// Sin un maxAge explícito, las cookies de sesión de Supabase se
// comportan como cookies "de sesión del navegador": el navegador (o la
// PWA instalada) las borra al cerrarse por completo, no solo al
// recargar o navegar. Eso es justo lo que se reportó: "cada vez que
// abro la app tengo que volver a iniciar sesión" -- no era un problema
// de Supabase en sí, es que ningún cliente (browser/server/middleware)
// pedía explícitamente que la cookie sobreviviera al cierre del
// navegador.
//
// UN_ANIO se usa como el maxAge por defecto (persistente) para que
// iniciar sesión te mantenga conectado entre reinicios de la app/tablet,
// que es el comportamiento esperado de cualquier app instalada.
//
// El checkbox "Recordarme" del login usa esta misma cookie para guardar
// la preferencia de la persona: si la desmarca, se guarda sin maxAge
// (cookie de sesión) -- el middleware la lee en cada request y, mientras
// esté en "0", vuelve a emitir las cookies de auth SIN maxAge también,
// para que de verdad se cierre la sesión al cerrar el navegador/app.
export const UN_ANIO_SEGUNDOS = 60 * 60 * 24 * 365
export const COOKIE_RECORDAR = 'vh_recordar'
