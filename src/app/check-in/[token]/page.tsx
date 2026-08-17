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

const DEVICE_TOKEN_KEY = "vh_checkin_device_token"

function obtenerDeviceToken(): string {
  if (typeof window === "undefined") return ""
  let token = window.localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

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

  // Este celular ya quedó vinculado a un trabajador en un check-in
  // anterior — si es así, se bloquea la selección de cualquier otro nombre.
  const [dispositivoVinculado, setDispositivoVinculado] = useState<{ id: string; nombre: string } | null>(null)

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

      // ¿Este celular ya está vinculado a alguien de un check-in previo?
      const deviceToken = obtenerDeviceToken()
      const { data: vinculoData } = await supabase
        .rpc("checkin_dispositivo_vinculado", { p_device_token: deviceToken })
      const vinculo = vinculoData?.[0] as { trabajador_id: string; nombre_completo: string; ultimo_tipo: string | null } | undefined
      if (vinculo) {
        setDispositivoVinculado({ id: vinculo.trabajador_id, nombre: vinculo.nombre_completo })
        setTrabajadorId(vinculo.trabajador_id)
        // Preseleccionar el movimiento contrario al último de hoy
        // (si su último registro fue "entrada", lo lógico es "salida")
        if (vinculo.ultimo_tipo === "entrada") setTipo("salida")
        else if (vinculo.ultimo_tipo === "salida") setTipo("entrada")
      }

      setIsLoading(false)
    }
    load()
  }, [token])

  const handleRegistrar = async () => {
    // Guarda de doble clic/toque: si ya hay un envío en curso, ignora
    // por completo el segundo click en vez de solo deshabilitar el
    // botón (evita la ventana de milisegundos antes de que React
    // vuelva a renderizar con el botón ya deshabilitado).
    if (submitting) return

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

    const deviceToken = obtenerDeviceToken()

    const { error: rpcError } = await supabase.rpc("checkin_registrar", {
      p_qr_token: token,
      p_device_token: deviceToken,
      p_trabajador_id: usandoManual ? null : trabajadorId,
      p_nombre_manual: usandoManual ? nombreManual.trim() : null,
      p_tipo: tipo,
    })

    if (rpcError) {
      if (rpcError.message?.includes("dispositivo_vinculado_a_otro")) {
        setError("Este celular ya está registrado para otro trabajador. Si cambiaste de celular, pídele a tu supervisor que lo actualice.")
      } else if (rpcError.message?.includes("tipo_duplicado")) {
        setError(tipo === "entrada"
          ? "Ya tienes una entrada registrada hoy sin salida. Registra tu salida primero."
          : "Ya tienes una salida registrada hoy sin una entrada después. Registra tu entrada primero.")
      } else {
        setError("Error al registrar. Intenta de nuevo.")
      }
      setSubmitting(false)
      return
    }

    if (!usandoManual) {
      setDispositivoVinculado({ id: trabajadorId, nombre: trabajadores.find(t => t.id === trabajadorId)?.nombre_completo ?? "" })
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
              setNombreManual("")
              if (dispositivoVinculado) {
                // Sigue siendo la misma persona (el celular ya está
                // vinculado) — solo se ofrece el movimiento contrario.
                setTipo(tipo === "entrada" ? "salida" : "entrada")
              } else {
                setTrabajadorId("")
                setTipo("entrada")
              }
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

          {dispositivoVinculado ? (
            <div className="space-y-2">
              <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-white">
                <div className="h-8 w-8 rounded-full bg-emerald-400 text-slate-900 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {dispositivoVinculado.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{dispositivoVinculado.nombre}</p>
                  <p className="text-xs text-emerald-400">Este celular está registrado a tu nombre</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                ¿No eres tú? Pídele a tu supervisor que actualice el registro de este celular.
              </p>
            </div>
          ) : trabajadores.length > 0 ? (
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
