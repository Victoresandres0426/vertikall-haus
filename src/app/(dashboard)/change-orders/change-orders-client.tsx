"use client"

import { useState, useTransition } from "react"
import { GitMerge, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearChangeOrder } from "./actions"

export type ChangeOrder = {
  id: string
  numero: string | null
  titulo: string
  descripcion: string | null
  solicitado_por: string | null
  estado: string
  impacto_costo: number
  impacto_dias: number
  facturado: boolean
  cobrado: boolean
  created_at: string
  aprobado_at: string | null
  proyectos: { nombre: string; codigo: string } | null
}

export type ProyectoOpcion = { id: string; nombre: string; codigo: string }

const estadoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  detectado: { label: "Detectado", color: "bg-slate-100 text-slate-700", icon: AlertCircle },
  en_estimacion: { label: "En estimación", color: "bg-blue-100 text-blue-700", icon: Clock },
  enviado_cliente: { label: "Enviado cliente", color: "bg-amber-100 text-amber-700", icon: Clock },
  aprobado: { label: "Aprobado", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  rechazado: { label: "Rechazado", color: "bg-red-100 text-red-700", icon: XCircle },
  facturado: { label: "Facturado", color: "bg-purple-100 text-purple-700", icon: DollarSign },
  cobrado: { label: "Cobrado", color: "bg-emerald-200 text-emerald-800", icon: CheckCircle },
}

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export function ChangeOrdersClient({
  changeOrdersIniciales,
  proyectos,
  puedeCrear,
}: {
  changeOrdersIniciales: ChangeOrder[]
  proyectos: ProyectoOpcion[]
  puedeCrear: boolean
}) {
  const [changeOrders] = useState<ChangeOrder[]>(changeOrdersIniciales)
  const [showModal, setShowModal] = useState(false)

  const aprobados = changeOrders.filter((co) => ["aprobado", "facturado", "cobrado"].includes(co.estado))
  const pendientes = changeOrders.filter((co) => ["detectado", "en_estimacion", "enviado_cliente"].includes(co.estado))
  const impactoTotal = aprobados.reduce((s, co) => s + (co.impacto_costo ?? 0), 0)
  const diasImpacto = aprobados.reduce((s, co) => s + (co.impacto_dias ?? 0), 0)

  return (
    <div className="p-6 space-y-6">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Registrar change order
          </Button>
        </div>
      )}

      {changeOrders.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
            <GitMerge className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin change orders</p>
            <p className="text-sm mt-1 max-w-sm mx-auto">
              Los change orders se crean cuando el cliente solicita cambios de alcance
              o cuando se detectan condiciones imprevistas en obra.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">Flujo de un Change Order</p>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.values(estadoConfig).map((cfg, i, arr) => (
                <div key={cfg.label} className="flex items-center gap-2">
                  <span className={cn("text-xs px-2 py-1 rounded-full font-medium", cfg.color)}>
                    {cfg.label}
                  </span>
                  {i < arr.length - 1 && <span className="text-slate-300">→</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total", val: changeOrders.length, color: "text-slate-900" },
              { label: "Pendientes", val: pendientes.length, color: "text-amber-600" },
              { label: "Impacto aprobado", val: formatMXN(impactoTotal), color: impactoTotal > 0 ? "text-red-600" : "text-emerald-600" },
              { label: "Días de impacto", val: `+${diasImpacto}d`, color: diasImpacto > 0 ? "text-red-600" : "text-slate-500" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {changeOrders.map((co) => {
              const cfg = estadoConfig[co.estado] ?? estadoConfig.detectado
              const Icon = cfg.icon
              return (
                <div key={co.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {co.numero && (
                          <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {co.numero}
                          </span>
                        )}
                        {co.proyectos && (
                          <span className="text-xs text-slate-400">{co.proyectos.codigo}</span>
                        )}
                        <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium", cfg.color)}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                        {co.facturado && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Facturado</span>
                        )}
                        {co.cobrado && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Cobrado</span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">{co.titulo}</h3>
                      {co.proyectos && (
                        <p className="text-xs text-slate-400 mt-0.5">{co.proyectos.nombre}</p>
                      )}
                      {co.descripcion && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{co.descripcion}</p>
                      )}
                      {co.solicitado_por && (
                        <p className="text-xs text-slate-400 mt-1">Solicitado por: {co.solicitado_por}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      {(co.impacto_costo ?? 0) !== 0 && (
                        <div>
                          <p className="text-xs text-slate-400">Impacto costo</p>
                          <p className={cn("text-sm font-bold", co.impacto_costo > 0 ? "text-red-600" : "text-emerald-600")}>
                            {co.impacto_costo > 0 ? "+" : ""}{formatMXN(co.impacto_costo)}
                          </p>
                        </div>
                      )}
                      {(co.impacto_dias ?? 0) !== 0 && (
                        <div>
                          <p className="text-xs text-slate-400">Días</p>
                          <p className={cn("text-sm font-bold", co.impacto_dias > 0 ? "text-amber-600" : "text-emerald-600")}>
                            {co.impacto_dias > 0 ? "+" : ""}{co.impacto_dias}d
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-slate-300">
                        {new Date(co.created_at).toLocaleDateString("es-MX")}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showModal && (
        <ModalRegistrarChangeOrder proyectos={proyectos} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}

function ModalRegistrarChangeOrder({
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
      const result = await crearChangeOrder(formData)
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

        <h3 className="text-lg font-semibold text-slate-900 mb-5">Registrar change order</h3>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Número</label>
              <input
                name="numero"
                placeholder="Ej. CO-003"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Solicitado por</label>
              <input
                name="solicitado_por"
                placeholder="Ej. Cliente / Arquitecto"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Título *</label>
            <input
              name="titulo"
              required
              placeholder="Ej. Cambio de acabado en fachada"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              name="descripcion"
              rows={2}
              placeholder="Detalle del cambio solicitado o detectado..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Impacto en costo (MXN)</label>
              <input
                name="impacto_costo"
                type="number"
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
                step="1"
                placeholder="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
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
