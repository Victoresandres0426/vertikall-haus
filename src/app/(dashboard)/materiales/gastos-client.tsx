"use client"

import { useEffect, useState, useTransition } from "react"
import { Receipt, Plus, X, Trash2, Camera, RefreshCw, AlertTriangle, Pencil, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  crearFacturaGasto,
  eliminarFacturaGasto,
  crearFacturaBorradorConFoto,
  reintentarAnalisisFactura,
  asignarActividadLinea,
  asignarPartidaLinea,
  actualizarLineaGasto,
  eliminarLineaGasto,
  actualizarFacturaGasto,
  type LineaGastoInput,
  type FacturaActualizada,
} from "./gastos-actions"

export type ActividadOpcion = { id: string; codigo: string; nombre: string }

// Partidas del presupuesto SIN actividad_id -- costos indirectos/generales
// del proyecto completo (supervisión, seguro, contingencia, gastos
// generales, etc.). Sirven para vincular un gasto que no corresponde a
// ninguna actividad puntual (herramienta menor, agua, etc.) directo a una
// de estas partidas, para que sí se descuente de "Ejercido" en Presupuesto.
export type PartidaOpcion = { id: string; codigo: string; descripcion: string; actividad_id: string | null }

export type LineaCostoReal = {
  id: string
  factura_id: string | null
  actividad_id: string | null
  partida_id?: string | null
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
  estado_analisis: string
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
  partidaId: string
  tipoRecurso: LineaGastoInput["tipoRecurso"]
  descripcion: string
  unidad: string
  cantidad: string
  precioUnitario: string
  tax: string
}

type LineaEditDraft = {
  descripcion: string
  unidad: string
  cantidad: string
  precioUnitario: string
  tax: string
  tipoRecurso: LineaGastoInput["tipoRecurso"]
}

function recalcularTotalesLocal(lineas: LineaCostoReal[]) {
  const subtotal = lineas.reduce((s, l) => s + (l.cantidad ?? 0) * (l.precio_unitario ?? 0), 0)
  const taxTotal = lineas.reduce((s, l) => s + (l.tax ?? 0), 0)
  return { subtotal, tax_total: taxTotal, total: subtotal + taxTotal }
}

// Las fotos tomadas directo con la cámara del celular suelen pesar varios MB
// (4000x3000px o más) -- eso hace que subirlas se sienta muy lento por datos
// móviles. Las reducimos en el propio navegador antes de mandarlas: el
// recibo se sigue leyendo perfecto a 1800px de ancho, y el archivo queda
// mucho más chico (típicamente <500KB en vez de varios MB).
async function comprimirFoto(file: File, maxDim = 1800, calidad = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    if (escala >= 1 && file.size < 1.5 * 1024 * 1024) return file

    const w = Math.max(1, Math.round(bitmap.width * escala))
    const h = Math.max(1, Math.round(bitmap.height * escala))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", calidad))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
  } catch {
    return file
  }
}

