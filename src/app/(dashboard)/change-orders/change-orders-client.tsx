"use client"

import { useState, useTransition } from "react"
import { GitMerge, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Plus, X, Pencil, Send, ShieldCheck, ChevronDown, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearChangeOrder, actualizarChangeOrder, validarChangeOrder, enviarChangeOrderCliente, reabrirChangeOrder, corregirChangeOrderAprobado } from "./actions"

export type ChangeOrder = {
  id: string
  numero: string | null
  titulo: string
  descripcion: string | null
  solicitado_por: string | null
  estado: string
  impacto_costo: number
  impacto_dias: number
  costo_directo: number | null
  margen_pct_aplicado: number | null
  costo_margen: number | null
  motivo_rechazo: string | null
  facturado: boolean
  cobrado: boolean
  created_at: string
  aprobado_at: string | null
  proyecto_id: string
  proyectos: { nombre: string; codigo: string } | null
  change_order_renglones?: RenglonCO[]
}

// Desglose interno (nunca visible al cliente) de en qué división y con
// qué costo de material/mano de obra se va a registrar este CO cuando
// se apruebe -- así el presupuesto y el cronograma quedan igual que
// cualquier otra actividad, en vez de una sola línea de "Subcontrato".
export type RenglonCO = {
  id?: string
  proceso_id: string
  nombre: string
  descripcion?: string | null
  costo_material: number
  costo_mano_obra: number
  duracion_dias: number
  // Cantidad real de obra de este renglón (SF, unidad, ml...) -- opcional;
  // si se deja vacío, la actividad queda con el valor de relleno de
  // siempre (1 / "CO"), igual que antes de la migración 135.
  cantidad_objetivo?: number | null
  unidad?: string | null
  orden?: number
}

export type ProcesoOpcion = { id: string; codigo: string; nombre: string }

export type ProyectoOpcion = { id: string; nombre: string; codigo: string; margen_co_pct: number }

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

