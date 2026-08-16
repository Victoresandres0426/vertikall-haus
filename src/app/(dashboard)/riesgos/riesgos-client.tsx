"use client"

import { useState, useTransition } from "react"
import { Shield, AlertTriangle, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearRiesgo } from "./actions"

export type Riesgo = {
  id: string
  titulo: string
  descripcion: string | null
  categoria: string | null
  probabilidad: number | null
  impacto_costo: number
  impacto_dias: number
  exposicion: number | null
  estado: string
  mitigacion: string | null
  created_at: string
  proyectos: { nombre: string; codigo: string } | null
  actividades: { nombre: string; codigo: string } | null
}

export type ProyectoOpcion = { id: string; nombre: string; codigo: string }

const estadoConfig: Record<string, { label: string; color: string }> = {
  identificado: { label: "Identificado", color: "bg-amber-100 text-amber-700" },
  en_mitigacion: { label: "En mitigación", color: "bg-blue-100 text-blue-700" },
  resuelto: { label: "Resuelto", color: "bg-emerald-100 text-emerald-700" },
  materializado: { label: "Materializado", color: "bg-red-100 text-red-700" },
  aceptado: { label: "Aceptado", color: "bg-slate-100 text-slate-600" },
}

const categoriaEmoji: Record<string, string> = {
  tecnico: "⚙️",
  financiero: "💰",
  logistico: "🚛",
  externo: "🌐",
  humano: "👷",
}

function exposicionLabel(exp: number | null) {
  if (exp === null) return { label: "—", cls: "text-slate-400" }
  if (exp >= 500_000) return { label: "Muy alto", cls: "text-red-700 font-semibold" }
  if (exp >= 100_000) return { label: "Alto", cls: "text-red-600 font-semibold" }
  if (exp >= 30_000) return { label: "Medio", cls: "text-amber-600 font-medium" }
  return { label: "Bajo", cls: "text-emerald-600" }
}

