"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Search, Phone, Mail, Pencil, Trash2, HardHat, Star, AlertTriangle, FileSignature, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  crearSubcontratista,
  actualizarSubcontratista,
  eliminarSubcontratista,
  crearSubcontrato,
  actualizarSubcontrato,
  eliminarSubcontrato,
  type SubcontratistaInput,
  type SubcontratoInput,
} from "./actions"

export type Subcontratista = SubcontratistaInput & { id: string }
export type Subcontrato = SubcontratoInput & { id: string; actividad_ids: string[] }
export type ProyectoOpcion = { id: string; codigo: string | null; nombre: string }
export type ActividadOpcion = { id: string; proyecto_id: string; codigo: string; nombre: string }

const ESTADOS: Record<Subcontrato["estado"], { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-slate-100 text-slate-600" },
  activo: { label: "Activo", cls: "bg-emerald-100 text-emerald-700" },
  completado: { label: "Completado", cls: "bg-blue-100 text-blue-700" },
  cancelado: { label: "Cancelado", cls: "bg-red-100 text-red-700" },
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`
const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"

function formatoFecha(iso: string | null) {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

// Vencimiento de licencia / seguro: "vencido" o "vence pronto" (30 días)
function estadoVencimiento(iso: string | null): "vencido" | "pronto" | null {
  if (!iso) return null
  const hoy = new Date().toISOString().slice(0, 10)
  if (iso < hoy) return "vencido"
  const limite = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  return iso <= limite ? "pronto" : null
}

const vacio: SubcontratistaInput = {
  nombre_compania: "", contacto_nombre: null, telefono: null, email: null, direccion: null, sitio_web: null,
  especialidad: null, ein: null, w9_recibido: false, licencia_numero: null, licencia_vence: null,
  seguro_aseguradora: null, seguro_poliza: null, seguro_vence: null, workers_comp: false,
  metodo_pago: null, datos_pago: null, calificacion: null, activo: true, notas: null,
}

export function SubcontratistasClient({
  subcontratistas,
  contratos,
  proyectos,
  actividades,
  puedeBorrar,
}: {
  subcontratistas: Subcontratista[]
  contratos: Subcontrato[]
  proyectos: ProyectoOpcion[]
  actividades: ActividadOpcion[]
  puedeBorrar: boolean
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState("")
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState<Subcontratista | "nuevo" | null>(null)
  const [contratoModal, setContratoModal] = useState<{ subcontratistaId: string; contrato: Subcontrato | null } | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const nombreProyecto = (id: string) => {
    const p = proyectos.find((x) => x.id === id)
    return p ? p.nombre : "Proyecto"
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return subcontratistas.filter((s) => {
      if (!verInactivos && !s.activo) return false
      if (!q) return true
      return `${s.nombre_compania} ${s.contacto_nombre ?? ""} ${s.especialidad ?? ""} ${s.telefono ?? ""} ${s.email ?? ""}`
        .toLowerCase()
        .includes(q)
    })
  }, [subcontratistas, busqueda, verInactivos])

  const handleEliminar = (s: Subcontratista) => {
    if (!confirm(`¿Borrar a ${s.nombre_compania} y todos sus contratos? Esta acción no se puede deshacer.`)) return
    startTransition(async () => {
      const res = await eliminarSubcontratista(s.id)
      if (res.error) alert(res.error)
      else router.refresh()
    })
  }

  const handleEliminarContrato = (c: Subcontrato) => {
    if (!confirm("¿Borrar este contrato?")) return
    startTransition(async () => {
      const res = await eliminarSubcontrato(c.id)
      if (res.error) alert(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar compañía, contacto, oficio…"
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-72 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>
        <Button onClick={() => setEditando("nuevo")}>
          <Plus className="h-4 w-4 mr-1" /> Agregar subcontratista
        </Button>
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
          <HardHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">{subcontratistas.length === 0 ? "Aún no hay subcontratistas" : "Ningún resultado"}</p>
          {subcontratistas.length === 0 && (
            <p className="text-sm mt-1">Registra a los subcontratistas con los que trabajas y asígnalos a contratos por proyecto.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((s) => {
            const susContratos = contratos.filter((c) => c.subcontratista_id === s.id)
            const abierto = expandido === s.id
            const montoActivo = susContratos.filter((c) => c.estado === "activo").reduce((t, c) => t + c.monto_contrato, 0)
            const venceLic = estadoVencimiento(s.licencia_vence)
            const venceSeg = estadoVencimiento(s.seguro_vence)
            return (
              <div key={s.id} className={cn("bg-white border border-slate-200 rounded-xl", !s.activo && "opacity-60")}>
                <div className="flex flex-wrap items-start gap-4 p-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900">{s.nombre_compania}</h3>
                      {s.especialidad && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{s.especialidad}</span>}
                      {!s.activo && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Inactivo</span>}
                      {s.calificacion && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600">
                          <Star className="h-3 w-3 fill-current" /> {s.calificacion}
                        </span>
                      )}
                    </div>
                    {s.contacto_nombre && <p className="text-xs text-slate-500 mt-0.5">{s.contacto_nombre}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                      {s.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {s.telefono}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {venceLic && (
                        <span className={cn("flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded", venceLic === "vencido" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                          <AlertTriangle className="h-3 w-3" /> Licencia {venceLic === "vencido" ? "vencida" : "vence pronto"} ({formatoFecha(s.licencia_vence)})
                        </span>
                      )}
                      {venceSeg && (
                        <span className={cn("flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded", venceSeg === "vencido" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                          <AlertTriangle className="h-3 w-3" /> Seguro {venceSeg === "vencido" ? "vencido" : "vence pronto"} ({formatoFecha(s.seguro_vence)})
                        </span>
                      )}
                      {!s.w9_recibido && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Sin W-9</span>}
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <p className="text-slate-400">Contratos activos</p>
                    <p className="text-base font-semibold text-slate-900">{money(montoActivo)}</p>
                    <p className="text-slate-400">{susContratos.length} contrato(s) en total</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditando(s)} className="text-slate-400 hover:text-slate-700" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {puedeBorrar && (
                      <button onClick={() => handleEliminar(s)} className="text-slate-300 hover:text-red-500" title="Borrar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setExpandido(abierto ? null : s.id)}
                      className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    >
                      <FileSignature className="h-3.5 w-3.5" /> Contratos {abierto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {abierto && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-2">
                    {susContratos.length === 0 && <p className="text-xs text-slate-400 italic">Sin contratos todavía.</p>}
                    {susContratos.map((c) => (
                      <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{nombreProyecto(c.proyecto_id)}</span>
                            <span className={cn("text-[11px] px-1.5 py-0.5 rounded", ESTADOS[c.estado].cls)}>{ESTADOS[c.estado].label}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">{c.alcance}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {formatoFecha(c.fecha_inicio)} → {formatoFecha(c.fecha_fin)} · {c.actividad_ids.length} actividad(es)
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{money(c.monto_contrato)}</p>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setContratoModal({ subcontratistaId: s.id, contrato: c })} className="text-slate-400 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {puedeBorrar && (
                            <button onClick={() => handleEliminarContrato(c)} className="text-slate-300 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" onClick={() => setContratoModal({ subcontratistaId: s.id, contrato: null })}>
                      <Plus className="h-4 w-4 mr-1" /> Nuevo contrato
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <ModalSubcontratista
          inicial={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); router.refresh() }}
        />
      )}
      {contratoModal && (
        <ModalContrato
          subcontratistaId={contratoModal.subcontratistaId}
          contrato={contratoModal.contrato}
          contratos={contratos}
          proyectos={proyectos}
          actividades={actividades}
          onClose={() => setContratoModal(null)}
          onGuardado={() => { setContratoModal(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function Campo({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Modal({ titulo, onClose, children, ancho = "max-w-2xl" }: { titulo: string; onClose: () => void; children: React.ReactNode; ancho?: string }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={cn("bg-white rounded-2xl shadow-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto", ancho)}>
        <button className="absolute right-4 top-4 text-slate-400 hover:text-slate-600" onClick={onClose}>
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900 mb-5">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

function ModalSubcontratista({
  inicial,
  onClose,
  onGuardado,
}: {
  inicial: Subcontratista | null
  onClose: () => void
  onGuardado: () => void
}) {
  const [d, setD] = useState<SubcontratistaInput>(() => {
    if (!inicial) return vacio
    const { id: _id, ...resto } = inicial
    void _id
    return resto
  })
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof SubcontratistaInput>(k: K, v: SubcontratistaInput[K]) => setD((p) => ({ ...p, [k]: v }))
  const txt = (k: keyof SubcontratistaInput) => (d[k] as string | null) ?? ""

  const guardar = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const res = inicial ? await actualizarSubcontratista(inicial.id, d) : await crearSubcontratista(d)
      if (res.error) setError(res.error)
      else onGuardado()
    })
  }

  const t = (k: keyof SubcontratistaInput) => ({
    value: txt(k),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(k as never, (e.target.value || null) as never),
    className: inputCls,
  })

  return (
    <Modal titulo={inicial ? "Editar subcontratista" : "Agregar subcontratista"} onClose={onClose}>
      <form onSubmit={guardar} className="space-y-6">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Compañía y contacto</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Compañía *" span>
              <input required value={d.nombre_compania} onChange={(e) => set("nombre_compania", e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Persona de contacto"><input {...t("contacto_nombre")} /></Campo>
            <Campo label="Especialidad / oficio"><input {...t("especialidad")} placeholder="Ej. Plomería, Electricidad" /></Campo>
            <Campo label="Teléfono"><input {...t("telefono")} /></Campo>
            <Campo label="Email"><input type="email" {...t("email")} /></Campo>
            <Campo label="Dirección" span><input {...t("direccion")} /></Campo>
            <Campo label="Sitio web" span><input {...t("sitio_web")} /></Campo>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Legales y fiscales</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="EIN / Tax ID"><input {...t("ein")} /></Campo>
            <div className="flex items-end gap-5 pb-2">
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={d.w9_recibido} onChange={(e) => set("w9_recibido", e.target.checked)} /> W-9 recibido
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={d.workers_comp} onChange={(e) => set("workers_comp", e.target.checked)} /> Workers&apos; comp
              </label>
            </div>
            <Campo label="Licencia (número)"><input {...t("licencia_numero")} /></Campo>
            <Campo label="Licencia vence"><input type="date" {...t("licencia_vence")} /></Campo>
            <Campo label="Seguro (aseguradora)"><input {...t("seguro_aseguradora")} /></Campo>
            <Campo label="Seguro (póliza)"><input {...t("seguro_poliza")} /></Campo>
            <Campo label="Seguro vence"><input type="date" {...t("seguro_vence")} /></Campo>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Datos de pago</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Método de pago">
              <select {...t("metodo_pago")}>
                <option value="">—</option>
                <option value="Cheque">Cheque</option>
                <option value="Zelle">Zelle</option>
                <option value="Transferencia / ACH">Transferencia / ACH</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Otro">Otro</option>
              </select>
            </Campo>
            <Campo label="Datos (cuenta, Zelle, a nombre de…)"><input {...t("datos_pago")} /></Campo>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Estado</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Calificación interna">
              <select
                value={d.calificacion ?? ""}
                onChange={(e) => set("calificacion", e.target.value ? Number(e.target.value) : null)}
                className={inputCls}
              >
                <option value="">Sin calificar</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
              </select>
            </Campo>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={d.activo} onChange={(e) => set("activo", e.target.checked)} /> Activo
              </label>
            </div>
            <Campo label="Notas" span>
              <textarea rows={2} {...t("notas")} className={cn(inputCls, "resize-none")} />
            </Campo>
          </div>
        </section>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button type="submit" className="flex-1" isLoading={isPending}>{inicial ? "Guardar cambios" : "Agregar"}</Button>
        </div>
      </form>
    </Modal>
  )
}

function ModalContrato({
  subcontratistaId,
  contrato,
  contratos,
  proyectos,
  actividades,
  onClose,
  onGuardado,
}: {
  subcontratistaId: string
  contrato: Subcontrato | null
  contratos: Subcontrato[]
  proyectos: ProyectoOpcion[]
  actividades: ActividadOpcion[]
  onClose: () => void
  onGuardado: () => void
}) {
  const [proyectoId, setProyectoId] = useState(contrato?.proyecto_id ?? proyectos[0]?.id ?? "")
  const [alcance, setAlcance] = useState(contrato?.alcance ?? "")
  const [monto, setMonto] = useState(String(contrato?.monto_contrato ?? ""))
  const [fechaInicio, setFechaInicio] = useState(contrato?.fecha_inicio ?? "")
  const [fechaFin, setFechaFin] = useState(contrato?.fecha_fin ?? "")
  const [estado, setEstado] = useState<Subcontrato["estado"]>(contrato?.estado ?? "borrador")
  const [notas, setNotas] = useState(contrato?.notas ?? "")
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(contrato?.actividad_ids ?? []))
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  // Actividades del proyecto que ya están en OTRO contrato no se pueden elegir
  const ocupadas = useMemo(() => {
    const m = new Set<string>()
    for (const c of contratos) {
      if (c.id === contrato?.id) continue
      c.actividad_ids.forEach((a) => m.add(a))
    }
    return m
  }, [contratos, contrato])

  const disponibles = actividades.filter((a) => a.proyecto_id === proyectoId && !ocupadas.has(a.id))

  const cambiarProyecto = (id: string) => {
    setProyectoId(id)
    setSeleccion(new Set())
  }

  const alternar = (id: string) =>
    setSeleccion((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const guardar = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const input: SubcontratoInput = {
      subcontratista_id: subcontratistaId,
      proyecto_id: proyectoId,
      alcance,
      monto_contrato: Number(monto) || 0,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      estado,
      notas: notas || null,
    }
    startTransition(async () => {
      const ids = Array.from(seleccion)
      const res = contrato ? await actualizarSubcontrato(contrato.id, input, ids) : await crearSubcontrato(input, ids)
      if (res.error) setError(res.error)
      else onGuardado()
    })
  }

  return (
    <Modal titulo={contrato ? "Editar contrato" : "Nuevo contrato"} onClose={onClose} ancho="max-w-xl">
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Proyecto *" span>
            <select value={proyectoId} onChange={(e) => cambiarProyecto(e.target.value)} disabled={!!contrato} className={inputCls} required>
              {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo label="Alcance *" span>
            <textarea required rows={2} value={alcance} onChange={(e) => setAlcance(e.target.value)} className={cn(inputCls, "resize-none")} placeholder="Qué trabajo cubre este contrato" />
          </Campo>
          <Campo label="Monto del contrato ($)">
            <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Estado">
            <select value={estado} onChange={(e) => setEstado(e.target.value as Subcontrato["estado"])} className={inputCls}>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Campo>
          <Campo label="Inicio"><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputCls} /></Campo>
          <Campo label="Fin"><input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inputCls} /></Campo>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-700 mb-1">
            Actividades cubiertas <span className="text-slate-400 font-normal">({seleccion.size} seleccionadas)</span>
          </p>
          <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-50">
            {disponibles.length === 0 ? (
              <p className="p-3 text-xs text-slate-400 italic">No hay actividades libres en este proyecto.</p>
            ) : (
              disponibles.map((a) => (
                <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={seleccion.has(a.id)} onChange={() => alternar(a.id)} />
                  <span className="font-mono text-slate-400">{a.codigo}</span>
                  <span className="text-slate-700">{a.nombre}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <Campo label="Notas"><textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={cn(inputCls, "resize-none")} /></Campo>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button type="submit" className="flex-1" isLoading={isPending}>{contrato ? "Guardar" : "Crear contrato"}</Button>
        </div>
      </form>
    </Modal>
  )
}
