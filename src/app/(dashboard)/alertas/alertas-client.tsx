"use client"

import { useState, useTransition } from "react"
import {
  AlertTriangle, Clock, DollarSign, ChevronDown, ChevronUp,
  Zap, CheckCircle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { registrarDecision } from "./actions"

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
// Debe coincidir con el tipo Alternativa de src/lib/engine/types.ts
// (lo que realmente escribe el motor en alertas.alternativas JSONB).
type Alternativa = {
  tipo: string
  descripcion: string
  costo: number
  dias: number // negativo = días que se recuperan (reduce el atraso)
  impacto?: string
  recomendada?: boolean
}

export type AlertaDB = {
  id: string
  tipo: string
  nivel: string
  estado: string
  titulo: string
  que_ocurrio: string
  causa_probable: string | null
  desviacion_actual: string | null
  proyeccion_sin_accion: string | null
  impacto_financiero: number | null
  fecha_limite_accion: string | null
  rol_que_decide: string | null
  alternativas: Alternativa[]
  actividades: { nombre: string; codigo: string } | null
}

// ──────────────────────────────────────────────
// AlertaCard
// ──────────────────────────────────────────────
function AlertaCard({ alerta }: { alerta: AlertaDB }) {
  const [expandida, setExpandida] = useState(false)
  const [altSeleccionada, setAltSeleccionada] = useState<string | null>(null)
  const [aprobando, setAprobando] = useState(false)
  const [aprobada, setAprobada] = useState(alerta.estado === "en_revision")
  const [, startTransition] = useTransition()

  const handleAprobar = () => {
    if (!altSeleccionada) return
    const alt = alerta.alternativas.find((a) => a.tipo === altSeleccionada)
    setAprobando(true)
    startTransition(async () => {
      await registrarDecision(alerta.id, altSeleccionada, alt?.descripcion ?? altSeleccionada)
      setAprobando(false)
      setAprobada(true)
    })
  }

  if (aprobada) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
        <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">{alerta.titulo}</p>
          <p className="text-sm text-emerald-600">
            {alerta.estado === "en_revision"
              ? "En revisión — decisión ya registrada."
              : `Decisión registrada. El sistema actualizará el plan automáticamente.`}
          </p>
        </div>
      </div>
    )
  }

  const alts = alerta.alternativas ?? []

  return (
    <Card className={cn("border-l-4", alerta.nivel === "rojo" ? "border-l-red-500" : "border-l-amber-500")}>
      <CardContent className="pt-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <AlertaBadge nivel={alerta.nivel as "rojo" | "amarillo" | "verde"} />
              <Badge variant="secondary">{alerta.tipo}</Badge>
              {alerta.fecha_limite_accion && (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Actuar antes: {alerta.fecha_limite_accion}
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-900">{alerta.titulo}</h3>
            {alerta.actividades && (
              <p className="text-xs text-slate-500 mt-0.5">
                {alerta.actividades.codigo} · {alerta.actividades.nombre}
              </p>
            )}
          </div>
          <button
            onClick={() => setExpandida(!expandida)}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 shrink-0"
          >
            {expandida ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expandida ? "Menos" : "Ver detalle"}
          </button>
        </div>

        {/* Resumen */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-xs text-slate-400">Qué ocurrió</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5 line-clamp-2">{alerta.que_ocurrio}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-xs text-slate-400">Desviación</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">{alerta.desviacion_actual ?? "—"}</p>
          </div>
          <div className={cn("rounded-lg p-2.5", (alerta.impacto_financiero ?? 0) > 0 ? "bg-red-50" : "bg-slate-50")}>
            <p className="text-xs text-slate-400">Impacto financiero</p>
            <p className={cn("text-sm font-bold mt-0.5", (alerta.impacto_financiero ?? 0) > 0 ? "text-red-600" : "text-slate-600")}>
              {(alerta.impacto_financiero ?? 0) > 0
                ? `$${alerta.impacto_financiero!.toLocaleString()}`
                : "Indirecto"}
            </p>
          </div>
        </div>

        {/* Detalle expandible */}
        {expandida && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              {alerta.causa_probable && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Causa probable</p>
                  <p className="text-sm text-slate-700">{alerta.causa_probable}</p>
                </div>
              )}
              {alerta.proyeccion_sin_accion && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Proyección sin acción</p>
                  <p className="text-sm text-slate-700">{alerta.proyeccion_sin_accion}</p>
                </div>
              )}
            </div>

            {/* Alternativas */}
            {alts.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Alternativas de acción
                  {alerta.rol_que_decide && ` · Decide: ${alerta.rol_que_decide.replace("_", " ")}`}
                </p>
                <div className="space-y-2">
                  {alts.map((alt, idx) => {
                    const key = alt.tipo ?? String(idx)
                    const sel = altSeleccionada === key
                    // dias en el motor: negativo = días que se recuperan.
                    // Se muestra en positivo como "días recuperados".
                    const diasRecuperados = -(alt.dias ?? 0)
                    return (
                      <button
                        key={key}
                        onClick={() => setAltSeleccionada(key)}
                        className={cn(
                          "w-full text-left rounded-lg border p-3.5 transition-all",
                          sel
                            ? "border-slate-900 bg-slate-900 text-white"
                            : alt.recomendada
                              ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded",
                                sel ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700")}>
                                Opción {String.fromCharCode(65 + idx)}
                              </span>
                              <span className="text-sm font-semibold">{alt.descripcion}</span>
                              {alt.recomendada && !sel && (
                                <span className="text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded">Recomendada</span>
                              )}
                            </div>
                            {alt.impacto && (
                              <p className={cn("text-xs mt-1", sel ? "text-white/90" : "text-slate-700")}>
                                {alt.impacto}
                              </p>
                            )}
                          </div>
                          {((alt.costo ?? 0) !== 0 || diasRecuperados !== 0) && (
                            <div className="text-right shrink-0">
                              <p className={cn("text-xs", sel ? "text-white/60" : "text-slate-400")}>Costo</p>
                              <p className={cn("text-sm font-bold",
                                (alt.costo ?? 0) > 0
                                  ? sel ? "text-amber-300" : "text-amber-600"
                                  : sel ? "text-emerald-300" : "text-emerald-600")}>
                                {(alt.costo ?? 0) > 0 ? `+$${alt.costo.toLocaleString()}` : (alt.costo ?? 0) < 0 ? `-$${Math.abs(alt.costo).toLocaleString()}` : "Sin costo"}
                              </p>
                              {diasRecuperados !== 0 && (
                                <>
                                  <p className={cn("text-xs mt-0.5", sel ? "text-white/60" : "text-slate-400")}>Días</p>
                                  <p className={cn("text-sm font-bold",
                                    diasRecuperados > 0
                                      ? sel ? "text-emerald-300" : "text-emerald-600"
                                      : sel ? "text-red-300" : "text-red-500")}>
                                    {diasRecuperados > 0 ? `+${diasRecuperados}d` : `${diasRecuperados}d`}
                                  </p>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Botón aprobar */}
            {altSeleccionada && (
              <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3.5">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Confirmar: {alts.find((a) => a.tipo === altSeleccionada)?.descripcion}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">La decisión quedará registrada con tu nombre, rol y fecha.</p>
                </div>
                <Button
                  onClick={handleAprobar}
                  isLoading={aprobando}
                  className="bg-white text-slate-900 hover:bg-slate-100 shrink-0"
                >
                  Aprobar decisión
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────
export function AlertasClient({ alertas }: { alertas: AlertaDB[] }) {
  const [filtroNivel, setFiltroNivel] = useState<"todas" | "rojo" | "amarillo">("todas")

  const rojas = alertas.filter((a) => a.nivel === "rojo" && ["activa", "en_revision"].includes(a.estado))
  const amarillas = alertas.filter((a) => a.nivel === "amarillo" && ["activa", "en_revision"].includes(a.estado))

  const filtradas = alertas.filter((a) => {
    if (!["activa", "en_revision"].includes(a.estado)) return false
    if (filtroNivel === "todas") return true
    return a.nivel === filtroNivel
  })

  return (
    <div className="p-6 space-y-5">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setFiltroNivel(filtroNivel === "rojo" ? "todas" : "rojo")}
          className={cn("rounded-xl border p-4 text-left transition-all",
            filtroNivel === "rojo"
              ? "border-red-500 bg-red-500 text-white"
              : "bg-red-50 border-red-200 hover:border-red-300")}
        >
          <p className={cn("text-3xl font-bold", filtroNivel === "rojo" ? "text-white" : "text-red-600")}>{rojas.length}</p>
          <p className={cn("text-sm font-medium mt-0.5 flex items-center gap-1.5",
            filtroNivel === "rojo" ? "text-red-100" : "text-red-700")}>
            <span className={cn("h-2 w-2 rounded-full", filtroNivel === "rojo" ? "bg-red-200" : "bg-red-500")} />
            Alertas rojas
          </p>
        </button>
        <button
          onClick={() => setFiltroNivel(filtroNivel === "amarillo" ? "todas" : "amarillo")}
          className={cn("rounded-xl border p-4 text-left transition-all",
            filtroNivel === "amarillo"
              ? "border-amber-500 bg-amber-500 text-white"
              : "bg-amber-50 border-amber-200 hover:border-amber-300")}
        >
          <p className={cn("text-3xl font-bold", filtroNivel === "amarillo" ? "text-white" : "text-amber-600")}>{amarillas.length}</p>
          <p className={cn("text-sm font-medium mt-0.5 flex items-center gap-1.5",
            filtroNivel === "amarillo" ? "text-amber-100" : "text-amber-700")}>
            <span className={cn("h-2 w-2 rounded-full", filtroNivel === "amarillo" ? "bg-amber-200" : "bg-amber-500")} />
            Alertas amarillas
          </p>
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtradas.length === 0 ? (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay alertas {filtroNivel !== "todas" ? `de nivel ${filtroNivel}` : "activas"}</p>
          </div>
        ) : (
          filtradas.map((a) => <AlertaCard key={a.id} alerta={a} />)
        )}
      </div>
    </div>
  )
}