// Monto exacto (con centavos y separador de miles), sin abreviar a K/M --
// para desgloses lado a lado (directo/margen/total) donde el redondeo a
// K hacía que montos distintos se vieran igual (ej. $3,535 y $4,418.75
// ambos se veían como "$4K").
function formatMonto(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ChangeOrdersClient({
  changeOrdersIniciales,
  proyectos,
  puedeCrear,
  procesosPorProyecto,
}: {
  changeOrdersIniciales: ChangeOrder[]
  proyectos: ProyectoOpcion[]
  puedeCrear: boolean
  procesosPorProyecto: Record<string, ProcesoOpcion[]>
}) {
  const [changeOrders] = useState<ChangeOrder[]>(changeOrdersIniciales)
  const [showModal, setShowModal] = useState(false)
  const [editCO, setEditCO] = useState<ChangeOrder | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [expandidoId, setExpandidoId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const ejecutar = (id: string, accion: () => Promise<{ error?: string }>) => {
    setPendingId(id)
    startTransition(async () => {
      const result = await accion()
      if (result.error) {
        alert(result.error)
      } else {
        window.location.reload()
      }
      setPendingId(null)
    })
  }

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
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandidoId(expandidoId === co.id ? null : co.id)}
                    >
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
                        <p className={cn("text-xs text-slate-500 mt-1", expandidoId !== co.id && "line-clamp-2")}>{co.descripcion}</p>
                      )}
                      {co.solicitado_por && (
                        <p className="text-xs text-slate-400 mt-1">Solicitado por: {co.solicitado_por}</p>
                      )}
                      {co.estado === "rechazado" && co.motivo_rechazo && (
                        <p className="text-xs text-red-600 mt-1">Motivo del rechazo: {co.motivo_rechazo}</p>
                      )}
                      {co.estado === "aprobado" && (
                        <p className="text-xs text-emerald-600 mt-1">
                          Aprobado por el cliente — agregado al presupuesto y al cronograma.
                          {" "}Se factura solo conforme se reporte avance en sus actividades (sin anticipo).
                        </p>
                      )}
                      {co.estado === "enviado_cliente" && (
                        <p className="text-xs text-amber-600 mt-1">Esperando decisión del cliente</p>
                      )}
                      {expandidoId === co.id && (
                        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2 cursor-default" onClick={(e) => e.stopPropagation()}>
                          {(co.change_order_renglones ?? []).length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold text-slate-500 uppercase">Desglose interno</p>
                              {[...(co.change_order_renglones ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((r, i) => (
                                <div key={r.id ?? i} className="flex justify-between gap-3 text-xs text-slate-600">
                                  <span className="truncate">{r.nombre}{r.cantidad_objetivo ? ` · ${r.cantidad_objetivo} ${r.unidad ?? ""}` : ""} · {r.duracion_dias}d</span>
                                  <span className="shrink-0">Mat. {formatMonto(Number(r.costo_material))} · M.O. {formatMonto(Number(r.costo_mano_obra))}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">Sin desglose por renglones.</p>
                          )}
                          <p className="text-xs text-slate-400">
                            Creado {new Date(co.created_at).toLocaleDateString("es-MX")}
                            {co.aprobado_at ? ` · Aprobado ${new Date(co.aprobado_at).toLocaleDateString("es-MX")}` : ""}
                          </p>
                        </div>
                      )}
                      <ChevronDown className={cn("h-3.5 w-3.5 text-slate-300 mt-1 transition-transform", expandidoId === co.id && "rotate-180")} />
                      {puedeCrear && co.estado === "aprobado" && (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setEditCO(co)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 mr-3"
                          >
                            <Pencil className="h-3 w-3" /> Corregir (conserva avance y facturas)
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              if (confirm("Reabrir este CO revierte sus actividades, partidas y prorrateo de indirectos, y lo deja En estimación para editarlo y reenviarlo al cliente. ¿Continuar?"))
                                ejecutar(co.id, () => reabrirChangeOrder(co.id))
                            }}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" /> {pendingId === co.id ? "Reabriendo..." : "Reabrir para editar"}
                          </button>
                        </div>
                      )}
                      {puedeCrear && ["detectado", "en_estimacion"].includes(co.estado) && (
                        <div className="flex gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setEditCO(co)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
                          >
                            <Pencil className="h-3 w-3" /> Modificar
                          </button>
                          {co.estado === "detectado" && (
                            <button
                              type="button"
                              onClick={() => ejecutar(co.id, () => validarChangeOrder(co.id))}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                            >
                              <ShieldCheck className="h-3 w-3" /> {pendingId === co.id ? "Validando..." : "Validar"}
                            </button>
                          )}
                          {co.estado === "en_estimacion" && (
                            <button
                              type="button"
                              onClick={() => ejecutar(co.id, () => enviarChangeOrderCliente(co.id))}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 disabled:opacity-50"
                            >
                              <Send className="h-3 w-3" /> {pendingId === co.id ? "Enviando..." : "Enviar al cliente"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      {(co.impacto_costo ?? 0) !== 0 && (
                        <div>
                          <p className="text-xs text-slate-400">Impacto costo</p>
                          <p className={cn("text-sm font-bold", co.impacto_costo > 0 ? "text-red-600" : "text-emerald-600")}>
                            {co.impacto_costo > 0 ? "+" : ""}{formatMXN(co.impacto_costo)}
                          </p>
                          {co.costo_directo != null && co.costo_margen != null && (
                            <p className="text-[11px] text-slate-400">
                              Directo {formatMonto(co.costo_directo)} + Indirectos/Contingencia/Margen ({co.margen_pct_aplicado}%) {formatMonto(co.costo_margen)}
                            </p>
                          )}
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
        <ModalRegistrarChangeOrder proyectos={proyectos} procesosPorProyecto={procesosPorProyecto} onClose={() => setShowModal(false)} />
      )}
      {editCO && (
        <ModalRegistrarChangeOrder proyectos={proyectos} procesosPorProyecto={procesosPorProyecto} onClose={() => setEditCO(null)} editCO={editCO} />
      )}
    </div>
  )
}

function ModalRegistrarChangeOrder({
  proyectos,
  procesosPorProyecto,
  onClose,
  editCO,
}: {
  proyectos: ProyectoOpcion[]
  procesosPorProyecto: Record<string, ProcesoOpcion[]>
  onClose: () => void
  editCO?: ChangeOrder
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [proyectoId, setProyectoId] = useState(editCO?.proyecto_id ?? "")
  const [costoDirecto, setCostoDirecto] = useState(editCO?.costo_directo != null ? String(editCO.costo_directo) : "")
  const [renglones, setRenglones] = useState<RenglonCO[]>(
    (editCO?.change_order_renglones ?? []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  )

  const proyectoSel = proyectos.find((p) => p.id === proyectoId)
  const margenPct = proyectoSel?.margen_co_pct ?? 0
  const directoNum = parseFloat(costoDirecto) || 0
  const margenNum = directoNum * (margenPct / 100)
  const totalNum = directoNum + margenNum
  const procesos = procesosPorProyecto[proyectoId] ?? []
  const sumaRenglones = renglones.reduce((s, r) => s + (r.costo_material || 0) + (r.costo_mano_obra || 0), 0)
  const renglonesCuadran = renglones.length === 0 || Math.abs(sumaRenglones - directoNum) < 0.01

  const agregarRenglon = () => {
    setRenglones((prev) => [
      ...prev,
      { proceso_id: procesos[0]?.id ?? "", nombre: "", costo_material: 0, costo_mano_obra: 0, duracion_dias: 1, cantidad_objetivo: null, unidad: "" },
    ])
  }
  const quitarRenglon = (i: number) => setRenglones((prev) => prev.filter((_, idx) => idx !== i))
  const actualizarRenglon = (i: number, patch: Partial<RenglonCO>) => {
    setRenglones((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    if (!renglonesCuadran) {
      setError(`El desglose por actividad (${formatMonto(sumaRenglones)}) no coincide con el costo directo (${formatMonto(directoNum)}).`)
      return
    }
    const formData = new FormData(e.currentTarget)
    formData.set("renglones", JSON.stringify(renglones.filter((r) => r.proceso_id && r.nombre.trim())))

    startTransition(async () => {
      const result = editCO
        ? (editCO.estado === "aprobado" || editCO.estado === "facturado"
            ? await corregirChangeOrderAprobado(editCO.id, formData)
            : await actualizarChangeOrder(editCO.id, formData))
        : await crearChangeOrder(formData)
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

        <h3 className="text-lg font-semibold text-slate-900 mb-5">
          {editCO ? "Modificar change order" : "Registrar change order"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Proyecto *</label>
            <select
              name="proyecto_id"
              required
              value={proyectoId}
              onChange={(e) => setProyectoId(e.target.value)}
              disabled={!!editCO}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white disabled:bg-slate-50 disabled:text-slate-400"
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
                defaultValue={editCO?.numero ?? ""}
                placeholder="Ej. CO-003"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Solicitado por</label>
              <input
                name="solicitado_por"
                defaultValue={editCO?.solicitado_por ?? ""}
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
              defaultValue={editCO?.titulo ?? ""}
              placeholder="Ej. Cambio de acabado en fachada"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              name="descripcion"
              rows={2}
              defaultValue={editCO?.descripcion ?? ""}
              placeholder="Detalle del cambio solicitado o detectado..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Costo directo -- Material + Mano de obra (USD)</label>
            <input
              name="costo_directo"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={costoDirecto}
              onChange={(e) => setCostoDirecto(e.target.value)}
              disabled={!proyectoId}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
            />
            {!proyectoId && (
              <p className="text-[11px] text-slate-400 mt-1">Selecciona primero el proyecto para calcular el margen.</p>
            )}
          </div>

          {proyectoId && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Costo directo</span>
                <span className="font-medium text-slate-700">{formatMonto(directoNum)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Indirectos + Contingencia + Margen — {margenPct}%</span>
                <span className="font-medium text-slate-700">{formatMonto(margenNum)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900">
                <span>Total (Impacto en costo)</span>
                <span>{formatMonto(totalNum)}</span>
              </div>
            </div>
          )}

          {proyectoId && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700">
                  Desglose interno por actividad (no lo ve el cliente)
                </label>
                <button
                  type="button"
                  onClick={agregarRenglon}
                  disabled={procesos.length === 0}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" /> Agregar renglón
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Opcional, pero recomendado: reparte el costo directo en las actividades/divisiones reales.
                Al aprobarse, cada renglón entra al presupuesto y al cronograma (inicio = mañana) en su
                división correspondiente, en vez de una sola línea de "Subcontrato".
              </p>

              {procesos.length === 0 && (
                <p className="text-[11px] text-amber-600">Este proyecto no tiene divisiones (procesos) registradas todavía.</p>
              )}

              {renglones.map((r, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-2 space-y-2 bg-slate-50/50">
                  <div className="flex gap-2">
                    <select
                      value={r.proceso_id}
                      onChange={(e) => actualizarRenglon(i, { proceso_id: e.target.value })}
                      className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                    >
                      <option value="">División...</option>
                      {procesos.map((p) => (
                        <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => quitarRenglon(i)} className="text-slate-400 hover:text-red-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={r.nombre}
                    onChange={(e) => actualizarRenglon(i, { nombre: e.target.value })}
                    placeholder="Nombre de la actividad"
                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">Material</label>
                      <input
                        type="number" step="0.01"
                        value={r.costo_material || ""}
                        onChange={(e) => actualizarRenglon(i, { costo_material: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Mano de obra</label>
                      <input
                        type="number" step="0.01"
                        value={r.costo_mano_obra || ""}
                        onChange={(e) => actualizarRenglon(i, { costo_mano_obra: parseFloat(e.target.value) || 0 })}
                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Días</label>
                      <input
                        type="number" step="0.01" min={0.01}
                        value={r.duracion_dias || 1}
                        onChange={(e) => actualizarRenglon(i, { duracion_dias: Math.max(0.01, parseFloat(e.target.value) || 1) })}
                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">Cantidad (opcional)</label>
                      <input
                        type="number" step="0.01"
                        value={r.cantidad_objetivo ?? ""}
                        onChange={(e) => actualizarRenglon(i, { cantidad_objetivo: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })}
                        placeholder="ej. 253"
                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Unidad</label>
                      <input
                        value={r.unidad ?? ""}
                        onChange={(e) => actualizarRenglon(i, { unidad: e.target.value })}
                        placeholder="ej. SF, ml, unidad"
                        className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Si se deja en blanco, la actividad queda con cantidad "1 CO" de relleno -- no bloquea guardar el CO.
                  </p>
                </div>
              ))}

              {renglones.length > 0 && (
                <div className={cn(
                  "flex justify-between text-xs font-medium pt-1 border-t border-slate-200",
                  renglonesCuadran ? "text-slate-600" : "text-red-600"
                )}>
                  <span>Suma del desglose</span>
                  <span>{formatMonto(sumaRenglones)} {!renglonesCuadran && `(debe ser ${formatMonto(directoNum)})`}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Impacto en días</label>
            <input
              name="impacto_dias"
              type="number"
              step="1"
              defaultValue={editCO?.impacto_dias ?? ""}
              placeholder="0"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
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
              {editCO ? "Guardar cambios" : "Registrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
