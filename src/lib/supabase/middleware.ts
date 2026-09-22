import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { UN_ANIO_SEGUNDOS, COOKIE_RECORDAR } from './cookie-options'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // El login guarda esta cookie según el checkbox "Recordarme". Si la
  // persona la desmarcó, cada vez que este middleware refresca el token
  // de sesión debe seguir emitiendo la cookie de auth SIN maxAge
  // (cookie de sesión del navegador) -- si no se respeta aquí, la
  // próxima navegación la volvería a convertir en persistente y la
  // preferencia de "no recordar" se perdería en el primer click.
  const recordar = request.cookies.get(COOKIE_RECORDAR)?.value !== '0'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    {
      cookieOptions: recordar ? { maxAge: UN_ANIO_SEGUNDOS, path: '/' } : { path: '/' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas donde la sesión redirige al dashboard
  const loginPaths = ['/login', '/recuperar-contrasena']

  // Rutas siempre accesibles (con o sin sesión)
  // "/restablecer-contrasena" tiene que estar aquí y NO en loginPaths:
  // cuando la persona abre el link del correo, todavía no hay sesión
  // (el código en la URL se intercambia por una sesión DESPUÉS, dentro
  // de esa misma página) -- si esta ruta no está en alwaysPublic, este
  // middleware la trata como protegida, ve que no hay "user" todavía, y
  // la redirige a /login antes de que la página alcance a intercambiar
  // el código. Tampoco puede ir en loginPaths: en cuanto SÍ hay sesión
  // (justo después del intercambio), loginPaths rebota a /dashboard, lo
  // que le impide a la persona llegar a escribir su contraseña nueva.
  const alwaysPublic = ['/sin-acceso', '/invitacion/', '/check-in/', '/mi-obra/', '/restablecer-contrasena']
  const isAlwaysPublic = alwaysPublic.some(p => pathname.startsWith(p))
  const isLoginPath = loginPaths.some(p => pathname.startsWith(p))
  const isPublicPath = isLoginPath || isAlwaysPublic

  // ── Sin sesión → login ──────────────────────────────────────
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Con sesión en login/registro → dashboard ───────────────
  if (user && isLoginPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Rutas siempre públicas no necesitan verificación de perfil
  if (isAlwaysPublic) return supabaseResponse

  // ── Con sesión en ruta protegida → verificar perfil ────────
  if (user && !isPublicPath) {
    const { data: perfil, error } = await supabase
      .from('perfiles_usuario')
      .select('id, activo')
      .eq('id', user.id)
      .single()

    // Sin perfil = sin acceso (no fue invitado o su cuenta fue desactivada)
    if (!perfil || error) {
      const url = request.nextUrl.clone()
      url.pathname = '/sin-acceso'
      return NextResponse.redirect(url)
    }

    // Perfil inactivo
    if (perfil.activo === false) {
      const url = request.nextUrl.clone()
      url.pathname = '/sin-acceso'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
