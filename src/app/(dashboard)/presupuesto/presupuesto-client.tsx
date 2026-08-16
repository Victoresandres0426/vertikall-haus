"use client"

import { useState, useTransition } from "react"
import { FileText, TrendingUp, TrendingDown, Layers, DollarSign, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearPresupuesto, crearPartida } from "./actions"

type Partida = {
  id: string
  codigo: string | null
  descripcion: string
  tipo_recurso: string
  cantidad: number | null
  unidad: string | null
  precio_unitario: number | null
  monto_presupuestado: number
  monto_comprometido: number
  monto_ejercido: number
  proceso_id: string | null
  actividad_id: string | null
  procesos: { nombre: string; codigo: string } | null
}

export type Presupuesto = {
  id: string
  version: number
  nombre_version: string
  es_baseline_actual: boolean
  monto_total: number | null
  proyectos: { nombre: string; codigo: string } | null
  partidas: Partida[]
}

export type ProyectoOpcion = { id: string; nombre: string; codigo: string }

const tipoLabel: Record<string, string> = {
  mano_obra: "Mano de obra",
  material: "Material",
  equipo: "Equipo",
  subcontrato: "Subcontrato",
  indirecto: "Indirecto",
}

const tipoColor: Record<string, string> = {
  mano_obra: "bg-blue-100 text-blue-700",
  material: "bg-amber-100 text-amber-700",
  equipo: "bg-purple-100 text-purple-700",
  subcontrato: "bg-orange-100 text-orange-700",
  indirecto: "bg-slate-100 text-slate-600",
}

