"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Building2, Loader2, AlertCircle, ChevronLeft, Wallet, ClipboardList } from "lucide-react"
import { MI_OBRA_DESEMPENO_HABILITADO } from "@/lib/feature-flags"

const DEVICE_TOKEN_KEY = "vh_checkin_device_token"

function obtenerDeviceToken(): string {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(DEVICE_TOKEN_KEY) ?? ""
}

function BotonVolver({ className = "" }: { className?: string }) {
  const router = useRouter()
  const volver = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push("/dashboard")
    }
  }
  return (
    <button
      onClick={volver}
      className={`inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors ${className}`}
    >
      <ChevronLeft className="h-3.5 w-3.5" /> Volver
    </button>
  )
}

type DiaGanancia = { fecha: string; horas: number; costo: number }

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

function formatearDia(f: string): { nombre: string; corta: string } {
  const [y, m, d] = f.split("-").map(Number)
  const fecha = new Date(y, (m ?? 1) - 1, d ?? 1)
  // getDay(): 0=domingo..6=sábado -> lo mapeamos a nuestro arreglo Lunes..Domingo
  const idx = (fecha.getDay() + 6) % 7
  return {
    nombre: DIAS_SEMANA[idx],
    corta: fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
  }
}

function esHoy(f: string, zonaHoraria: string): boolean {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: zonaHoraria || "America/Mexico_City" })
  return f === hoy
}

export default function MiDesempenoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase = createClient()

  const [proyectoNombre, setProyectoNombre] = useState("")
  const [zonaHoraria, setZonaHoraria] = useState("America/Mexico_City")
  const [dias, setDias] = useState<DiaGanancia[]>([])
  const [notFound, setNotFound] = useState(false)
  const [sinVincular, setSinVincular] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!MI_OBRA_DESEMPENO_HABILITADO) {
      setIsLoading(false)
      return
    }
    async function load() {
      const { data: proyData, error: proyError } = await supabase
        .rpc("checkin_datos_proyecto", { p_qr_token: token })

      const proy = proyData?.[0] as { nombre: string; zona_horaria?: string } | undefined
      if (proyError || !proy) {
        setNotFound(true)
        setIsLoading(false)
        return
      }
      setProyectoNombre(proy.nombre)
      if (proy.zona_horaria) setZonaHoraria(proy.zona_horaria)

      const deviceToken = obtenerDeviceToken()
      if (!deviceToken) {
        setSinVincular(true)
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase.rpc("checkin_desempeno_semana", {
        p_qr_token: token,
        p_device_token: deviceToken,
      })

      if (error) {
        setSinVincular(true)
        setIsLoading(false)
        return
      }

      setDias((data ?? []) as DiaGanancia[])
      setIsLoading(false)
    }
    load()
  }, [token])

  if (!MI_OBRA_DESEMPENO_HABILITADO) {
    return (
      <div className="relative min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="absolute top-4 left-4"><BotonVolver /></div>
        <div className="text-center max-w-xs">
          <Wallet className="h-16 w-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">No disponible por ahora</h1>
          <p className="text-slate-400 text-sm">
            Esta sección está temporalmente desactivada. Vuelve a intentarlo más adelante.
          </p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white/50 animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="relative min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="absolute top-4 left-4"><BotonVolver /></div>
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">QR no válido</h1>
          <p className="text-slate-400 text-sm">Este código QR no corresponde a ningún proyecto activo.</p>
        </div>
      </div>
    )
  }

  if (sinVincular) {
    return (
      <div className="relative min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="absolute top-4 left-4"><BotonVolver /></div>
        <div className="text-center max-w-xs">
          <AlertCircle className="h-16 w-16 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Todavía no te identificamos</h1>
          <p className="text-slate-400 text-sm mb-6">
            Registra tu entrada primero desde este mismo celular para poder mostrarte tus ganancias de la semana.
          </p>
          <Link
            href={`/check-in/${token}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Ir a registrar entrada
          </Link>
        </div>
      </div>
    )
  }

  const totalSemana = dias.reduce((s, d) => s + Number(d.costo), 0)
  const totalHoras = dias.reduce((s, d) => s + Number(d.horas), 0)

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-4 pb-10">
      <div className="max-w-lg mx-auto space-y-5">
        <div>
          <BotonVolver />
        </div>

        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 mb-3">
            <Wallet className="h-7 w-7 text-white" />
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Mi desempeño de la semana</p>
          <h1 className="text-lg font-bold text-white">{proyectoNombre}</h1>
        </div>

        {/* Total de la semana */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-center">
          <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Total esta semana</p>
          <p className="text-3xl font-bold text-white">
            ${totalSemana.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">{totalHoras.toFixed(1)} h trabajadas</p>
        </div>

        {/* Desglose por día */}
        <div className="space-y-2">
          {dias.map((d) => {
            const { nombre, corta } = formatearDia(d.fecha)
            const hoy = esHoy(d.fecha, zonaHoraria)
            return (
              <div
                key={d.fecha}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                  hoy ? "border-emerald-400/40 bg-emerald-500/10" : "border-white/10 bg-white/5"
                }`}
              >
                <div>
                  <p className={`text-sm font-semibold ${hoy ? "text-emerald-400" : "text-white"}`}>
                    {nombre} {hoy && "· hoy"}
                  </p>
                  <p className="text-xs text-slate-500">{corta}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">
                    {d.costo > 0 ? `$${Number(d.costo).toLocaleString("es-MX", { maximumFractionDigits: 0 })}` : "—"}
                  </p>
                  <p className="text-xs text-slate-500">{Number(d.horas).toFixed(1)} h</p>
                </div>
              </div>
            )
          })}
        </div>

        <Link
          href={`/mi-obra/${token}`}
          className="flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors pt-2"
        >
          <ClipboardList className="h-4 w-4" /> Ver actividades del proyecto
        </Link>

        <p className="text-center text-xs text-slate-600 pt-4 flex items-center justify-center gap-1.5">
          <Building2 className="h-3 w-3" /> Vertikall Haus — Sistema de gestión de construcción
        </p>
      </div>
    </div>
  )
}
