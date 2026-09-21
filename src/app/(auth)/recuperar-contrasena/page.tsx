"use client"

// El login siempre tuvo un link "¿Olvidaste tu contraseña?" que
// apuntaba aquí -- pero esta página nunca se construyó (daba 404).
// Pide el correo y dispara el email de recuperación de Supabase Auth,
// que redirige a /restablecer-contrasena con un código de un solo uso.
import { useState } from "react"
import Image from "next/image"
import { Mail, ArrowRight, Loader2, CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function RecuperarContrasenaPage() {
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [enviado, setEnviado] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    })

    setIsLoading(false)

    if (resetError) {
      setError("No se pudo enviar el correo. Intenta de nuevo en unos minutos.")
      return
    }

    // Por seguridad no distinguimos "correo no existe" de "correo enviado"
    // -- siempre el mismo mensaje, para no revelar qué correos están
    // registrados en el sistema.
    setEnviado(true)
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
          {enviado ? (
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Revisa tu correo</h2>
              <p className="text-sm text-slate-500 mb-6">
                Si <span className="font-medium text-slate-700">{email}</span> tiene una cuenta,
                te enviamos un link para restablecer tu contraseña. Puede tardar unos minutos en llegar.
              </p>
              <a
                href="/login"
                className="text-sm text-[#3B72D8] hover:underline font-medium"
              >
                Volver al inicio de sesión
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">Recuperar contraseña</h2>
              <p className="text-sm text-slate-500 mb-6">
                Escribe tu correo y te enviamos un link para crear una contraseña nueva.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
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
                  {isLoading ? "Enviando..." : "Enviar link de recuperación"}
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
        </div>
      </div>
    </div>
  )
}
