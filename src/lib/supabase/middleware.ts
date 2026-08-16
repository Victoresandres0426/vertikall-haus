import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
    {
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
  const alwaysPublic = ['/sin-acceso', '/invitacion/', '/check-in/']
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
