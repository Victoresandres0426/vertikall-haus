"use client"

import { useState, useTransition } from "react"
import { Plus, X, CheckCircle2, Receipt, Zap, Pencil, Trash2, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  crearFacturaCliente,
  crearFacturaProveedor,
  crearProveedorRapido,
  marcarFacturaClienteCobrada,
  marcarFacturaProveedorPagada,
  generarFacturacionAutomatica,
  aprobarFacturaCliente,
  editarBorradorFacturaCliente,
  descartarBorradorFacturaCliente,
  type FacturaGenerada,
} from "./actions"

export type DesglosePeriodo = {
  periodo_inicio: string
  periodo_fin: string
  avance_pct: number
  monto_bruto: number
}

export type DesgloseActividad = {
  actividad_id: string
  actividad_codigo: string | null
  actividad_nombre: string
  avance_pct: number
  monto_bruto: number
  // Ausentes en facturas generadas antes de esta migración -- por eso
  // son opcionales.
  monto_amortizado?: number
  monto_neto?: number
}

export type FacturaCliente = {
  id: string
  numero: string | null
  descripcion: string | null
  hito_asociado: string | null
  monto: number
  retencion: number
  amortizacion_anticipo: number
  periodo_inicio: string | null
  periodo_fin: string | null
  desglose_periodos: DesglosePeriodo[] | null
  desglose_actividades: DesgloseActividad[] | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_cobro: string | null
  estado: string
  monto_cobrado: number
  proyectos: { nombre: string; codigo: string } | null
}

export type FacturaProveedor = {
  id: string
  numero: string | null
  descripcion: string | null
  monto: number
  fecha_recepcion: string | null
  fecha_vencimiento: string | null
  fecha_pago: string | null
  estado: string
  monto_pagado: number
  proyectos: { nombre: string; codigo: string } | null
  proveedores: { nombre: string } | null
}

export type ProyectoOpcion = { id: string; nombre: string; codigo: string }
export type ProveedorOpcion = { id: string; nombre: string }

