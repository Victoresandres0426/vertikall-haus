"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Building2, MapPin, Loader2, AlertCircle, ChevronLeft, CalendarClock, Hammer, CalendarDays, Wallet } from "lucide-react"

type ProyectoInfo = {
  id: string
  nombre: string
  codigo: string
  ubicacion: string | null
}

type ActividadItem = {
  actividad_id: string
  codigo: string
  nombre: string
  proceso_nombre: string
  disciplina: string | null
  estado: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  unidad: string | null
  avance_porcentaje: number | null
  grupo: "en_curso" | "proximo"
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

function formatearFecha(f: string | null): string {
  if (!f) return "—"
  // Evita desfase de zona horaria al parsear "YYYY-MM-DD"
  const [y, m, d] = f.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short",
  })
}

function TarjetaActividad({ item }: { item: ActividadItem }) {
  const objetivo = item.cantidad_objetivo ?? 0
  const ejecutada = item.cantidad_ejecutada ?? 0
  const pctCantidad = objetivo > 0 ? Math.min(100, (ejecutada / objetivo) * 100) : null

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 font-mono">{item.codigo} · {item.proceso_nombre}</p>
          <h3 className="text-sm font-semibold text-white truncate">{item.nombre}</h3>
          {item.disciplina && (
            <p className="text-xs text-slate-500 capitalize mt-0.5">{item.disciplina}</p>
          )}
        </div>
        {item.grupo === "en_curso" ? (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            En curso
          </span>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Próxima
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          Plan: {formatearFecha(item.fecha_inicio_plan)} – {formatearFecha(item.fecha_fin_plan)}
        </span>
      </div>

      {item.grupo === "en_curso" && item.fecha_inicio_real && (
        <p className="text-xs text-slate-500">Inicio real: {formatearFecha(item.fecha_inicio_real)}</p>
      )}

      {/* Plan vs real: cantidad ejecutada vs objetivo */}
      {objetivo > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Avance (cantidad)</span>
            <span className="text-white font-medium">
              {ejecutada} / {objetivo} {item.unidad ?? ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${pctCantidad ?? 0}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Sin cantidad objetivo definida todavía.</p>
      )}
    </div>
  )
}

export default function MiObraPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const supabase = createClient()

  const [proyecto, setProyecto] = useState<ProyectoInfo | null>(null)
  const [actividades, setActividades] = useState<ActividadItem[]>([])
  const [notFound, setNotFound] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: proyData, error: proyError } = await supabase
        .rpc("checkin_datos_proyecto", { p_qr_token: token })

      const proy = proyData?.[0] as { proyecto_id: string; nombre: string; codigo: string; ubicacion: string | null } | undefined

      if (proyError || !proy) {
        setNotFound(true)
        setIsLoading(false)
        return
      }
      setProyecto({ id: proy.proyecto_id, nombre: proy.nombre, codigo: proy.codigo, ubicacion: proy.ubicacion })

      const { data: actsData } = await supabase
        .rpc("checkin_actividades_proyecto", { p_qr_token: token })

      setActividades((actsData ?? []) as ActividadItem[])
      setIsLoading(false)
    }
    load()
  }, [token])

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

  const enCurso = actividades.filter((a) => a.grupo === "en_curso")
  const proximas = actividades.filter((a) => a.grupo === "proximo")

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-4 pb-10">
      <div className="max-w-lg mx-auto space-y-5">
        <div>
          <BotonVolver />
        </div>

        <div className="text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 mb-3">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Actividades de la obra</p>
          <h1 className="text-xl font-bold text-white">{proyecto!.nombre}</h1>
          <p className="text-sm text-slate-400 font-mono">{proyecto!.codigo}</p>
          {proyecto!.ubicacion && (
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3" /> {proyecto!.ubicacion}
            </p>
          )}
          <Link
            href={`/mi-obra/${token}/desempeno`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Wallet className="h-3.5 w-3.5" /> Ver mi desempeño de la semana
          </Link>
        </div>

        {/* En curso */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Hammer className="h-3.5 w-3.5" /> En curso ahora
          </h2>
          {enCurso.length > 0 ? (
            <div className="space-y-2">
              {enCurso.map((a) => <TarjetaActividad key={a.actividad_id} item={a} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-500 bg-white/5 border border-white/10 rounded-xl p-4">
              No hay actividades marcadas en curso en este momento.
            </p>
          )}
        </div>

        {/* Próximos 5 días */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> Próximos 5 días
          </h2>
          {proximas.length > 0 ? (
            <div className="space-y-2">
              {proximas.map((a) => <TarjetaActividad key={a.actividad_id} item={a} />)}
            </div>
          ) : (
            <p className="text-sm text-slate-500 bg-white/5 border border-white/10 rounded-xl p-4">
              No hay actividades programadas para arrancar en los próximos 5 días.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 pt-4">
          Vertikall Haus — Sistema de gestión de construcción
        </p>
      </div>
    </div>
  )
}
