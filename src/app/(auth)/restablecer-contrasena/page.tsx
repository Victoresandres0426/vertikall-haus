"use client"

// Página a la que redirige el link del correo de recuperación
// (configurado como redirectTo en recuperar-contrasena/page.tsx).
// Supabase manda el link con un "code" de un solo uso en la URL --
// primero hay que intercambiarlo por una sesión (exchangeCodeForSession)
// antes de poder dejar que la persona escriba su contraseña nueva.
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function RestablecerContrasenaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [verificando, setVerificando] = useState(true)
  const [linkInvalido, setLinkInvalido] = useState(false)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function verificarLink() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get("code")

      if (!code) {
        // Puede que el navegador ya haya consumido el código en una
        // recarga previa -- si ya hay sesión activa, dejamos seguir.
        const { data } = await supabase.auth.getSession()
        setLinkInvalido(!data.session)
        setVerificando(false)
        return
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      setLinkInvalido(!!exchangeError)
      setVerificando(false)
    }
    verificarLink()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
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
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess(true)
    // Se cierra la sesión temporal del link para que la persona entre
    // normalmente con su contraseña nueva, no se queda logueada desde
    // el flujo de recuperación.
    await supabase.auth.signOut()
    setTimeout(() => router.push("/login"), 2000)
  }

  if (verificando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC]">
        <Loader2 className="h-8 w-8 text-slate-300 animate-spin" />
      </div>
    )
  }

  if (linkInvalido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Link no válido</h1>
          <p className="text-sm text-slate-500 mb-6">
            Este link de recuperación ya expiró o ya fue usado. Solicita uno nuevo.
          </p>
          <a
            href="/recuperar-contrasena"
            className="block w-full h-10 leading-10 rounded-lg bg-[#3B72D8] text-white text-sm font-medium hover:bg-[#3163C2] transition-colors"
          >
            Solicitar nuevo link
          </a>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 mb-1">¡Contraseña actualizada!</h1>
          <p className="text-sm text-slate-500">Te llevamos al inicio de sesión...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Image
            src="/logo/mark.png"
            alt="Vertikall Haus"
            width={72}
            height={108}
            className="h-16 w-auto mb-5"
            priority
          />
          <h1 className="text-3xl font-bold tracking-[0.18em] text-[#0F2040]">
            VERTIKALL
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="w-8 h-px bg-[#3B72D8]/50" />
            <span className="text-base font-semibold tracking-[0.4em] text-[#3B72D8]">
              HAUS
            </span>
            <span className="w-8 h-px bg-[#3B72D8]/50" />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Crea tu nueva contraseña</h2>
          <p className="text-sm text-slate-500 mb-6">Elige una contraseña segura para tu cuenta</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#3B72D8] focus-within:ring-2 focus-within:ring-[#3B72D8]/20 transition-colors">
              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Nueva contraseña (mínimo 8 caracteres)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#3B72D8] focus-within:ring-2 focus-within:ring-[#3B72D8]/20 transition-colors">
              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Repite la contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
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
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#3B72D8] hover:bg-[#3163C2] disabled:opacity-60 text-white text-sm font-semibold tracking-[0.15em] uppercase py-3.5 transition-colors mt-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Guardando..." : "Guardar contraseña"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
