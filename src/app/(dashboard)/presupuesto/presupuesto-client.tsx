"use client"

import { useState, useTransition } from "react"
import { FileText, TrendingUp, TrendingDown, Layers, DollarSign, Plus, X, Pencil, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearPresupuesto, crearPartida, actualizarPartida } from "./actions"

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

// Compara códigos tipo "01.09" vs "01.10" numéricamente segmento por
// segmento, para que no se ordenen como texto plano (donde "01.10"
// quedaría antes que "01.9").
function compararCodigos(a: string | null, b: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const segsA = a.split(".").map(Number)
  const segsB = b.split(".").map(Number)
  for (let i = 0; i < Math.max(segsA.length, segsB.length); i++) {
    const diff = (segsA[i] ?? 0) - (segsB[i] ?? 0)
    if (diff !== 0 && !Number.isNaN(diff)) return diff
  }
  return a.localeCompare(b)
}

// Agrupa las partidas por división/proceso (mismo criterio que
// Actividades y Reporte Diario) -- así partidas de disciplinas
// distintas no quedan mezcladas en una sola lista plana, y dentro de
// cada división se puede seguir viendo el orden (o el orden por gasto,
// cuando el filtro "solo con gasto" está activo).
function agruparPorDivision(partidas: Partida[]): { etiqueta: string; codigo: string; items: Partida[] }[] {
  const grupos: { etiqueta: string; codigo: string; items: Partida[] }[] = []
  const indicePorEtiqueta = new Map<string, number>()
  for (const p of partidas) {
    const codigo = p.procesos?.codigo ?? ""
    const etiqueta = p.procesos?.codigo && p.procesos?.nombre
      ? `${p.procesos.codigo} — ${p.procesos.nombre}`
      : "Sin división"
    let idx = indicePorEtiqueta.get(etiqueta)
    if (idx === undefined) {
      idx = grupos.length
      indicePorEtiqueta.set(etiqueta, idx)
      grupos.push({ etiqueta, codigo, items: [] })
    }
    grupos[idx].items.push(p)
  }
  grupos.sort((a, b) => {
    if (a.etiqueta === "Sin división") return 1
    if (b.etiqueta === "Sin división") return -1
    return compararCodigos(a.codigo, b.codigo)
  })
  return grupos
}