function formatMXN(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

export function PresupuestoClient({
  presupuestosIniciales,
  proyectos,
  puedeCrear,
}: {
  presupuestosIniciales: Presupuesto[]
  proyectos: ProyectoOpcion[]
  puedeCrear: boolean
}) {
  const [presupuestos] = useState<Presupuesto[]>(presupuestosIniciales)
  const [showModalVersion, setShowModalVersion] = useState(false)
  const [presupuestoParaPartida, setPresupuestoParaPartida] = useState<Presupuesto | null>(null)

  const totalPresupuestado = presupuestos.reduce((s, p) => s + (p.monto_total ?? 0), 0)
  const totalPartidas = presupuestos.reduce((s, p) => s + p.partidas.length, 0)
  const totalEjercido = presupuestos.reduce(
    (s, p) => s + p.partidas.reduce((sp, pa) => sp + (pa.monto_ejercido ?? 0), 0),
    0
  )

  return (
    <div className="p-6 space-y-6">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setShowModalVersion(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva versión de presupuesto
          </Button>
        </div>
      )}

      {presupuestos.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin presupuestos</p>
            <p className="text-sm mt-1 max-w-sm mx-auto">
              Crea una versión de presupuesto y agrega partidas manualmente,
              o próximamente impórtalas desde Excel.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: FileText, label: "Versiones", desc: "Maneja múltiples versiones y baseline del presupuesto" },
              { icon: Layers, label: "Partidas", desc: "Desglose por partida, proceso y tipo de recurso" },
              { icon: DollarSign, label: "Control", desc: "Compara presupuestado vs comprometido vs ejercido" },
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
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Presupuestado", val: formatMXN(totalPresupuestado), color: "text-slate-900" },
              { label: "Ejercido", val: formatMXN(totalEjercido), color: "text-blue-600" },
              {
                label: "Variación",
                val: formatMXN(Math.abs(totalPresupuestado - totalEjercido)),
                color: totalEjercido > totalPresupuestado ? "text-red-600" : "text-emerald-600",
              },
              { label: "% ejercido", val: totalPresupuestado > 0 ? `${Math.round((totalEjercido / totalPresupuestado) * 100)}%` : "—", color: "text-slate-700" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {presupuestos.map((pres) => {
            const ejercidoTotal = pres.partidas.reduce((s, p) => s + (p.monto_ejercido ?? 0), 0)
            const presTotal = pres.monto_total ?? pres.partidas.reduce((s, p) => s + (p.monto_presupuestado ?? 0), 0)
            const pctEjercido = presTotal > 0 ? Math.round((ejercidoTotal / presTotal) * 100) : 0

            const porTipo: Record<string, { presup: number; ejercido: number }> = {}
            for (const p of pres.partidas) {
              if (!porTipo[p.tipo_recurso]) porTipo[p.tipo_recurso] = { presup: 0, ejercido: 0 }
              porTipo[p.tipo_recurso].presup += p.monto_presupuestado ?? 0
              porTipo[p.tipo_recurso].ejercido += p.monto_ejercido ?? 0
            }

            return (
              <div key={pres.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {pres.proyectos && (
                      <span className="font-mono text-xs text-slate-500">{pres.proyectos.codigo}</span>
                    )}
                    <h3 className="text-sm font-semibold text-slate-800">
                      {pres.proyectos?.nombre ?? "Proyecto"} — v{pres.version}: {pres.nombre_version}
                    </h3>
                    {pres.es_baseline_actual && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Baseline</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      <p className="font-bold text-slate-900">{formatMXN(presTotal)}</p>
                      <p className={cn("font-medium", pctEjercido > 100 ? "text-red-600" : "text-slate-500")}>
                        {pctEjercido}% ejercido
                      </p>
                    </div>
                    {puedeCrear && (
                      <Button size="sm" variant="outline" onClick={() => setPresupuestoParaPartida(pres)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Partida
                      </Button>
                    )}
                  </div>
                </div>

                {Object.keys(porTipo).length > 0 && (
                  <div className="px-4 py-3 grid grid-cols-3 sm:grid-cols-5 gap-3 border-b border-slate-100">
                    {Object.entries(porTipo).map(([tipo, vals]) => (
                      <div key={tipo} className="text-center">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded", tipoColor[tipo] ?? "bg-slate-100 text-slate-600")}>
                          {tipoLabel[tipo] ?? tipo}
                        </span>
                        <p className="text-sm font-bold text-slate-900 mt-1">{formatMXN(vals.presup)}</p>
                        <p className="text-xs text-slate-400">{formatMXN(vals.ejercido)} ejec.</p>
                      </div>
                    ))}
                  </div>
                )}

                {pres.partidas.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    Sin partidas todavía. Usa &quot;Partida&quot; para agregar la primera.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {pres.partidas.slice(0, 10).map((partida) => {
                      const desviacion = (partida.monto_ejercido ?? 0) - (partida.monto_presupuestado ?? 0)
                      return (
                        <div key={partida.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm">
                          <div className="flex-1 min-w-0">
                            {partida.codigo && (
                              <span className="font-mono text-xs text-slate-400 mr-2">{partida.codigo}</span>
                            )}
                            <span className="text-slate-800 truncate">{partida.descripcion}</span>
                          </div>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded shrink-0", tipoColor[partida.tipo_recurso] ?? "bg-slate-100 text-slate-600")}>
                            {tipoLabel[partida.tipo_recurso] ?? partida.tipo_recurso}
                          </span>
                          <div className="text-right shrink-0 space-x-4 flex">
                            <span className="text-slate-500 text-xs">{formatMXN(partida.monto_presupuestado)}</span>
                            <span className={cn("font-medium text-xs flex items-center gap-0.5",
                              desviacion > 0 ? "text-red-600" : desviacion < 0 ? "text-emerald-600" : "text-slate-500"
                            )}>
                              {desviacion > 0 ? <TrendingUp className="h-3 w-3" /> : desviacion < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                              {desviacion !== 0 ? formatMXN(Math.abs(desviacion)) : "—"}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    {pres.partidas.length > 10 && (
                      <div className="px-4 py-2 text-xs text-slate-400 text-center">
                        +{pres.partidas.length - 10} partidas más
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {showModalVersion && (
        <ModalNuevaVersion proyectos={proyectos} onClose={() => setShowModalVersion(false)} />
      )}
      {presupuestoParaPartida && (
        <ModalAgregarPartida
          presupuesto={presupuestoParaPartida}
          onClose={() => setPresupuestoParaPartida(null)}
        />
      )}
    </div>
  )
}

function ModalNuevaVersion({ proyectos, onClose }: { proyectos: ProyectoOpcion[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await crearPresupuesto(formData)
      if (result.error) setError(result.error)
      else { onClose(); window.location.reload() }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
        <button className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50" onClick={onClose} disabled={isPending}>
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900 mb-5">Nueva versión de presupuesto</h3>
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre de la versión</label>
            <input name="nombre_version" placeholder="Ej. Baseline Original" defaultValue="Baseline Original" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button type="submit" className="flex-1" isLoading={isPending}>Crear</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModalAgregarPartida({ presupuesto, onClose }: { presupuesto: Presupuesto; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    formData.set("presupuesto_id", presupuesto.id)
    startTransition(async () => {
      const result = await crearPartida(formData)
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
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Agregar partida</h3>
        <p className="text-xs text-slate-400 mb-5">v{presupuesto.version} — {presupuesto.nombre_version}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción *</label>
            <input name="descripcion" required placeholder="Ej. Cimentación — concreto f'c=250" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código</label>
              <input name="codigo" placeholder="Ej. P-001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de recurso *</label>
              <select name="tipo_recurso" required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
                <option value="">Selecciona</option>
                <option value="mano_obra">Mano de obra</option>
                <option value="material">Material</option>
                <option value="equipo">Equipo</option>
                <option value="subcontrato">Subcontrato</option>
                <option value="indirecto">Indirecto</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cantidad</label>
              <input name="cantidad" type="number" step="0.001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unidad</label>
              <input name="unidad" placeholder="m3, kg..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Precio unit.</label>
              <input name="precio_unitario" type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Monto total (opcional, se calcula si dejas vacío y diste cantidad × precio)</label>
            <input name="monto_total" type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
            <Button type="submit" className="flex-1" isLoading={isPending}>Agregar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
