"use client"

import { useState, useTransition } from "react"
import { Receipt, Plus, X, Trash2, ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { crearFacturaGasto, eliminarFacturaGasto, analizarReciboFoto, type LineaGastoInput } from "./gastos-actions"

export type ActividadOpcion = { id: string; codigo: string; nombre: string }

export type LineaCostoReal = {
  id: string
  factura_id: string | null
  actividad_id: string | null
  tipo_recurso: string
  descripcion: string
  unidad: string | null
  cantidad: number | null
  precio_unitario: number | null
  tax: number | null
  monto: number
  actividades: { codigo: string; nombre: string } | null
}

export type FacturaGasto = {
  id: string
  fecha: string
  lugar: string
  referencia: string | null
  foto_referencia: string | null
  foto_url?: string | null
  subtotal: number
  tax_total: number
  total: number
  lineas: LineaCostoReal[]
}

const tipoLabel: Record<string, string> = {
  material: "Material",
  equipo: "Equipo",
  subcontrato: "Servicio/Subcontrato",
  indirecto: "Indirecto",
}

function formatoMoneda(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
}

function formatoFecha(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

type LineaDraft = {
  actividadId: string
  tipoRecurso: LineaGastoInput["tipoRecurso"]
  descripcion: string
  unidad: string
  cantidad: string
  precioUnitario: string
  tax: string
}

const lineaVacia: LineaDraft = {
  actividadId: "",
  tipoRecurso: "material",
  descripcion: "",
  unidad: "",
  cantidad: "1",
  precioUnitario: "0",
  tax: "0",
}

export function GastosClient({
  facturasIniciales,
  actividadesOpciones,
  puedeCrear,
  proyectoActivoId,
}: {
  facturasIniciales: FacturaGasto[]
  actividadesOpciones: ActividadOpcion[]
  puedeCrear: boolean
  proyectoActivoId: string | null
}) {
  const [showModal, setShowModal] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleEliminar = (facturaId: string) => {
    if (!confirm("¿Borrar esta factura y todas sus líneas? Esto también quita el gasto del costo real de las actividades.")) return
    startTransition(async () => {
      const res = await eliminarFacturaGasto(facturaId)
      if (res.error) alert(res.error)
      else window.location.reload()
    })
  }

  if (!proyectoActivoId) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
        <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p>Selecciona un proyecto para ver sus gastos.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Registrar gasto
          </Button>
        </div>
      )}

      {facturasIniciales.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
          <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-lg font-medium">Sin gastos registrados todavía</p>
          <p className="text-sm mt-1">Registra tu primera factura de material o servicio.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {facturasIniciales.map((f) => {
            const abierta = expandida === f.id
            return (
              <div key={f.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandida(abierta ? null : f.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <Receipt className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {f.lugar} <span className="text-slate-400 font-normal">· {formatoFecha(f.fecha)}</span>
                    </p>
                    <p className="text-xs text-slate-400">
                      {f.lineas.length} línea{f.lineas.length !== 1 ? "s" : ""}
                      {f.referencia ? ` · Ref: ${f.referencia}` : ""}
                      {f.foto_url ? (
                        <>
                          {" · "}
                          <a
                            href={f.foto_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-500 hover:text-slate-800 underline"
                          >
                            📎 ver foto del recibo
                          </a>
                        </>
                      ) : f.foto_referencia ? (
                        ` · 📎 ${f.foto_referencia}`
                      ) : (
                        ""
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 shrink-0">{formatoMoneda(f.total)}</p>
                </button>

                {abierta && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 uppercase tracking-wide">
                            <th className="pb-1.5 pr-3 font-medium">Descripción</th>
                            <th className="pb-1.5 pr-3 font-medium">Tipo</th>
                            <th className="pb-1.5 pr-3 font-medium text-right">Cant.</th>
                            <th className="pb-1.5 pr-3 font-medium">UM</th>
                            <th className="pb-1.5 pr-3 font-medium text-right">P. unit.</th>
                            <th className="pb-1.5 pr-3 font-medium text-right">Tax</th>
                            <th className="pb-1.5 pr-3 font-medium text-right">Monto</th>
                            <th className="pb-1.5 font-medium">Actividad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {f.lineas.map((l) => (
                            <tr key={l.id}>
                              <td className="py-1.5 pr-3 text-slate-700">{l.descripcion}</td>
                              <td className="py-1.5 pr-3 text-slate-500">{tipoLabel[l.tipo_recurso] ?? l.tipo_recurso}</td>
                              <td className="py-1.5 pr-3 text-right text-slate-600">{l.cantidad ?? "—"}</td>
                              <td className="py-1.5 pr-3 text-slate-500">{l.unidad ?? "—"}</td>
                              <td className="py-1.5 pr-3 text-right text-slate-600">{l.precio_unitario != null ? formatoMoneda(l.precio_unitario) : "—"}</td>
                              <td className="py-1.5 pr-3 text-right text-slate-600">{l.tax ? formatoMoneda(l.tax) : "—"}</td>
                              <td className="py-1.5 pr-3 text-right font-medium text-slate-900">{formatoMoneda(l.monto)}</td>
                              <td className="py-1.5 text-slate-600">
                                {l.actividades ? `${l.actividades.codigo} — ${l.actividades.nombre}` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-100 font-medium text-slate-700">
                            <td colSpan={5}></td>
                            <td className="pt-1.5 pr-3 text-right text-slate-400">Subtotal / Tax</td>
                            <td className="pt-1.5 text-right">{formatoMoneda(f.subtotal)} / {formatoMoneda(f.tax_total)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {puedeCrear && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleEliminar(f.id)}
                          disabled={isPending}
                          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Borrar factura
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <ModalRegistrarGasto
          proyectoId={proyectoActivoId}
          actividadesOpciones={actividadesOpciones}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

function ModalRegistrarGasto({
  proyectoId,
  actividadesOpciones,
  onClose,
}: {
  proyectoId: string
  actividadesOpciones: ActividadOpcion[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [lugar, setLugar] = useState("")
  const [referencia, setReferencia] = useState("")
  const [fotoReferencia, setFotoReferencia] = useState("")
  const [lineas, setLineas] = useState<LineaDraft[]>([{ ...lineaVacia }])

  const [analizando, setAnalizando] = useState(false)
  const [nombreFoto, setNombreFoto] = useState("")
  const [avisoIA, setAvisoIA] = useState("")

  const handleSeleccionarFoto = (file: File | null) => {
    if (!file) return
    setNombreFoto(file.name)
    setAvisoIA("")
    setAnalizando(true)
    ;(async () => {
      const fd = new FormData()
      fd.append("foto", file)
      const res = await analizarReciboFoto(fd, proyectoId)
      setAnalizando(false)

      if (res.rutaFoto) setFotoReferencia(res.rutaFoto)

      if (res.error) {
        setAvisoIA(res.error)
        return
      }

      const datos = res.data
      if (!datos) return

      if (datos.lugar) setLugar(datos.lugar)
      if (datos.fecha) setFecha(datos.fecha)
      if (datos.referencia) setReferencia(datos.referencia)

      if (datos.lineas.length > 0) {
        setLineas(
          datos.lineas.map((l) => ({
            actividadId: "",
            tipoRecurso: "material",
            descripcion: l.descripcion,
            unidad: l.unidad || "",
            cantidad: String(l.cantidad ?? 1),
            precioUnitario: String(l.precioUnitario ?? 0),
            tax: String(l.tax ?? 0),
          }))
        )
        setAvisoIA(`Se encontraron ${datos.lineas.length} línea${datos.lineas.length !== 1 ? "s" : ""}. Verifica los datos y asigna una actividad a cada una.`)
      } else {
        setAvisoIA("La foto se archivó, pero no se pudo reconocer ningún artículo. Agrégalos a mano.")
      }
    })()
  }

  const actualizarLinea = (idx: number, campo: keyof LineaDraft, valor: string) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)))
  }
  const agregarLinea = () => setLineas((prev) => [...prev, { ...lineaVacia }])
  const quitarLinea = (idx: number) => setLineas((prev) => prev.filter((_, i) => i !== idx))

  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0) + (Number(l.tax) || 0), 0)

  const handleSubmit = () => {
    setError("")
    if (!lugar.trim()) return setError("El lugar de compra es obligatorio")
    if (lineas.some((l) => !l.descripcion.trim())) return setError("Todas las líneas necesitan descripción")
    if (lineas.some((l) => !l.actividadId)) return setError("Todas las líneas necesitan una actividad asignada")

    startTransition(async () => {
      const res = await crearFacturaGasto({
        proyectoId,
        fecha,
        lugar,
        referencia: referencia || null,
        fotoReferencia: fotoReferencia || null,
        lineas: lineas.map((l) => ({
          actividadId: l.actividadId,
          tipoRecurso: l.tipoRecurso,
          descripcion: l.descripcion,
          unidad: l.unidad || null,
          cantidad: Number(l.cantidad) || 0,
          precioUnitario: Number(l.precioUnitario) || 0,
          tax: Number(l.tax) || 0,
        })),
      })
      if (res.error) setError(res.error)
      else window.location.reload()
    })
  }

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
          onClick={onClose}
          disabled={isPending}
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-slate-900 mb-1">Registrar gasto</h3>
        <p className="text-xs text-slate-400 mb-5">Una factura o recibo, con sus artículos/servicios asignados a actividades.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fecha *</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Lugar de compra *</label>
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej. Home Depot - Miami Beach" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Referencia / folio</label>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej. ticket 0251-..." className={inputCls} />
          </div>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
            <ImageIcon className="h-3.5 w-3.5" /> Foto del recibo (opcional)
          </label>
          <div className="flex items-center gap-2">
            <label
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors shrink-0",
                analizando && "opacity-50 pointer-events-none"
              )}
            >
              {nombreFoto ? "Cambiar foto" : "Elegir foto..."}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={analizando}
                onChange={(e) => handleSeleccionarFoto(e.target.files?.[0] ?? null)}
              />
            </label>
            {nombreFoto && <span className="text-xs text-slate-500 truncate">{nombreFoto}</span>}
            {analizando && <span className="text-xs text-slate-400 animate-pulse shrink-0">Analizando recibo...</span>}
          </div>
          {avisoIA && (
            <p className={cn("text-[11px] mt-1.5", fotoReferencia ? "text-emerald-600" : "text-amber-600")}>{avisoIA}</p>
          )}
          {!nombreFoto && (
            <p className="text-[11px] text-slate-400 mt-1">
              Sube la foto y una IA intentará leer el lugar, la fecha y los artículos por ti -- igual tendrás que asignar la actividad de cada línea.
            </p>
          )}
        </div>

        <div className="space-y-2 mb-3">
          <p className="text-xs font-semibold text-slate-700">Artículos / servicios</p>
          {lineas.map((l, idx) => (
            <div key={idx} className="border border-slate-200 rounded-lg p-2.5 grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-3">
                <label className="block text-[10px] text-slate-400 mb-0.5">Descripción</label>
                <input value={l.descripcion} onChange={(e) => actualizarLinea(idx, "descripcion", e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <label className="block text-[10px] text-slate-400 mb-0.5">Tipo</label>
                <select value={l.tipoRecurso} onChange={(e) => actualizarLinea(idx, "tipoRecurso", e.target.value)} className={cn(inputCls, "bg-white")}>
                  <option value="material">Material</option>
                  <option value="equipo">Equipo</option>
                  <option value="subcontrato">Servicio/Subcontrato</option>
                  <option value="indirecto">Indirecto</option>
                </select>
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="block text-[10px] text-slate-400 mb-0.5">UM</label>
                <input value={l.unidad} onChange={(e) => actualizarLinea(idx, "unidad", e.target.value)} placeholder="pza" className={inputCls} />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <label className="block text-[10px] text-slate-400 mb-0.5">Cant.</label>
                <input type="number" step="0.01" value={l.cantidad} onChange={(e) => actualizarLinea(idx, "cantidad", e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-4 sm:col-span-1">
                <label className="block text-[10px] text-slate-400 mb-0.5">P. unit.</label>
                <input type="number" step="0.01" value={l.precioUnitario} onChange={(e) => actualizarLinea(idx, "precioUnitario", e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-4 sm:col-span-1">
                <label className="block text-[10px] text-slate-400 mb-0.5">Tax</label>
                <input type="number" step="0.01" value={l.tax} onChange={(e) => actualizarLinea(idx, "tax", e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <label className="block text-[10px] text-slate-400 mb-0.5">Actividad</label>
                <select value={l.actividadId} onChange={(e) => actualizarLinea(idx, "actividadId", e.target.value)} className={cn(inputCls, "bg-white")}>
                  <option value="">Elegir...</option>
                  {actividadesOpciones.map((a) => (
                    <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-1 flex justify-end">
                {lineas.length > 1 && (
                  <button onClick={() => quitarLinea(idx)} className="text-slate-300 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={agregarLinea} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Agregar artículo/servicio
          </button>
        </div>

        <p className="text-sm text-right font-semibold text-slate-800 mb-3">Total: {formatoMoneda(total)}</p>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-3">{error}</div>
        )}

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="button" className="flex-1" isLoading={isPending} disabled={analizando} onClick={handleSubmit}>
            Guardar factura
          </Button>
        </div>
      </div>
    </div>
  )
}