export function PresupuestoClient({
  presupuestosIniciales,
  proyectos,
  puedeCrear,
  avancePonderadoActual,
}: {
  presupuestosIniciales: Presupuesto[]
  proyectos: ProyectoOpcion[]
  puedeCrear: boolean
  // % de avance físico ponderado más reciente del proyecto (de la
  // última corrida de generar_facturas_semanales) -- se usa para
  // mostrar, en cada partida indirecta, cuánto debería llevar
  // reconocido/facturado según el prorrateo, comparado con lo
  // realmente gastado (monto_ejercido).
  avancePonderadoActual?: number | null
}) {
  const [presupuestos] = useState<Presupuesto[]>(presupuestosIniciales)
  const [showModalVersion, setShowModalVersion] = useState(false)
  const [presupuestoParaPartida, setPresupuestoParaPartida] = useState<Presupuesto | null>(null)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  // Filtro rápido para responder "¿en qué actividad ya gasté dinero?" --
  // esconde las partidas en $0 ejercido y ordena de mayor a menor gasto
  // real, en vez de tener que buscarlas a ojo en la lista completa
  // (que por defecto sigue en el orden del presupuesto/Excel).
  const [soloConGasto, setSoloConGasto] = useState<Record<string, boolean>>({})

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
                ) : (() => {
                  const filtroActivo = !!soloConGasto[pres.id]
                  const partidasBase = filtroActivo
                    ? pres.partidas
                        .filter((p) => (p.monto_ejercido ?? 0) > 0)
                        .sort((a, b) => (b.monto_ejercido ?? 0) - (a.monto_ejercido ?? 0))
                    : [...pres.partidas].sort((a, b) => compararCodigos(a.codigo, b.codigo))
                  const visibles = expandidos[pres.id] || filtroActivo ? partidasBase : partidasBase.slice(0, 10)
                  const grupos = agruparPorDivision(visibles)
                  return (
                  <div>
                    <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50">
                      <button
                        type="button"
                        onClick={() => setSoloConGasto((prev) => ({ ...prev, [pres.id]: !prev[pres.id] }))}
                        className={cn(
                          "text-xs font-medium px-2.5 py-1 rounded-lg transition-colors",
                          filtroActivo ? "bg-blue-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {filtroActivo ? "✓ " : ""}Solo actividades con gasto real (ordenado de mayor a menor)
                      </button>
                    </div>
                    {partidasBase.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-slate-400">
                        Todavía no hay gasto real registrado en ninguna partida.
                      </div>
                    ) : (
                      <div>
                        {grupos.map((grupo) => (
                          <div key={grupo.etiqueta}>
                            <div className="px-4 py-1.5 bg-slate-50 border-b border-t border-slate-100 first:border-t-0">
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                                {grupo.etiqueta}
                              </span>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {grupo.items.map((partida) => (
                                <FilaPartida key={partida.id} partida={partida} puedeEditar={puedeCrear} avancePonderadoActual={avancePonderadoActual} />
                              ))}
                            </div>
                          </div>
                        ))}
                        {!filtroActivo && partidasBase.length > 10 && (
                          <button
                            type="button"
                            onClick={() => setExpandidos((prev) => ({ ...prev, [pres.id]: !prev[pres.id] }))}
                            className="w-full px-4 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-center font-medium border-t border-slate-100"
                          >
                            {expandidos[pres.id]
                              ? "Ver menos"
                              : `+${partidasBase.length - 10} partidas más — ver todas`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  )
                })()}
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

function FilaPartida({ partida, puedeEditar, avancePonderadoActual }: { partida: Partida; puedeEditar: boolean; avancePonderadoActual?: number | null }) {
  const [editando, setEditando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [cantidad, setCantidad] = useState(partida.cantidad != null ? String(partida.cantidad) : "")
  const [unidad, setUnidad] = useState(partida.unidad ?? "")
  const [precioUnitario, setPrecioUnitario] = useState(partida.precio_unitario != null ? String(partida.precio_unitario) : "")
  const [montoPresupuestado, setMontoPresupuestado] = useState(String(partida.monto_presupuestado ?? 0))

  const desviacion = (partida.monto_ejercido ?? 0) - (partida.monto_presupuestado ?? 0)

  // Solo para indirectos sin actividad: cuánto de esta partida ya
  // debería estar "reconocido" según el prorrateo que usa la
  // facturación automática (monto_presupuestado × % de avance físico
  // ponderado del proyecto). Se compara contra lo realmente gastado
  // (monto_ejercido) -- son dos cosas distintas: lo facturado al
  // cliente es presupuesto prorrateado, lo gastado es costo real.
  const esIndirectoSinActividad = partida.tipo_recurso === "indirecto" && !partida.actividad_id
  const esperadoSegunAvance = esIndirectoSinActividad && avancePonderadoActual != null
    ? (partida.monto_presupuestado ?? 0) * (avancePonderadoActual / 100)
    : null

  if (!editando) {
    return (
      <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-sm">
        <div className="flex-1 min-w-0">
          {partida.codigo && (
            <span className="font-mono text-xs text-slate-400 mr-2">{partida.codigo}</span>
          )}
          <span className="text-slate-800 truncate">{partida.descripcion}</span>
        </div>
        <span className={cn("text-xs px-1.5 py-0.5 rounded shrink-0", tipoColor[partida.tipo_recurso] ?? "bg-slate-100 text-slate-600")}>
          {tipoLabel[partida.tipo_recurso] ?? partida.tipo_recurso}
        </span>
        <div className="text-right shrink-0 space-x-4 flex items-center">
          <div className="text-right leading-tight">
            <p className="text-slate-500 text-xs">Presup: {formatMXN(partida.monto_presupuestado)}</p>
            <p className={cn(
              "text-xs font-semibold",
              (partida.monto_ejercido ?? 0) > 0 ? "text-blue-600" : "text-slate-300"
            )}>
              Gastado: {formatMXN(partida.monto_ejercido ?? 0)}
            </p>
            {esperadoSegunAvance != null && (
              <p className="text-[10px] text-slate-400" title="Monto presupuestado × % de avance físico del proyecto -- es lo que ya se le reconoce al cliente por esta partida, no necesariamente lo gastado real">
                Esperado (avance {avancePonderadoActual}%): {formatMXN(esperadoSegunAvance)}
              </p>
            )}
          </div>
          <span className={cn("font-medium text-xs flex items-center gap-0.5",
            desviacion > 0 ? "text-red-600" : desviacion < 0 ? "text-emerald-600" : "text-slate-500"
          )} title={desviacion > 0 ? "Gastado por encima de lo presupuestado" : desviacion < 0 ? "Todavía queda presupuesto sin ejercer" : "Sin variación"}>
            {desviacion > 0 ? <TrendingUp className="h-3 w-3" /> : desviacion < 0 ? <TrendingDown className="h-3 w-3" /> : null}
            {desviacion !== 0 ? formatMXN(Math.abs(desviacion)) : "—"}
          </span>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Editar cantidad, precio o presupuesto"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  const guardar = () => {
    setError("")
    const formData = new FormData()
    formData.set("cantidad", cantidad)
    formData.set("unidad", unidad)
    formData.set("precio_unitario", precioUnitario)
    formData.set("monto_presupuestado", montoPresupuestado)
    startTransition(async () => {
      const result = await actualizarPartida(partida.id, formData)
      if (result.error) setError(result.error)
      else window.location.reload()
    })
  }

  return (
    <div className="px-4 py-3 bg-slate-50/70 text-sm space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          {partida.codigo && (
            <span className="font-mono text-xs text-slate-400 mr-2">{partida.codigo}</span>
          )}
          <span className="text-slate-800">{partida.descripcion}</span>
        </div>
        <span className={cn("text-xs px-1.5 py-0.5 rounded shrink-0", tipoColor[partida.tipo_recurso] ?? "bg-slate-100 text-slate-600")}>
          {tipoLabel[partida.tipo_recurso] ?? partida.tipo_recurso}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Cantidad</label>
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} type="number" step="0.001"
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Unidad</label>
          <input value={unidad} onChange={(e) => setUnidad(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Precio unit.</label>
          <input value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} type="number" step="0.01"
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Presupuesto ($)</label>
          <input value={montoPresupuestado} onChange={(e) => setMontoPresupuestado(e.target.value)} type="number" step="0.01"
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        Ejercido: {formatMXN(partida.monto_ejercido ?? 0)} (se sincroniza solo desde los costos reales, no se edita aquí)
      </p>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-600">{error}</div>}
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditando(false)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={guardar} isLoading={isPending}>
          <Check className="h-3.5 w-3.5 mr-1" /> Guardar
        </Button>
      </div>
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
