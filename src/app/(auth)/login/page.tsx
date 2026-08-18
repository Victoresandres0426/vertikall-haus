"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [recordar, setRecordar] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos"
          : authError.message
      )
      setIsLoading(false)
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="relative min-h-screen flex bg-[#F7F9FC] overflow-hidden">
      {/* Foto de edificio de fondo — esquina inferior izquierda, solo móvil */}
      <div className="lg:hidden absolute inset-0 pointer-events-none">
        <Image
          src="/images/login-building.jpg"
          alt=""
          fill
          priority
          className="object-cover object-left-bottom"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#F7F9FC]/40 via-[#F7F9FC]/70 to-[#F7F9FC]" />
      </div>

      {/* Panel izquierdo — foto de edificio (solo desktop) */}
      <div className="hidden lg:block relative w-1/2 overflow-hidden bg-[#F7F9FC]">
        <Image
          src="/images/login-building.jpg"
          alt=""
          fill
          priority
          className="object-cover object-left-top"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#F7F9FC]" />
      </div>

      {/* Panel derecho — formulario */}
      <div className="relative flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Marca */}
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
            <p className="text-[11px] font-medium tracking-[0.3em] text-[#3B72D8]/70 uppercase mt-3">
              Sistema de Gestión
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#3B72D8] focus-within:ring-2 focus-within:ring-[#3B72D8]/20 transition-colors">
              <User className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="email"
                placeholder="Correo electrónico / Usuario"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                name="vh-email"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-[#3B72D8] focus-within:ring-2 focus-within:ring-[#3B72D8]/20 transition-colors">
              <Lock className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                name="vh-password"
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

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={recordar}
                  onChange={(e) => setRecordar(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#3B72D8] focus:ring-[#3B72D8]/30"
                />
                Recordarme
              </label>
              <a href="/recuperar-contrasena" className="text-[#3B72D8] hover:underline font-medium">
                ¿Olvidaste tu contraseña?
              </a>
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
              {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
