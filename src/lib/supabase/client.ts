import { createBrowserClient } from '@supabase/ssr'
import { UN_ANIO_SEGUNDOS } from './cookie-options'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// recordar=true (default): cookies de auth con maxAge de 1 año --
// persisten aunque se cierre por completo el navegador/PWA. Solo el
// login pasa recordar=false cuando la persona desmarca "Recordarme" --
// ahí las cookies se guardan SIN maxAge (cookies de sesión del
// navegador), para que cerrar la app sí cierre la sesión, como se
// espera de esa opción.
export function createClient(recordar: boolean = true) {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: recordar ? { maxAge: UN_ANIO_SEGUNDOS, path: '/' } : { path: '/' },
  })
}