function formatMXN(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

// Para revisar/aprobar un borrador el monto exacto importa (no sirve ver
// "$6K" cuando en realidad son $5,774.24) -- este formato nunca abrevia.
function formatExacto(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const estadoColor: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-500",
  enviada: "bg-blue-100 text-blue-700",
  parcialmente_pagada: "bg-amber-100 text-amber-700",
  pagada: "bg-emerald-100 text-emerald-700",
  vencida: "bg-red-100 text-red-700",
  en_disputa: "bg-orange-100 text-orange-700",
}

export function FacturasClient({
  facturasClienteIniciales,
  facturasProveedorIniciales,
  proyectos,
  proveedores,
  puedeCrear,
  proyectoActivoPresupuestoVenta,
}: {
  facturasClienteIniciales: FacturaCliente[]
  facturasProveedorIniciales: FacturaProveedor[]
  proyectos: ProyectoOpcion[]
  proveedores: ProveedorOpcion[]
  puedeCrear: boolean
  proyectoActivoPresupuestoVenta?: number | null
}) {
  const [tab, setTab] = useState<"cliente" | "proveedor">("cliente")
  const [facturasCliente] = useState(facturasClienteIniciales)
  const [facturasProveedor] = useState(facturasProveedorIniciales)
  const [showModalCliente, setShowModalCliente] = useState(false)
  const [showModalProveedor, setShowModalProveedor] = useState(false)
  const [showModalAuto, setShowModalAuto] = useState(false)

  // Los borradores (estimaciones automáticas todavía sin aprobar) no
  // cuentan como CxC real ni aparecen en la tabla normal -- se muestran
  // aparte, en su propio panel, hasta que se aprueban o se descartan.
  const borradores = facturasCliente.filter((f) => f.estado === "borrador")
  const facturasClienteResueltas = facturasCliente.filter((f) => f.estado !== "borrador")

  // "CxC (por cobrar)" / "CxP (por pagar)" deben ser el SALDO pendiente
  // (facturado - ya cobrado/pagado), no el total facturado -- si no, una
  // factura ya cobrada al 100% sigue apareciendo como "por cobrar".
  const totalFacturadoCliente = facturasClienteResueltas.reduce((s, f) => s + f.monto, 0)
  const totalCobrado = facturasClienteResueltas.reduce((s, f) => s + f.monto_cobrado, 0)
  const totalCxC = Math.max(totalFacturadoCliente - totalCobrado, 0)
  const totalFacturadoProveedor = facturasProveedor.reduce((s, f) => s + f.monto, 0)
  const totalPagado = facturasProveedor.reduce((s, f) => s + f.monto_pagado, 0)
  const totalCxP = Math.max(totalFacturadoProveedor - totalPagado, 0)

  return (
    <div className="p-6 space-y-6">
      {borradores.length > 0 && (
        <PanelBorradores
          borradores={borradores}
          totalYaFacturado={totalFacturadoCliente}
          presupuestoVenta={proyectoActivoPresupuestoVenta ?? null}
        />
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "CxC (por cobrar)", val: formatMXN(totalCxC), color: "text-emerald-600" },
          { label: "Cobrado", val: formatMXN(totalCobrado), color: "text-blue-600" },
          { label: "CxP (por pagar)", val: formatMXN(totalCxP), color: "text-red-500" },
          { label: "Pagado", val: formatMXN(totalPagado), color: "text-slate-700" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            onClick={() => setTab("cliente")}
            className={cn("px-4 py-1.5 text-sm rounded-md font-medium transition-colors",
              tab === "cliente" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800")}
          >
            Cliente (CxC) · {facturasClienteResueltas.length}
          </button>
          <button
            onClick={() => setTab("proveedor")}
            className={cn("px-4 py-1.5 text-sm rounded-md font-medium transition-colors",
              tab === "proveedor" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800")}
          >
            Proveedor (CxP) · {facturasProveedor.length}
          </button>
        </div>
        {puedeCrear && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowModalAuto(true)}>
              <Zap className="h-4 w-4 mr-1" /> Generar estimación semanal
            </Button>
            <Button onClick={() => (tab === "cliente" ? setShowModalCliente(true) : setShowModalProveedor(true))}>
              <Plus className="h-4 w-4 mr-1" /> Nueva factura
            </Button>
          </div>
        )}
      </div>

      {tab === "cliente" ? (
        facturasClienteResueltas.length === 0 ? (
          <EstadoVacio texto="Sin facturas de cliente todavía." />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-2 text-slate-500 font-medium">Proyecto</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Descripción</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Vence</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium">Monto</th>
                  <th className="text-right px-3 py-2 text-slate-500 font-medium">Cobrado</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Estado</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {facturasClienteResueltas.map((f) => (
                  <FilaCliente key={f.id} f={f} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : facturasProveedor.length === 0 ? (
        <EstadoVacio texto="Sin facturas de proveedor todavía." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Proyecto</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Proveedor</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Vence</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium">Monto</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium">Pagado</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {facturasProveedor.map((f) => (
                <FilaProveedor key={f.id} f={f} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModalCliente && (
        <ModalFacturaCliente proyectos={proyectos} onClose={() => setShowModalCliente(false)} />
      )}
      {showModalProveedor && (
        <ModalFacturaProveedor proyectos={proyectos} proveedores={proveedores} onClose={() => setShowModalProveedor(false)} />
      )}
      {showModalAuto && (
        <ModalGenerarAutomatico onClose={() => setShowModalAuto(false)} />
      )}
    </div>
  )
}

function ModalGenerarAutomatico({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<FacturaGenerada[] | null>(null)

  const handleGenerar = () => {
    setError("")
    startTransition(async () => {
      const result = await generarFacturacionAutomatica()
      if (result.error) setError(result.error)
      else setResultado(result.facturas ?? [])
    })
  }

  const handleCerrar = () => {
    if (resultado && resultado.length > 0) window.location.reload()
    else onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !isPending) handleCerrar() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50" onClick={handleCerrar} disabled={isPending}>
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Generar estimación semanal</h3>
        <p className="text-sm text-slate-500 mb-5">
          Calcula el avance real de cada proyecto activo (ponderado por presupuesto) y genera un <strong>borrador</strong> por la diferencia contra lo ya facturado como estimación. El borrador no se le envía a nadie todavía -- queda pendiente de que lo revises y lo apruebes desde el panel de arriba. Esto mismo corre solo cada lunes; este botón sirve para generarlo ahora o para forzar una corrida puntual.
        </p>

        {resultado === null ? (
          <>
            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-4">{error}</div>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button type="button" className="flex-1" isLoading={isPending} onClick={handleGenerar}>Generar ahora</Button>
            </div>
          </>
        ) : resultado.length === 0 ? (
          <>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600 mb-4">
              No había avance nuevo que facturar en ningún proyecto (o ya hay un borrador pendiente de aprobar, o ya se generó una estimación reciente).
            </div>
            <Button type="button" className="w-full" onClick={handleCerrar}>Cerrar</Button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">Se generaron estos borradores. Revísalos abajo antes de aprobarlos.</p>
            <div className="space-y-2 mb-4">
              {resultado.map((f) => (
                <div key={f.numero_generado} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-amber-800">{f.numero_generado}</p>
                      <p className="text-xs text-amber-600">{f.proyecto_codigo}</p>
                    </div>
                    <p className="font-semibold text-amber-700">{formatExacto(f.monto_generado)}</p>
                  </div>
                  {f.amortizacion_generada > 0 && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Incluye {formatExacto(f.amortizacion_generada)} descontado por amortización de anticipo
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" className="w-full" onClick={handleCerrar}>Listo</Button>
          </>
        )}
      </div>
    </div>
  )
}

function EstadoVacio({ texto }: { texto: string }) {
  return (
    <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
      <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{texto}</p>
    </div>
  )
}

function PanelBorradores({
  borradores,
  totalYaFacturado,
  presupuestoVenta,
}: {
  borradores: FacturaCliente[]
  totalYaFacturado: number
  presupuestoVenta: number | null
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          {borradores.length === 1 ? "1 estimación pendiente de aprobar" : `${borradores.length} estimaciones pendientes de aprobar`}
        </h3>
      </div>
      <p className="text-xs text-amber-700">
        Estas estimaciones automáticas todavía no se le han enviado al cliente ni cuentan en el CxC. Revísalas y apruébalas para que se vuelvan visibles en su portal (y se le mande el correo, si está configurado).
      </p>
      <div className="space-y-2">
        {borradores.map((f) => (
          <TarjetaBorrador key={f.id} f={f} totalYaFacturado={totalYaFacturado} presupuestoVenta={presupuestoVenta} />
        ))}
      </div>
    </div>
  )
}

function TarjetaBorrador({
  f,
  totalYaFacturado,
  presupuestoVenta,
}: {
  f: FacturaCliente
  totalYaFacturado: number
  presupuestoVenta: number | null
}) {
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [montoEdit, setMontoEdit] = useState(String(f.monto))
  const [descEdit, setDescEdit] = useState(f.descripcion ?? "")
  const [error, setError] = useState("")

  const bruto = f.monto + f.amortizacion_anticipo

  // Totales por columna -- de las líneas del desglose si existen (más
  // exacto), si no de los campos de arriba de la factura (estimaciones
  // viejas sin desglose).
  const totalEjecutado = f.desglose_actividades?.length
    ? f.desglose_actividades.reduce((s, d) => s + d.monto_bruto, 0)
    : bruto
  const totalAmortizado = f.desglose_actividades?.length
    ? f.desglose_actividades.reduce((s, d) => s + (d.monto_amortizado ?? 0), 0)
    : f.amortizacion_anticipo
  const totalACobrarTabla = f.desglose_actividades?.length
    ? f.desglose_actividades.reduce((s, d) => s + (d.monto_neto ?? d.monto_bruto), 0)
    : f.monto

  // Resumen de facturación del contrato completo (no solo esta factura).
  const facturadoAcumulado = totalYaFacturado + f.monto
  const porCobrar = presupuestoVenta != null ? Math.max(presupuestoVenta - facturadoAcumulado, 0) : null

  const handleAprobar = () => {
    if (!window.confirm(`¿Aprobar y enviar esta estimación de ${formatExacto(f.monto)} al cliente?`)) return
    setError("")
    startTransition(async () => {
      const result = await aprobarFacturaCliente(f.id)
      if (result.error) { setError(result.error); return }
      window.location.reload()
    })
  }

  const handleDescartar = () => {
    if (!window.confirm("¿Descartar este borrador? El avance que representa no se pierde: la próxima corrida automática lo vuelve a incluir.")) return
    setError("")
    startTransition(async () => {
      const result = await descartarBorradorFacturaCliente(f.id)
      if (result.error) { setError(result.error); return }
      window.location.reload()
    })
  }

  const handleGuardarEdicion = () => {
    setError("")
    const monto = parseFloat(montoEdit)
    if (isNaN(monto) || monto < 0) { setError("Monto inválido"); return }
    startTransition(async () => {
      const result = await editarBorradorFacturaCliente(f.id, { monto, descripcion: descEdit })
      if (result.error) { setError(result.error); return }
      window.location.reload()
    })
  }

  return (
    <div className="bg-white border border-amber-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            <span className="font-mono text-[10px] text-slate-400 mr-1">{f.proyectos?.codigo}</span>
            {f.proyectos?.nombre} · {f.numero}
          </p>
          {f.periodo_inicio && f.periodo_fin && (
            <p className="text-[11px] text-slate-500 mt-0.5">Período: {f.periodo_inicio} al {f.periodo_fin}</p>
          )}
          {!editando && <p className="text-xs text-slate-600 mt-1">{f.descripcion}</p>}
        </div>
      </div>

      {f.desglose_periodos && f.desglose_periodos.length > 1 && (
        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-md p-2 space-y-1">
          <p className="text-[10px] font-medium text-slate-500">Esta estimación cubre más de un período:</p>
          {f.desglose_periodos.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] text-slate-600">
              <span>{d.periodo_inicio} al {d.periodo_fin} · {d.avance_pct}% avance</span>
              <span className="font-medium">{formatExacto(d.monto_bruto)}</span>
            </div>
          ))}
        </div>
      )}

      {f.desglose_actividades && f.desglose_actividades.length > 0 && (
        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-100">
              <tr className="text-slate-500">
                <th className="text-left font-medium px-2 py-1.5">Renglón</th>
                <th className="text-right font-medium px-2 py-1.5">% avance</th>
                <th className="text-right font-medium px-2 py-1.5">Ejecutado</th>
                <th className="text-right font-medium px-2 py-1.5">Amort. anticipo</th>
                <th className="text-right font-medium px-2 py-1.5">A cobrar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {f.desglose_actividades.map((d) => {
                const tieneAmortizacion = d.monto_amortizado !== undefined && d.monto_neto !== undefined
                return (
                  <tr key={d.actividad_id} className="text-slate-600">
                    <td className="px-2 py-1.5">
                      {d.actividad_codigo ? `${d.actividad_codigo} — ` : ""}{d.actividad_nombre}
                    </td>
                    <td className="text-right px-2 py-1.5 text-slate-400">{d.avance_pct}%</td>
                    <td className="text-right px-2 py-1.5">{formatExacto(d.monto_bruto)}</td>
                    <td className="text-right px-2 py-1.5 text-amber-600">
                      {tieneAmortizacion && d.monto_amortizado! > 0 ? `−${formatExacto(d.monto_amortizado!)}` : "—"}
                    </td>
                    <td className="text-right px-2 py-1.5 font-medium text-slate-800">
                      {formatExacto(tieneAmortizacion ? d.monto_neto! : d.monto_bruto)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-semibold text-slate-800 border-t border-slate-200">
                <td className="px-2 py-1.5" colSpan={2}>Total</td>
                <td className="text-right px-2 py-1.5">
                  <span className="block text-[9px] font-normal text-slate-400">Ejecutado</span>
                  {formatExacto(totalEjecutado)}
                </td>
                <td className="text-right px-2 py-1.5 text-amber-700">
                  <span className="block text-[9px] font-normal text-slate-400">Amort. anticipo</span>
                  {totalAmortizado > 0 ? `−${formatExacto(totalAmortizado)}` : "—"}
                </td>
                <td className="text-right px-2 py-1.5">
                  <span className="block text-[9px] font-normal text-slate-400">A cobrar</span>
                  {formatExacto(totalACobrarTabla)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {(!f.desglose_actividades || f.desglose_actividades.length === 0) && (
        <p className="mt-2 text-[10px] text-slate-400 italic">Sin desglose por actividad (esta estimación se generó antes de que existiera ese detalle).</p>
      )}

      <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 max-w-[220px] space-y-0.5">
        <div className="flex items-center justify-between">
          <span>Contratado</span>
          <span className="text-slate-700 font-medium">{presupuestoVenta != null ? formatExacto(presupuestoVenta) : "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Facturado acumulado</span>
          <span className="text-slate-700 font-medium">−{formatExacto(facturadoAcumulado)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 mt-1 pt-1">
          <span className="font-medium text-slate-600">Por cobrar</span>
          <span className="text-slate-800 font-semibold">{porCobrar != null ? formatExacto(porCobrar) : "—"}</span>
        </div>
      </div>

      {editando ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Descripción</label>
            <input value={descEdit} onChange={(e) => setDescEdit(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-slate-500 mb-1">Monto neto a facturar</label>
            <input type="number" step="0.01" value={montoEdit} onChange={(e) => setMontoEdit(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <p className="text-[10px] text-slate-400 mt-1">Si lo bajas (ej. porque incluía algo que no corresponde a este proyecto), la diferencia no se pierde: queda pendiente y la próxima estimación automática la vuelve a incluir.</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setEditando(false)} disabled={isPending}>Cancelar</Button>
            <Button type="button" className="flex-1 h-8 text-xs" isLoading={isPending} onClick={handleGuardarEdicion}>Guardar</Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex gap-3 mt-3">
            <button onClick={() => setEditando(true)} disabled={isPending} className="text-slate-600 hover:text-slate-900 disabled:opacity-50 inline-flex items-center gap-1 text-xs">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            <button onClick={handleDescartar} disabled={isPending} className="text-red-600 hover:text-red-800 disabled:opacity-50 inline-flex items-center gap-1 text-xs">
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </button>
            <button onClick={handleAprobar} disabled={isPending} className="ml-auto text-emerald-700 hover:text-emerald-900 disabled:opacity-50 inline-flex items-center gap-1 text-xs font-medium">
              <Send className="h-3.5 w-3.5" /> Aprobar y enviar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function FilaCliente({ f }: { f: FacturaCliente }) {
  const [isPending, startTransition] = useTransition()
  const pendiente = f.monto - f.monto_cobrado

  const handleCobrar = () => {
    const input = window.prompt(`Monto cobrado (pendiente: ${formatMXN(pendiente)})`, String(pendiente))
    if (!input) return
    const monto = parseFloat(input)
    if (isNaN(monto) || monto <= 0) return
    startTransition(async () => {
      await marcarFacturaClienteCobrada(f.id, monto)
      window.location.reload()
    })
  }

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2.5">
        <span className="font-mono text-[10px] text-slate-400 mr-1">{f.proyectos?.codigo}</span>
        <span className="text-slate-700">{f.proyectos?.nombre}</span>
      </td>
      <td className="px-3 py-2.5 text-slate-600">
        {f.descripcion ?? f.numero ?? "—"}
        {f.amortizacion_anticipo > 0 && (
          <span className="block text-[10px] text-amber-600 mt-0.5">
            −{formatMXN(f.amortizacion_anticipo)} amortización de anticipo
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-slate-500">{f.fecha_vencimiento ?? "—"}</td>
      <td className="px-3 py-2.5 text-right text-slate-700">{formatMXN(f.monto)}</td>
      <td className="px-3 py-2.5 text-right text-emerald-600">{formatMXN(f.monto_cobrado)}</td>
      <td className="px-3 py-2.5">
        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", estadoColor[f.estado] ?? "bg-slate-100 text-slate-600")}>
          {f.estado}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        {f.estado !== "pagada" && (
          <button onClick={handleCobrar} disabled={isPending} className="text-blue-600 hover:text-blue-800 disabled:opacity-50 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar cobrada
          </button>
        )}
      </td>
    </tr>
  )
}

function FilaProveedor({ f }: { f: FacturaProveedor }) {
  const [isPending, startTransition] = useTransition()
  const pendiente = f.monto - f.monto_pagado

  const handlePagar = () => {
    const input = window.prompt(`Monto pagado (pendiente: ${formatMXN(pendiente)})`, String(pendiente))
    if (!input) return
    const monto = parseFloat(input)
    if (isNaN(monto) || monto <= 0) return
    startTransition(async () => {
      await marcarFacturaProveedorPagada(f.id, monto)
      window.location.reload()
    })
  }

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2.5">
        <span className="font-mono text-[10px] text-slate-400 mr-1">{f.proyectos?.codigo}</span>
        <span className="text-slate-700">{f.proyectos?.nombre}</span>
      </td>
      <td className="px-3 py-2.5 text-slate-600">{f.proveedores?.nombre ?? "—"}</td>
      <td className="px-3 py-2.5 text-slate-500">{f.fecha_vencimiento ?? "—"}</td>
      <td className="px-3 py-2.5 text-right text-slate-700">{formatMXN(f.monto)}</td>
      <td className="px-3 py-2.5 text-right text-red-500">{formatMXN(f.monto_pagado)}</td>
      <td className="px-3 py-2.5">
        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", estadoColor[f.estado] ?? "bg-slate-100 text-slate-600")}>
          {f.estado}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        {f.estado !== "pagada" && (
          <button onClick={handlePagar} disabled={isPending} className="text-blue-600 hover:text-blue-800 disabled:opacity-50 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Marcar pagada
          </button>
        )}
      </td>
    </tr>
  )
}

function ModalFacturaCliente({ proyectos, onClose }: { proyectos: ProyectoOpcion[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await crearFacturaCliente(formData)
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
        <h3 className="text-lg font-semibold text-slate-900 mb-5">Nueva factura de cliente</h3>
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción / hito</label>
            <input name="descripcion" placeholder="Ej. Anticipo 30%, avance de obra..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Número</label>
              <input name="numero" placeholder="Ej. F-001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
              <p className="text-[10px] text-slate-400 mt-1">Si es un anticipo, usa un número que empiece con &quot;ANT-&quot; (ej. ANT-{"{"}proyecto{"}"}) para que la facturación automática lo detecte y lo descuente de las estimaciones futuras.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Monto *</label>
              <input name="monto" type="number" step="0.01" required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de emisión</label>
              <input name="fecha_emision" type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de vencimiento</label>
              <input name="fecha_vencimiento" type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
          </div>
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

function ModalFacturaProveedor({ proyectos, proveedores, onClose }: { proyectos: ProyectoOpcion[]; proveedores: ProveedorOpcion[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [nuevoProveedor, setNuevoProveedor] = useState(false)
  const [nombreProveedor, setNombreProveedor] = useState("")
  const [creandoProveedor, setCreandoProveedor] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await crearFacturaProveedor(formData)
      if (result.error) setError(result.error)
      else { onClose(); window.location.reload() }
    })
  }

  const handleCrearProveedor = () => {
    if (!nombreProveedor.trim()) return
    setCreandoProveedor(true)
    startTransition(async () => {
      const result = await crearProveedorRapido(nombreProveedor)
      setCreandoProveedor(false)
      if (result.error) setError(result.error)
      else window.location.reload()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50" onClick={onClose} disabled={isPending}>
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900 mb-5">Nueva factura de proveedor</h3>
        {proveedores.length === 0 && !nuevoProveedor ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              No hay proveedores registrados todavía. Crea uno primero para poder cargar facturas.
            </p>
            <Button type="button" onClick={() => setNuevoProveedor(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo proveedor
            </Button>
          </div>
        ) : nuevoProveedor ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre del proveedor *</label>
              <input
                value={nombreProveedor}
                onChange={(e) => setNombreProveedor(e.target.value)}
                placeholder="Ej. Cementos del Norte"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setNuevoProveedor(false)} disabled={creandoProveedor}>Cancelar</Button>
              <Button type="button" className="flex-1" isLoading={creandoProveedor} onClick={handleCrearProveedor}>Crear</Button>
            </div>
          </div>
        ) : (
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Proveedor *</label>
              <div className="flex gap-2">
                <select name="proveedor_id" required className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
                  <option value="">Selecciona un proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <Button type="button" variant="outline" onClick={() => setNuevoProveedor(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
              <input name="descripcion" placeholder="Ej. Compra de cemento, servicio de grúa..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Número</label>
                <input name="numero" placeholder="Ej. FP-001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Monto *</label>
                <input name="monto" type="number" step="0.01" required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de recepción</label>
                <input name="fecha_recepcion" type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de vencimiento</label>
                <input name="fecha_vencimiento" type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900" />
              </div>
            </div>
            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
              <Button type="submit" className="flex-1" isLoading={isPending}>Guardar</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
