"use client"

import { useState, useTransition } from "react"
import { Plus, X, CheckCircle2, Receipt, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  crearFacturaCliente,
  crearFacturaProveedor,
  crearProveedorRapido,
  marcarFacturaClienteCobrada,
  marcarFacturaProveedorPagada,
  generarFacturacionAutomatica,
  type FacturaGenerada,
} from "./actions"

export type FacturaCliente = {
  id: string
  numero: string | null
  descripcion: string | null
  hito_asociado: string | null
  monto: number
  retencion: number
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
}: {
  facturasClienteIniciales: FacturaCliente[]
  facturasProveedorIniciales: FacturaProveedor[]
  proyectos: ProyectoOpcion[]
  proveedores: ProveedorOpcion[]
  puedeCrear: boolean
}) {
  const [tab, setTab] = useState<"cliente" | "proveedor">("cliente")
  const [facturasCliente] = useState(facturasClienteIniciales)
  const [facturasProveedor] = useState(facturasProveedorIniciales)
  const [showModalCliente, setShowModalCliente] = useState(false)
  const [showModalProveedor, setShowModalProveedor] = useState(false)
  const [showModalAuto, setShowModalAuto] = useState(false)

  const totalCxC = facturasCliente.reduce((s, f) => s + f.monto, 0)
  const totalCobrado = facturasCliente.reduce((s, f) => s + f.monto_cobrado, 0)
  const totalCxP = facturasProveedor.reduce((s, f) => s + f.monto, 0)
  const totalPagado = facturasProveedor.reduce((s, f) => s + f.monto_pagado, 0)

  return (
    <div className="p-6 space-y-6">
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
            Cliente (CxC) · {facturasCliente.length}
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
        facturasCliente.length === 0 ? (
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
                {facturasCliente.map((f) => (
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
          Calcula el avance real de cada proyecto activo (ponderado por presupuesto) y genera una factura por la diferencia contra lo ya facturado como estimación. Esto mismo corre solo cada lunes; este botón sirve para generarlo ahora o para forzar una corrida puntual.
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
              No había avance nuevo que facturar en ningún proyecto (o ya se generó una estimación reciente).
            </div>
            <Button type="button" className="w-full" onClick={handleCerrar}>Cerrar</Button>
          </>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {resultado.map((f) => (
                <div key={f.numero_generado} className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-emerald-800">{f.numero_generado}</p>
                    <p className="text-xs text-emerald-600">{f.proyecto_codigo}</p>
                  </div>
                  <p className="font-semibold text-emerald-700">{formatMXN(f.monto_generado)}</p>
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
      <td className="px-3 py-2.5 text-slate-600">{f.descripcion ?? f.numero ?? "—"}</td>
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
