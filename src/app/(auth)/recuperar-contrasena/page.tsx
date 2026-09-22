"use client"

// El login siempre tuvo un link "¿Olvidaste tu contraseña?" que
// apuntaba aquí -- pero esta página nunca se construyó (daba 404).
//
// Primera versión: mandaba un link clicable por correo. Se cambió a un
// código de 6 dígitos que la persona escribe a mano, porque el link
// fallaba consistentemente ("Link no válido") incluso pidiéndolo y
// abriéndolo de inmediato en el mismo navegador -- eso coincide con un
// problema conocido y muy documentado de Supabase: Gmail (y varios
// escáneres de seguridad corporativos) "pre-visitan" los links de un
// solo uso apenas llega el correo, para revisarlos por seguridad --
// eso consume el link ANTES de que la persona lo toque. Un código que
// hay que escribir a mano no se puede "pre-visitar" así, así que es
// inmune a ese problema.
import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function RecuperarContrasenaPage() {
  const router = useRouter()
  const supabase = createClient()

  const [paso, setPaso] = useState<"email" | "codigo" | "listo">("email")
  const [email, setEmail] = useState("")
  const [codigo, setCodigo] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleEnviarCodigo = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email)

    setIsLoading(false)

    if (resetError) {
      setError("No se pudo enviar el correo. Intenta de nuevo en unos minutos.")
      return
    }

    // Por seguridad no distinguimos "correo no existe" de "correo enviado"
    // -- siempre se avanza al paso del código, para no revelar qué
    // correos están registrados en el sistema.
    setPaso("codigo")
  }

  const handleConfirmar = async (e: React.FormEvent) => {
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

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: codigo.trim(),
      type: "recovery",
    })

    if (verifyError) {
      setIsLoading(false)
      setError("Código incorrecto o vencido. Revisa que lo copiaste bien, o solicita uno nuevo.")
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setPaso("listo")
    await supabase.auth.signOut()
    setTimeout(() => router.push("/login"), 2000)
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
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
          {paso === "email" && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">Recuperar contraseña</h2>
              <p className="text-sm text-slate-500 mb-6">
                Escribe tu correo y te enviamos un código de 6 dígitos para crear una contraseña nueva.
              </p>

              <form onSubmit={handleEnviarCodigo} className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#3B72D8] focus-within:ring-2 focus-within:ring-[#3B72D8]/20 transition-colors">
                  <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="email"
                    placeholder="Correo electrónico"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
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
                  {isLoading ? "Enviando..." : "Enviar código"}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </button>

                <p className="text-center text-sm text-slate-500 pt-1">
                  <a href="/login" className="text-[#3B72D8] hover:underline font-medium">
                    Volver al inicio de sesión
                  </a>
                </p>
              </form>
            </>
          )}

          {paso === "codigo" && (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">Escribe el código</h2>
              <p className="text-sm text-slate-500 mb-6">
                Si <span className="font-medium text-slate-700">{email}</span> tiene una cuenta,
                le enviamos un código de 6 dígitos. Escríbelo aquí junto con tu contraseña nueva.
              </p>

              <form onSubmit={handleConfirmar} className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#3B72D8] focus-within:ring-2 focus-within:ring-[#3B72D8]/20 transition-colors">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Código de 6 dígitos"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    required
                    maxLength={6}
                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none tracking-[0.3em] text-center font-mono"
                  />
                </div>

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

                <p className="text-center text-sm text-slate-500 pt-1">
                  <button
                    type="button"
                    onClick={() => { setPaso("email"); setError("") }}
                    className="text-[#3B72D8] hover:underline font-medium"
                  >
                    ¿No te llegó? Pedir otro código
                  </button>
                </p>
              </form>
            </>
          )}

          {paso === "listo" && (
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">¡Contraseña actualizada!</h2>
              <p className="text-sm text-slate-500">Te llevamos al inicio de sesión...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
