"use client"

import { useState, useEffect, use } from "react"
import { createClient } from "@/lib/supabase/client"
import { Building2, MapPin, Calendar, CheckCircle, AlertCircle, Loader2, Clock, LogIn, LogOut } from "lucide-react"

type ProyectoInfo = {
  id: string
  nombre: string
  codigo: string
  ubicacion: string | null
}

type Trabajador = {
  id: string
  nombre_completo: string
  rol_obra: string | null
}

type TipoRegistro = "entrada" | "salida"

export default function CheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase = createClient()

  const [proyecto, setProyecto] = useState<ProyectoInfo | null>(null)
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [notFound, setNotFound] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [trabajadorId, setTrabajadorId] = useState("")
  const [nombreManual, setNombreManual] = useState("")
  const [tipo, setTipo] = useState<TipoRegistro>("entrada")
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const hoy = new Date().toLocaleDateString("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  })
  const hora = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit"
  })

  useEffect(() => {
    async function load() {
      // Find project by qr_token — vía función pública (RLS bloquea la
      // tabla proyectos para usuarios sin sesión, así que se usa un RPC
      // que solo devuelve las columnas necesarias para el check-in).
      const { data: proyData, error: proyError } = await supabase
        .rpc("checkin_datos_proyecto", { p_qr_token: token })

      const proy = proyData?.[0] as { proyecto_id: string; nombre: string; codigo: string; ubicacion: string | null } | undefined

      if (proyError || !proy) {
        setNotFound(true)
        setIsLoading(false)
        return
      }
      setProyecto({ id: proy.proyecto_id, nombre: proy.nombre, codigo: proy.codigo, ubicacion: proy.ubicacion })

      // Lista de trabajadores (autorizados del proyecto, o todos los de
      // la empresa si aún no hay equipo configurado) — también vía RPC.
      const { data: trabsData } = await supabase
        .rpc("checkin_trabajadores_disponibles", { p_qr_token: token })

      const trabs = (trabsData ?? []).map((t: { trabajador_id: string; nombre_completo: string; rol_obra: string | null }) => ({
        id: t.trabajador_id,
        nombre_completo: t.nombre_completo,
        rol_obra: t.rol_obra,
      }))
      setTrabajadores(trabs)

      setIsLoading(false)
    }
    load()
  }, [token])

  const handleRegistrar = async () => {
    setError("")

    const usandoManual = trabajadorId === "__manual__"
    if (!trabajadorId) {
      setError("Selecciona tu nombre de la lista")
      return
    }
    if (usandoManual && !nombreManual.trim()) {
      setError("Escribe tu nombre")
      return
    }

    setSubmitting(true)

    const payload: Record<string, unknown> = {
      proyecto_id: proyecto!.id,
      tipo,
      // Fecha y hora en el timezone LOCAL del dispositivo (no UTC) para
      // que ambas queden consistentes entre sí — toISOString() da la
      // fecha en UTC, que en México puede ya ser el día siguiente.
      fecha: (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      })(),
      hora: new Date().toTimeString().split(" ")[0].substring(0, 5),
    }

    if (usandoManual) {
      payload.nombre_manual = nombreManual.trim()
    } else {
      payload.trabajador_id = trabajadorId
    }

    const { error: insertError } = await supabase
      .from("registros_asistencia_qr")
      .insert(payload)

    if (insertError) {
      setError("Error al registrar. Intenta de nuevo.")
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)
  }

  // ── Estados de UI ─────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">QR no válido</h1>
          <p className="text-slate-400 text-sm">Este código QR no corresponde a ningún proyecto activo.</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-xs">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 mb-5">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {tipo === "entrada" ? "¡Entrada registrada!" : "¡Salida registrada!"}
          </h1>
          <p className="text-slate-400 text-sm mb-1">{proyecto!.nombre}</p>
          <p className="text-slate-500 text-sm">{hora} — {hoy}</p>
          <button
            className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-colors"
            onClick={() => {
              setSuccess(false)
              setTrabajadorId("")
              setNombreManual("")
              setTipo("entrada")
            }}
          >
            Registrar otro
          </button>
        </div>
      </div>
    )
  }

  const trabajadorSeleccionado = trabajadores.find((t) => t.id === trabajadorId)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Logo + Proyecto */}
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 mb-3">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Check-in / Check-out</p>
          <h1 className="text-xl font-bold text-white">{proyecto!.nombre}</h1>
          <p className="text-sm text-slate-400 font-mono">{proyecto!.codigo}</p>
          {proyecto!.ubicacion && (
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3" /> {proyecto!.ubicacion}
            </p>
          )}
        </div>

        {/* Fecha y hora */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between text-sm">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {hoy}
          </span>
          <span className="text-white font-mono font-semibold flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            {hora}
          </span>
        </div>

        {/* Tipo de registro */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTipo("entrada")}
            className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
              tipo === "entrada"
                ? "border-emerald-400 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            <LogIn className="h-6 w-6" />
            <span className="text-sm font-semibold">Entrada</span>
          </button>
          <button
            onClick={() => setTipo("salida")}
            className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
              tipo === "salida"
                ? "border-amber-400 bg-amber-500/10 text-amber-400"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            <LogOut className="h-6 w-6" />
            <span className="text-sm font-semibold">Salida</span>
          </button>
        </div>

        {/* Selección de trabajador */}
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider">¿Quién eres?</label>

          {trabajadores.length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {trabajadores.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTrabajadorId(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    trabajadorId === t.id
                      ? "border-white/30 bg-white/15 text-white"
                      : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    trabajadorId === t.id ? "bg-white text-slate-900" : "bg-white/10 text-slate-400"
                  }`}>
                    {t.nombre_completo.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{t.nombre_completo}</p>
                    {t.rol_obra && <p className="text-xs text-slate-500 capitalize">{t.rol_obra}</p>}
                  </div>
                </button>
              ))}

              {/* Opción "mi nombre no está" */}
              <button
                onClick={() => setTrabajadorId("__manual__")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                  trabajadorId === "__manual__"
                    ? "border-white/30 bg-white/15 text-white"
                    : "border-dashed border-white/10 bg-transparent text-slate-500 hover:bg-white/5"
                }`}
              >
                <div className="h-8 w-8 rounded-full border border-dashed border-white/20 flex items-center justify-center text-xs flex-shrink-0 text-slate-500">
                  +
                </div>
                <p className="text-sm">Mi nombre no está en la lista</p>
              </button>
            </div>
          ) : (
            // No hay trabajadores en DB — modo manual directo
            <div onClick={() => setTrabajadorId("__manual__")} className="cursor-pointer">
              <p className="text-xs text-slate-500 mb-2">Escribe tu nombre:</p>
            </div>
          )}

          {/* Campo nombre manual */}
          {(trabajadorId === "__manual__" || trabajadores.length === 0) && (
            <input
              type="text"
              value={nombreManual}
              onChange={(e) => setNombreManual(e.target.value)}
              placeholder="Tu nombre completo"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
              autoFocus
            />
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Botón confirmar */}
        <button
          onClick={handleRegistrar}
          disabled={submitting || !trabajadorId}
          className={`w-full py-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            tipo === "entrada"
              ? "bg-emerald-500 hover:bg-emerald-400 text-white disabled:bg-emerald-500/30 disabled:text-emerald-300"
              : "bg-amber-500 hover:bg-amber-400 text-white disabled:bg-amber-500/30 disabled:text-amber-300"
          } disabled:cursor-not-allowed`}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting
            ? "Registrando..."
            : tipo === "entrada"
            ? "✓ Registrar entrada"
            : "✓ Registrar salida"
          }
        </button>

        <p className="text-center text-xs text-slate-600 pb-4">
          Vertikall Haus — Sistema de gestión de construcción
        </p>
      </div>
    </div>
  )
}