function formatMXN(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function matrizColor(prob: number, impacto: number): string {
  const score = prob * impacto
  if (score >= 0.6) return "bg-red-500"
  if (score >= 0.3) return "bg-amber-500"
  if (score >= 0.1) return "bg-yellow-400"
  return "bg-emerald-400"
}

export function RiesgosClient({
  riesgosIniciales,
  proyectos,
  puedeCrear,
}: {
  riesgosIniciales: Riesgo[]
  proyectos: ProyectoOpcion[]
  puedeCrear: boolean
}) {
  const [riesgos] = useState<Riesgo[]>(riesgosIniciales)
  const [showModal, setShowModal] = useState(false)

  const activos = riesgos.filter((r) => !["resuelto", "aceptado"].includes(r.estado))
  const materializados = riesgos.filter((r) => r.estado === "materializado")
  const exposicionTotal = riesgos.reduce((s, r) => s + (r.exposicion ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Registrar riesgo
          </Button>
        </div>
      )}

      {riesgos.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin riesgos registrados</p>
            <p className="text-sm mt-1 max-w-sm mx-auto">
              Los riesgos identificados en la planificación o en obra se registran aquí
              con su probabilidad, impacto y plan de mitigación.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Matriz de riesgo (Probabilidad × Impacto)</p>
            <div className="grid grid-cols-4 gap-1 max-w-xs">
              {[0.8, 0.5, 0.3, 0.1].map((prob) =>
                [0.1, 0.3, 0.5, 0.8].map((imp) => (
                  <div
                    key={`${prob}-${imp}`}
                    className={cn("h-10 w-full rounded opacity-70", matrizColor(prob, imp))}
                  />
                ))
              )}
            </div>
            <div className="flex gap-4 mt-3 text-xs">
              {[
                { color: "bg-emerald-400", label: "Bajo" },
                { color: "bg-yellow-400", label: "Medio-bajo" },
                { color: "bg-amber-500", label: "Medio-alto" },
                { color: "bg-red-500", label: "Alto" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className={cn("h-3 w-3 rounded", item.color)} />
                  <span className="text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total riesgos", val: riesgos.length, color: "text-slate-900" },
              { label: "Activos", val: activos.length, color: "text-amber-600" },
              { label: "Materializados", val: materializados.length, color: "text-red-600" },
              { label: "Exposición total", val: formatMXN(exposicionTotal), color: "text-red-700" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {riesgos.map((riesgo) => {
              const estadoCfg = estadoConfig[riesgo.estado] ?? estadoConfig.identificado
              const { label: expLabel, cls: expCls } = exposicionLabel(riesgo.exposicion)
              const probPct = riesgo.probabilidad != null ? Math.round(riesgo.probabilidad * 100) : null

              return (
                <div key={riesgo.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-4">
                    {riesgo.probabilidad != null && riesgo.impacto_costo > 0 && (
                      <div className={cn(
                        "h-12 w-2 rounded-full shrink-0 mt-0.5",
                        matrizColor(riesgo.probabilidad, Math.min(1, riesgo.impacto_costo / 1_000_000))
                      )} />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {riesgo.categoria && (
                          <span className="text-xs">
                            {categoriaEmoji[riesgo.categoria] ?? "📌"} {riesgo.categoria}
                          </span>
                        )}
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", estadoCfg.color)}>
                          {estadoCfg.label}
                        </span>
                        {riesgo.proyectos && (
                          <span className="text-xs text-slate-400">{riesgo.proyectos.codigo}</span>
                        )}
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900">{riesgo.titulo}</h3>
                      {riesgo.proyectos && (
                        <p className="text-xs text-slate-400 mt-0.5">{riesgo.proyectos.nombre}</p>
                      )}
                      {riesgo.actividades && (
                        <p className="text-xs text-slate-400">
                          Actividad: {riesgo.actividades.codigo} · {riesgo.actividades.nombre}
                        </p>
                      )}
                      {riesgo.descripcion && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{riesgo.descripcion}</p>
                      )}
                      {riesgo.mitigacion && (
                        <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                          <p className="text-xs text-emerald-700">
                            <span className="font-semibold">Mitigación: </span>{riesgo.mitigacion}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-right space-y-2">
                      <div>
                        <p className="text-xs text-slate-400">Probabilidad</p>
                        <p className="text-sm font-bold text-slate-700">
                          {probPct != null ? `${probPct}%` : "—"}
                        </p>
                      </div>
                      {riesgo.impacto_costo > 0 && (
                        <div>
                          <p className="text-xs text-slate-400">Impacto</p>
                          <p className="text-sm font-bold text-red-600">{formatMXN(riesgo.impacto_costo)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-slate-400">Exposición</p>
                        <p className={cn("text-sm", expCls)}>{expLabel}</p>
                      </div>
                      {riesgo.impacto_dias > 0 && (
                        <div>
                          <p className="text-xs text-slate-400">Días riesgo</p>
                          <p className="text-sm font-medium text-amber-600">+{riesgo.impacto_dias}d</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showModal && (
        <ModalRegistrarRiesgo proyectos={proyectos} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}

function ModalRegistrarRiesgo({
  proyectos,
  onClose,
}: {
  proyectos: ProyectoOpcion[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await crearRiesgo(formData)
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        window.location.reload()
      }
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
          onClick={onClose}
          disabled={isPending}
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-slate-900 mb-5">Registrar riesgo</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proyecto *</label>
            <select
              name="proyecto_id"
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              <option value="">Selecciona un proyecto</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Título *</label>
            <input
              name="titulo"
              required
              placeholder="Ej. Retraso en entrega de acero estructural"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              name="descripcion"
              rows={2}
              placeholder="Detalles del riesgo identificado..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
              <select
                name="categoria"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                <option value="">Sin especificar</option>
                <option value="tecnico">Técnico</option>
                <option value="financiero">Financiero</option>
                <option value="logistico">Logístico</option>
                <option value="externo">Externo</option>
                <option value="humano">Humano</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Probabilidad (0–1)</label>
              <input
                name="probabilidad"
                type="number"
                min="0"
                max="1"
                step="0.05"
                placeholder="0.30"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Impacto en costo (MXN)</label>
              <input
                name="impacto_costo"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Impacto en días</label>
              <input
                name="impacto_dias"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mitigación propuesta</label>
            <textarea
              name="mitigacion"
              rows={2}
              placeholder="Acción planeada para reducir probabilidad o impacto..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" isLoading={isPending}>
              Registrar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
