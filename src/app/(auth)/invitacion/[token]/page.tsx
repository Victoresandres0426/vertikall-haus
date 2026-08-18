"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { Building2, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type InvitacionInfo = {
  email: string
  nombre_completo: string
  rol: string
}

const rolLabel: Record<string, string> = {
  capataz: "Capataz",
  administrador: "Administrador",
  project_manager: "Project Manager",
  dueno: "Dueño",
}

export default function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const { token } = use(params)

  const [invite, setInvite] = useState<InvitacionInfo | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isLoadingInvite, setIsLoadingInvite] = useState(true)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function loadInvite() {
      const { data } = await supabase
        .from("invitaciones")
        .select("email, nombre_completo, rol")
        .eq("token", token)
        .eq("activa", true)
        .is("used_at", null)
        .single()

      if (data) {
        setInvite(data)
      } else {
        setNotFound(true)
      }
      setIsLoadingInvite(false)
    }
    loadInvite()
  }, [token])

  const handleActivar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres")
      return
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      return
    }

    setIsLoading(true)

    // 1. Crear cuenta en Supabase Auth
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: invite!.email,
      password,
    })

    if (signUpError || !authData.user) {
      setError(signUpError?.message ?? "Error al crear la cuenta")
      setIsLoading(false)
      return
    }

    // 2. Activar invitación vía función DB (crea perfiles_usuario)
    const { data: activResult, error: activError } = await supabase.rpc("activar_invitacion", {
      p_token: token,
      p_user_id: authData.user.id,
      p_email: invite!.email,
    })

    if (activError || !activResult?.ok) {
      setError(activResult?.error ?? activError?.message ?? "Error al activar la invitación")
      setIsLoading(false)
      return
    }

    setSuccess(true)
    setIsLoading(false)

    // Si la cuenta requiere confirmación de email, mostramos mensaje
    // Si no (email confirmations disabled), redirigimos directamente
    if (authData.session) {
      setTimeout(() => router.push("/dashboard"), 2000)
    }
  }

  // ── Estados de UI ───────────────────────────────────────────

  if (isLoadingInvite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Invitación no válida</h1>
          <p className="text-slate-400 text-sm max-w-sm">
            Este link de invitación ha expirado, ya fue usado, o no existe.
            Solicita a tu administrador que genere uno nuevo.
          </p>
        </div>
      </div>
    )
  }

  if (success) {
    const hasSession = true // simplificado
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">¡Cuenta activada!</h1>
          <p className="text-slate-400 text-sm max-w-sm">
            Tu cuenta fue creada exitosamente. Revisa tu correo para confirmar
            tu dirección y luego inicia sesión.
          </p>
          <a
            href="/login"
            className="inline-block mt-6 px-6 py-2 bg-white text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Vertikall Haus</h1>
          <p className="text-slate-400 mt-1 text-sm">Activar cuenta</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {/* Info de la invitación */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-emerald-900 mb-1">
              Fuiste invitado como {rolLabel[invite!.rol] ?? invite!.rol}
            </p>
            <p className="text-xs text-emerald-700">{invite!.nombre_completo}</p>
            <p className="text-xs text-emerald-600">{invite!.email}</p>
          </div>

          <h2 className="text-xl font-semibold text-slate-900 mb-1">Crea tu contraseña</h2>
          <p className="text-sm text-slate-500 mb-6">Elige una contraseña segura para acceder al sistema</p>

          <form onSubmit={handleActivar} className="space-y-4">
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 mb-1">Contraseña</label>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 pr-10 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-7 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu contraseña"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Activando cuenta..." : "Activar mi cuenta"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