const lineaVacia: LineaDraft = {
  actividadId: "",
  partidaId: "",
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
  partidasIndirectasOpciones,
  puedeCrear,
  proyectoActivoId,
}: {
  facturasIniciales: FacturaGasto[]
  actividadesOpciones: ActividadOpcion[]
  partidasIndirectasOpciones: PartidaOpcion[]
  puedeCrear: boolean
  proyectoActivoId: string | null
}) {
  const [facturas, setFacturas] = useState(facturasIniciales)
  const [showModalManual, setShowModalManual] = useState(false)
  const [showModalFoto, setShowModalFoto] = useState(false)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [reintentando, setReintentando] = useState<string | null>(null)
  const [editandoLinea, setEditandoLinea] = useState<{ lineaId: string; draft: LineaEditDraft } | null>(null)
  const [editandoHeader, setEditandoHeader] = useState<{ facturaId: string; lugar: string; fecha: string; referencia: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => setFacturas(facturasIniciales), [facturasIniciales])

  const handleEliminar = (facturaId: string) => {
    if (!confirm("¿Borrar esta factura y todas sus líneas? Esto también quita el gasto del costo real de las actividades.")) return
    startTransition(async () => {
      const res = await eliminarFacturaGasto(facturaId)
      if (res.error) alert(res.error)
      else window.location.reload()
    })
  }

  const mergeFacturaActualizada = (facturaId: string, actualizada: FacturaActualizada) => {
    setFacturas((prev) => prev.map((f) => (f.id === facturaId ? { ...f, ...actualizada } : f)))
  }

  const handleReintentar = (facturaId: string) => {
    setReintentando(facturaId)
    startTransition(async () => {
      const res = await reintentarAnalisisFactura(facturaId)
      setReintentando(null)
      if (res.error) {
        alert(res.error)
        return
      }
      if (res.factura) mergeFacturaActualizada(facturaId, res.factura)
    })
  }

  // Se llama justo después de que ModalSubirFoto termina de subir la foto
  // (rápido). La factura ya se guardó, así que se agrega de inmediato a la
  // lista local -- y el análisis de IA se dispara aparte, SIN esperarlo:
  // cuando termine (5-15s después, quizás con el modal ya cerrado), esta
  // misma promesa actualiza la lista si el usuario sigue en la página.
  const handleFotoSubida = (facturaId: string) => {
    setFacturas((prev) => [
      {
        id: facturaId,
        fecha: new Date().toISOString().slice(0, 10),
        lugar: "Analizando recibo…",
        referencia: null,
        foto_referencia: null,
        foto_url: null,
        subtotal: 0,
        tax_total: 0,
        total: 0,
        estado_analisis: "pendiente",
        lineas: [],
      },
      ...prev,
    ])

    reintentarAnalisisFactura(facturaId)
      .then((res) => {
        if (res.factura) mergeFacturaActualizada(facturaId, res.factura)
      })
      .catch((err) => console.error("Análisis de recibo en segundo plano falló:", err))
  }

  const handleAsignarActividad = (lineaId: string, actividadId: string) => {
    const valor = actividadId || null
    const actividad = actividadesOpciones.find((a) => a.id === valor)
    setFacturas((prev) =>
      prev.map((f) => ({
        ...f,
        lineas: f.lineas.map((l) =>
          l.id === lineaId
            ? { ...l, actividad_id: valor, actividades: actividad ? { codigo: actividad.codigo, nombre: actividad.nombre } : null }
            : l
        ),
      }))
    )
    startTransition(async () => {
      const res = await asignarActividadLinea(lineaId, valor)
      if (res.error) alert(res.error)
    })
  }

  // Igual que handleAsignarActividad, pero para costos generales/indirectos
  // que no corresponden a ninguna actividad puntual (herramienta menor,
  // agua, etc.) -- se vinculan directo a una partida de presupuesto en vez
  // de a una actividad, para que sí se descuenten de "Ejercido".
  const handleAsignarPartida = (lineaId: string, partidaId: string) => {
    const valor = partidaId || null
    setFacturas((prev) =>
      prev.map((f) => ({
        ...f,
        lineas: f.lineas.map((l) => (l.id === lineaId ? { ...l, partida_id: valor } : l)),
      }))
    )
    startTransition(async () => {
      const res = await asignarPartidaLinea(lineaId, valor)
      if (res.error) alert(res.error)
    })
  }

  const iniciarEdicionLinea = (l: LineaCostoReal) => {
    setEditandoLinea({
      lineaId: l.id,
      draft: {
        descripcion: l.descripcion,
        unidad: l.unidad ?? "",
        cantidad: String(l.cantidad ?? 0),
        precioUnitario: String(l.precio_unitario ?? 0),
        tax: String(l.tax ?? 0),
        tipoRecurso: (l.tipo_recurso as LineaGastoInput["tipoRecurso"]) || "material",
      },
    })
  }

  const guardarEdicionLinea = (facturaId: string) => {
    if (!editandoLinea) return
    const { lineaId, draft } = editandoLinea
    if (!draft.descripcion.trim()) {
      alert("La descripción no puede quedar vacía")
      return
    }
    const cantidad = Number(draft.cantidad) || 0
    const precioUnitario = Number(draft.precioUnitario) || 0
    const tax = Number(draft.tax) || 0
    const monto = cantidad * precioUnitario + tax

    setFacturas((prev) =>
      prev.map((f) => {
        if (f.id !== facturaId) return f
        const lineas = f.lineas.map((l) =>
          l.id === lineaId
            ? {
                ...l,
                descripcion: draft.descripcion.trim(),
                unidad: draft.unidad.trim() || null,
                cantidad,
                precio_unitario: precioUnitario,
                tax,
                tipo_recurso: draft.tipoRecurso,
                monto,
              }
            : l
        )
        return { ...f, lineas, ...recalcularTotalesLocal(lineas) }
      })
    )
    setEditandoLinea(null)

    startTransition(async () => {
      const res = await actualizarLineaGasto(lineaId, {
        descripcion: draft.descripcion,
        unidad: draft.unidad || null,
        cantidad,
        precioUnitario,
        tax,
        tipoRecurso: draft.tipoRecurso,
      })
      if (res.error) alert(res.error)
    })
  }

  const handleEliminarLinea = (facturaId: string, lineaId: string) => {
    if (!confirm("¿Quitar este artículo de la factura? (por ejemplo, algo que se coló en la misma compra y no es del proyecto)")) return

    setFacturas((prev) =>
      prev.map((f) => {
        if (f.id !== facturaId) return f
        const lineas = f.lineas.filter((l) => l.id !== lineaId)
        return { ...f, lineas, ...recalcularTotalesLocal(lineas) }
      })
    )

    startTransition(async () => {
      const res = await eliminarLineaGasto(lineaId)
      if (res.error) alert(res.error)
    })
  }

  const iniciarEdicionHeader = (f: FacturaGasto) => {
    setEditandoHeader({ facturaId: f.id, lugar: f.lugar, fecha: f.fecha, referencia: f.referencia ?? "" })
  }

  const guardarEdicionHeader = () => {
    if (!editandoHeader) return
    const { facturaId, lugar, fecha, referencia } = editandoHeader
    if (!lugar.trim()) {
      alert("El lugar de compra es obligatorio")
      return
    }

    setFacturas((prev) =>
      prev.map((f) => (f.id === facturaId ? { ...f, lugar: lugar.trim(), fecha, referencia: referencia.trim() || null } : f))
    )
    setEditandoHeader(null)

    startTransition(async () => {
      const res = await actualizarFacturaGasto(facturaId, { lugar, fecha, referencia: referencia || null })
      if (res.error) alert(res.error)
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
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowModalFoto(true)}>
            <Camera className="h-4 w-4 mr-1" /> Subir foto
          </Button>
          <Button onClick={() => setShowModalManual(true)}>
            <Plus className="h-4 w-4 mr-1" /> Registrar a mano
          </Button>
        </div>
      )}

      {facturas.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
          <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-lg font-medium">Sin gastos registrados todavía</p>
          <p className="text-sm mt-1">Sube la foto de un recibo o registra una factura a mano.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {facturas.map((f) => {
            const abierta = expandida === f.id
            const sinAsignar = f.lineas.filter((l) => !l.actividad_id && !l.partida_id).length

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
                      {f.estado_analisis === "pendiente" && (
                        <span className="ml-2 text-xs text-amber-600 animate-pulse">● analizando con IA…</span>
                      )}
                      {f.estado_analisis === "error" && (
                        <span className="ml-2 text-xs text-red-500 inline-flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> error al analizar
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {f.lineas.length} línea{f.lineas.length !== 1 ? "s" : ""}
                      {f.referencia ? ` · Ref: ${f.referencia}` : ""}
                      {sinAsignar > 0 && (
                        <span className="text-amber-600"> · {sinAsignar} sin clasificar</span>
                      )}
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
                    {puedeCrear && (
                      <div>
                        {editandoHeader?.facturaId === f.id ? (
                          <div className="border border-slate-200 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Fecha</label>
                              <input
                                type="date"
                                value={editandoHeader.fecha}
                                onChange={(e) => setEditandoHeader({ ...editandoHeader, fecha: e.target.value })}
                                className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[10px] text-slate-400 mb-0.5">Lugar de compra</label>
                              <input
                                value={editandoHeader.lugar}
                                onChange={(e) => setEditandoHeader({ ...editandoHeader, lugar: e.target.value })}
                                className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">Referencia / folio</label>
                              <input
                                value={editandoHeader.referencia}
                                onChange={(e) => setEditandoHeader({ ...editandoHeader, referencia: e.target.value })}
                                className="w-full border border-slate-200 rounded-md px-2 py-1 text-xs"
                              />
                            </div>
                            <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end">
                              <button
                                onClick={() => setEditandoHeader(null)}
                                className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={guardarEdicionHeader}
                                className="text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md px-3 py-1 flex items-center gap-1"
                              >
                                <Check className="h-3.5 w-3.5" /> Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => iniciarEdicionHeader(f)}
                            className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1"
                          >
                            <Pencil className="h-3 w-3" /> Editar lugar / fecha / referencia
                          </button>
                        )}
                      </div>
                    )}

                    {(f.estado_analisis === "error" || f.estado_analisis === "pendiente") && puedeCrear && (
                      <div
                        className={cn(
                          "rounded-lg border p-3 flex items-center justify-between gap-3",
                          f.estado_analisis === "error" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                        )}
                      >
                        <p className={cn("text-xs", f.estado_analisis === "error" ? "text-red-600" : "text-amber-700")}>
                          {f.estado_analisis === "error"
                            ? "La IA no pudo terminar de analizar esta foto."
                            : "Si esto lleva rato aquí, el análisis se quedó a medias -- puedes reintentarlo."}
                        </p>
                        <button
                          onClick={() => handleReintentar(f.id)}
                          disabled={reintentando === f.id}
                          className={cn(
                            "text-xs font-medium flex items-center gap-1 shrink-0 disabled:opacity-50",
                            f.estado_analisis === "error" ? "text-red-700 hover:text-red-900" : "text-amber-800 hover:text-amber-950"
                          )}
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", reintentando === f.id && "animate-spin")} /> Reintentar
                        </button>
                      </div>
                    )}

                    {f.lineas.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        {f.estado_analisis === "pendiente" ? "La IA todavía está leyendo esta foto…" : "Sin artículos todavía."}
                      </p>
                    ) : (
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
                              <th className="pb-1.5 pr-3 font-medium">Actividad / partida</th>
                              {puedeCrear && <th className="pb-1.5 font-medium">Acciones</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {f.lineas.map((l) => {
                              const editando = editandoLinea?.lineaId === l.id
                              const draft = editando ? editandoLinea.draft : null
                              const smallInputCls = "w-full border border-slate-200 rounded-md px-1.5 py-1 text-xs"

                              return (
                                <tr key={l.id} className={!l.actividad_id && !l.partida_id && !editando ? "bg-amber-50/60" : undefined}>
                                  {editando && draft ? (
                                    <>
                                      <td className="py-1.5 pr-3">
                                        <input
                                          value={draft.descripcion}
                                          onChange={(e) => setEditandoLinea({ lineaId: l.id, draft: { ...draft, descripcion: e.target.value } })}
                                          className={smallInputCls}
                                        />
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <select
                                          value={draft.tipoRecurso}
                                          onChange={(e) => setEditandoLinea({ lineaId: l.id, draft: { ...draft, tipoRecurso: e.target.value as LineaGastoInput["tipoRecurso"] } })}
                                          className={cn(smallInputCls, "bg-white")}
                                        >
                                          <option value="material">Material</option>
                                          <option value="equipo">Equipo</option>
                                          <option value="subcontrato">Servicio/Subcontrato</option>
                                          <option value="indirecto">Indirecto</option>
                                        </select>
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={draft.cantidad}
                                          onChange={(e) => setEditandoLinea({ lineaId: l.id, draft: { ...draft, cantidad: e.target.value } })}
                                          className={cn(smallInputCls, "text-right")}
                                        />
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <input
                                          value={draft.unidad}
                                          onChange={(e) => setEditandoLinea({ lineaId: l.id, draft: { ...draft, unidad: e.target.value } })}
                                          className={smallInputCls}
                                        />
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={draft.precioUnitario}
                                          onChange={(e) => setEditandoLinea({ lineaId: l.id, draft: { ...draft, precioUnitario: e.target.value } })}
                                          className={cn(smallInputCls, "text-right")}
                                        />
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={draft.tax}
                                          onChange={(e) => setEditandoLinea({ lineaId: l.id, draft: { ...draft, tax: e.target.value } })}
                                          className={cn(smallInputCls, "text-right")}
                                        />
                                      </td>
                                      <td className="py-1.5 pr-3 text-right font-medium text-slate-900">
                                        {formatoMoneda((Number(draft.cantidad) || 0) * (Number(draft.precioUnitario) || 0) + (Number(draft.tax) || 0))}
                                      </td>
                                      <td className="py-1.5 pr-3 text-slate-400">—</td>
                                      <td className="py-1.5">
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => setEditandoLinea(null)} className="text-slate-400 hover:text-slate-600">
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                          <button onClick={() => guardarEdicionLinea(f.id)} className="text-emerald-600 hover:text-emerald-800">
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-1.5 pr-3 text-slate-700">{l.descripcion}</td>
                                      <td className="py-1.5 pr-3 text-slate-500">{tipoLabel[l.tipo_recurso] ?? l.tipo_recurso}</td>
                                      <td className="py-1.5 pr-3 text-right text-slate-600">{l.cantidad ?? "—"}</td>
                                      <td className="py-1.5 pr-3 text-slate-500">{l.unidad ?? "—"}</td>
                                      <td className="py-1.5 pr-3 text-right text-slate-600">{l.precio_unitario != null ? formatoMoneda(l.precio_unitario) : "—"}</td>
                                      <td className="py-1.5 pr-3 text-right text-slate-600">{l.tax ? formatoMoneda(l.tax) : "—"}</td>
                                      <td className="py-1.5 pr-3 text-right font-medium text-slate-900">{formatoMoneda(l.monto)}</td>
                                      <td className="py-1.5 pr-3">
                                        {puedeCrear ? (
                                          <div className="flex flex-col gap-1">
                                            <select
                                              value={l.actividad_id ?? ""}
                                              onChange={(e) => handleAsignarActividad(l.id, e.target.value)}
                                              className={cn(
                                                "text-xs border rounded-md px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900",
                                                l.actividad_id ? "border-slate-200 text-slate-700" : "border-amber-300 text-amber-700"
                                              )}
                                            >
                                              <option value="">Sin actividad</option>
                                              {actividadesOpciones.map((a) => (
                                                <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
                                              ))}
                                            </select>
                                            {/* Solo tiene sentido elegir una partida general cuando NO hay
                                                actividad -- para gastos que no corresponden a ninguna tarea
                                                puntual (herramienta menor, agua, etc.). */}
                                            {!l.actividad_id && partidasIndirectasOpciones.length > 0 && (
                                              <select
                                                value={l.partida_id ?? ""}
                                                onChange={(e) => handleAsignarPartida(l.id, e.target.value)}
                                                className={cn(
                                                  "text-xs border rounded-md px-1.5 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900",
                                                  l.partida_id ? "border-slate-200 text-slate-700" : "border-slate-200 text-slate-400"
                                                )}
                                              >
                                                <option value="">Sin partida general</option>
                                                {partidasIndirectasOpciones.map((p) => (
                                                  <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>
                                                ))}
                                              </select>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-slate-600">
                                            {l.actividades
                                              ? `${l.actividades.codigo} — ${l.actividades.nombre}`
                                              : partidasIndirectasOpciones.find((p) => p.id === l.partida_id)
                                                ? `${partidasIndirectasOpciones.find((p) => p.id === l.partida_id)?.codigo} — ${partidasIndirectasOpciones.find((p) => p.id === l.partida_id)?.descripcion}`
                                                : "—"}
                                          </span>
                                        )}
                                      </td>
                                      {puedeCrear && (
                                        <td className="py-1.5">
                                          <div className="flex items-center gap-2">
                                            <button onClick={() => iniciarEdicionLinea(l)} className="text-slate-300 hover:text-slate-700">
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={() => handleEliminarLinea(f.id, l.id)} className="text-slate-300 hover:text-red-500">
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      )}
                                    </>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-100 font-medium text-slate-700">
                              <td colSpan={5}></td>
                              <td className="pt-1.5 pr-3 text-right text-slate-400">Subtotal / Tax</td>
                              <td className="pt-1.5 pr-3 text-right">{formatoMoneda(f.subtotal)} / {formatoMoneda(f.tax_total)}</td>
                              <td></td>
                              {puedeCrear && <td></td>}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

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

      {showModalManual && (
        <ModalRegistrarGasto
          proyectoId={proyectoActivoId}
          actividadesOpciones={actividadesOpciones}
          partidasIndirectasOpciones={partidasIndirectasOpciones}
          onClose={() => setShowModalManual(false)}
        />
      )}

      {showModalFoto && (
        <ModalSubirFoto
          proyectoId={proyectoActivoId}
          onClose={() => setShowModalFoto(false)}
          onCreada={(facturaId) => {
            handleFotoSubida(facturaId)
            setShowModalFoto(false)
          }}
        />
      )}
    </div>
  )
}

// Captura rápida: subir/tomar la foto y listo -- no espera a que la IA
// termine de analizarla. La factura queda guardada de inmediato (con la
// foto archivada) y aparece en la lista como "analizando con IA…"; cuando
// el análisis termine en segundo plano, ya va a tener sus líneas listas
// para que el usuario les asigne la actividad cuando tenga tiempo.
function ModalSubirFoto({
  proyectoId,
  onClose,
  onCreada,
}: {
  proyectoId: string
  onClose: () => void
  onCreada: (facturaId: string) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState("")

  const handleSeleccionarFoto = (file: File | null) => {
    if (!file) return
    setError("")
    setSubiendo(true)
    ;(async () => {
      const fileParaSubir = await comprimirFoto(file)
      const fd = new FormData()
      fd.append("foto", fileParaSubir)
      let res = await crearFacturaBorradorConFoto(proyectoId, fd)

      if (res.duplicado) {
        const d = res.duplicado
        const seguir = window.confirm(
          `Esta misma foto ya se subió el ${formatoFecha(d.fecha)} como "${d.lugar}" (${formatoMoneda(d.total)}). ¿Subirla de todas formas?`
        )
        if (!seguir) {
          setSubiendo(false)
          return
        }
        res = await crearFacturaBorradorConFoto(proyectoId, fd, true)
      }

      if (res.error || !res.id) {
        setSubiendo(false)
        setError(res.error || "No se pudo guardar la factura.")
        return
      }
      // No recargamos la página: si lo hiciéramos, el navegador cancelaría
      // el análisis de IA que se dispara justo después de esto (ver
      // handleFotoSubida), ya que recargar destruye la conexión en curso.
      onCreada(res.id)
    })()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !subiendo) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative text-center">
        {!subiendo && (
          <button className="absolute right-4 top-4 text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        )}

        <Camera className="h-10 w-10 mx-auto mb-3 text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Subir foto del recibo</h3>
        <p className="text-xs text-slate-400 mb-5">
          Se guarda al instante y una IA la analiza en segundo plano -- no hace falta esperar, puedes cerrar esto y seguir con tu día. Luego revisa la factura en la lista y asigna la actividad de cada artículo.
        </p>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-4 text-left">{error}</div>
        )}

        {subiendo ? (
          <p className="text-sm text-slate-500 animate-pulse">Subiendo foto...</p>
        ) : (
          <label className="inline-flex items-center gap-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg px-4 py-2.5 cursor-pointer transition-colors">
            <Camera className="h-4 w-4" /> Tomar o elegir foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleSeleccionarFoto(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>
    </div>
  )
}

function ModalRegistrarGasto({
  proyectoId,
  actividadesOpciones,
  partidasIndirectasOpciones,
  onClose,
}: {
  proyectoId: string
  actividadesOpciones: ActividadOpcion[]
  partidasIndirectasOpciones: PartidaOpcion[]
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [lugar, setLugar] = useState("")
  const [referencia, setReferencia] = useState("")
  const [lineas, setLineas] = useState<LineaDraft[]>([{ ...lineaVacia }])

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

    startTransition(async () => {
      const res = await crearFacturaGasto({
        proyectoId,
        fecha,
        lugar,
        referencia: referencia || null,
        fotoReferencia: null,
        lineas: lineas.map((l) => ({
          actividadId: l.actividadId || null,
          partidaId: l.actividadId ? null : l.partidaId || null,
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

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"

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

        <h3 className="text-lg font-semibold text-slate-900 mb-1">Registrar gasto a mano</h3>
        <p className="text-xs text-slate-400 mb-5">
          Una factura o recibo, con sus artículos/servicios. Puedes asignar la actividad de cada línea ahora o dejarla pendiente y hacerlo después desde la lista.
        </p>

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
                <label className="block text-[10px] text-slate-400 mb-0.5">Actividad (opcional)</label>
                <select value={l.actividadId} onChange={(e) => actualizarLinea(idx, "actividadId", e.target.value)} className={cn(inputCls, "bg-white")}>
                  <option value="">Sin asignar</option>
                  {actividadesOpciones.map((a) => (
                    <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
                  ))}
                </select>
              </div>
              {/* Solo aplica cuando no hay actividad -- gastos generales del
                  proyecto (herramienta menor, agua, etc.) que no corresponden
                  a ninguna tarea puntual, para que sí se descuenten de una
                  partida real en vez de quedar flotando. */}
              {!l.actividadId && partidasIndirectasOpciones.length > 0 && (
                <div className="col-span-8 sm:col-span-2">
                  <label className="block text-[10px] text-slate-400 mb-0.5">Partida general (si no aplica a una actividad)</label>
                  <select value={l.partidaId} onChange={(e) => actualizarLinea(idx, "partidaId", e.target.value)} className={cn(inputCls, "bg-white")}>
                    <option value="">Sin partida general</option>
                    {partidasIndirectasOpciones.map((p) => (
                      <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion}</option>
                    ))}
                  </select>
                </div>
              )}
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
          <Button type="button" className="flex-1" isLoading={isPending} onClick={handleSubmit}>
            Guardar factura
          </Button>
        </div>
      </div>
    </div>
  )
}
