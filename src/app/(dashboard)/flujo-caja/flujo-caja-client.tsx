"use client"

import { useState, useTransition } from "react"
import { TrendingUp, TrendingDown, Banknote, AlertTriangle, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearProyeccionSemanal } from "./actions"

export type Proyeccion = {
  id: string
  semana: string
  ingresos_plan: number
  ingresos_real: number
  egresos_plan: number
  egresos_real: number
  saldo_proyectado: number
  alerta_liquidez: boolean
  proyectos: { nombre: string; codigo: string } | null
}

export type ProyectoOpcion = { id: string; nombre: string; codigo: string }

function formatMXN(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export function FlujoCajaClient({
  proyeccionesIniciales,
  proyectos,
  puedeCrear,
}: {
  proyeccionesIniciales: Proyeccion[]
  proyectos: ProyectoOpcion[]
  puedeCrear: boolean
}) {
  const [proyecciones] = useState<Proyeccion[]>(proyeccionesIniciales)
  const [showModal, setShowModal] = useState(false)

  const alertasLiquidez = proyecciones.filter((p) => p.alerta_liquidez)
  const ingresosPlanTotal = proyecciones.reduce((s, p) => s + (p.ingresos_plan ?? 0), 0)
  const egresosPlanTotal = proyecciones.reduce((s, p) => s + (p.egresos_plan ?? 0), 0)
  const ingresosRealTotal = proyecciones.reduce((s, p) => s + (p.ingresos_real ?? 0), 0)
  const saldoMin = proyecciones.reduce((min, p) => Math.min(min, p.saldo_proyectado ?? 0), Infinity)

  const proyectoMap = new Map<string, { nombre: string; codigo: string; semanas: Proyeccion[] }>()
  for (const p of proyecciones) {
    const pid = p.proyectos?.nombre ?? "Sin proyecto"
    if (!proyectoMap.has(pid)) {
      proyectoMap.set(pid, { nombre: p.proyectos?.nombre ?? "—", codigo: p.proyectos?.codigo ?? "", semanas: [] })
    }
    proyectoMap.get(pid)!.semanas.push(p)
  }

  return (
    <div className="p-6 space-y-6">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Cargar semana
          </Button>
        </div>
      )}

      {proyecciones.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
            <Banknote className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin proyecciones de flujo</p>
            <p className="text-sm mt-1 max-w-sm mx-auto">
              Carga ingresos y egresos semana a semana, planeados y reales.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Banknote, label: "Ingresos vs Egresos", desc: "Compara plan vs real semana a semana" },
              { icon: TrendingUp, label: "Saldo proyectado", desc: "Anticipa semanas de liquidez crítica" },
              { icon: AlertTriangle, label: "Alertas de liquidez", desc: "Notificaciones cuando el saldo proyectado es negativo" },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <item.icon className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {alertasLiquidez.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  {alertasLiquidez.length} semana{alertasLiquidez.length !== 1 ? "s" : ""} con alerta de liquidez
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  Semanas: {alertasLiquidez.map((p) => new Date(p.semana).toLocaleDateString("es-MX", { month: "short", day: "numeric" })).join(", ")}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Ingresos plan", val: formatMXN(ingresosPlanTotal), color: "text-emerald-600", icon: TrendingUp },
              { label: "Egresos plan", val: formatMXN(egresosPlanTotal), color: "text-red-600", icon: TrendingDown },
              { label: "Ingresos reales", val: formatMXN(ingresosRealTotal), color: "text-blue-600", icon: Banknote },
              { label: "Saldo mín.", val: saldoMin === Infinity ? "—" : formatMXN(saldoMin), color: saldoMin < 0 ? "text-red-600" : "text-slate-900", icon: AlertTriangle },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {Array.from(proyectoMap.entries()).map(([, proy]) => (
            <div key={proy.nombre} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="font-mono text-xs text-slate-500">{proy.codigo}</span>
                <h3 className="text-sm font-semibold text-slate-800">{proy.nombre}</h3>
                <span className="text-xs text-slate-400">· {proy.semanas.length} semanas</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2 text-slate-500 font-medium">Semana</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">Ing. plan</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">Ing. real</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">Egr. plan</th>
                      <th className="text-right px-3 py-2 text-slate-500 font-medium">Egr. real</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-medium">Saldo proy.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {proy.semanas.map((sem) => {
                      const fecha = new Date(sem.semana)
                      const label = fecha.toLocaleDateString("es-MX", { month: "short", day: "numeric" })
                      const saldoNeg = (sem.saldo_proyectado ?? 0) < 0
                      return (
                        <tr key={sem.id} className={cn("hover:bg-slate-50 transition-colors", sem.alerta_liquidez ? "bg-red-50" : "")}>
                          <td className="px-4 py-2.5 font-medium text-slate-700">
                            {label}
                            {sem.alerta_liquidez && (
                              <AlertTriangle className="inline h-3 w-3 text-red-500 ml-1" />
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-600">{formatMXN(sem.ingresos_plan)}</td>
                          <td className={cn("px-3 py-2.5 text-right font-medium",
                            sem.ingresos_real >= sem.ingresos_plan ? "text-emerald-600" : "text-amber-600")}>
                            {formatMXN(sem.ingresos_real)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-red-500">{formatMXN(sem.egresos_plan)}</td>
                          <td className={cn("px-3 py-2.5 text-right font-medium",
                            sem.egresos_real <= sem.egresos_plan ? "text-emerald-600" : "text-red-600")}>
                            {formatMXN(sem.egresos_real)}
                          </td>
                          <td className={cn("px-4 py-2.5 text-right font-bold", saldoNeg ? "text-red-600" : "text-slate-700")}>
                            {formatMXN(sem.saldo_proyectado)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {showModal && (
        <ModalCargarSemana proyectos={proyectos} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}

function ModalCargarSemana({ proyectos, onClose }: { proyectos: ProyectoOpcion[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await crearProyeccionSemanal(formData)
      if (result.error) setError(result.error)
      else { onClose(); window.location.reload() }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50" onClick={onClose} disabled={isPending}>
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900 mb-5">Cargar semana de flujo de caja</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proyecto *</label>
            <select name="proyecto_id" required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
              <option value="">Selecciona un proyecto</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Semana (fecha de inicio) *</label>
            <input name="semana" type="date" required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ingresos plan</label>
              <input name="ingresos_plan" type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ingresos real</label>
              <input name="ingresos_real" type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Egresos plan</label>
              <input name="egresos_plan" type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Egresos real</label>
              <input name="egresos_real" type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
          </div>
          <p className="text-xs text-slate-400">El saldo proyectado y la alerta de liquidez se calculan automáticamente al guardar.</p>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button type="submit" className="flex-1" isLoading={isPending}>Guardar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
