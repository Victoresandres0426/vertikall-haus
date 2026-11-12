"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Search, Phone, Mail, Pencil, Trash2, HardHat, Star, AlertTriangle, FileSignature, ChevronDown, ChevronUp, Download, Upload, Eye } from "lucide-react"
import { leerFormulario, type FormularioLeido } from "./importar-formulario"
import { leerFormularioConIA } from "./importar-pdf-actions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  crearSubcontratista,
  actualizarSubcontratista,
  eliminarSubcontratista,
  crearSubcontrato,
  actualizarSubcontrato,
  eliminarSubcontrato,
  registrarDocumentoSubcontratista,
  eliminarDocumentoSubcontratista,
  type SubcontratistaInput,
  type SubcontratoInput,
  type TipoDocumento,
} from "./actions"
import { createClient } from "@/lib/supabase/client"

export type Subcontratista = SubcontratistaInput & { id: string }
export type Subcontrato = SubcontratoInput & { id: string; actividad_ids: string[] }
export type ProyectoOpcion = { id: string; codigo: string | null; nombre: string }
export type ActividadOpcion = { id: string; proyecto_id: string; codigo: string; nombre: string }
export type DocumentoSub = {
  id: string
  subcontratista_id: string
  tipo: TipoDocumento
  nombre_archivo: string
  storage_path: string
  fecha_vence: string | null
  notas: string | null
  created_at: string
}

const TIPOS_DOC: Record<TipoDocumento, string> = {
  seguro: "Seguro",
  licencia: "Licencia",
  w9: "W-9",
  workers_comp: "Workers' comp",
  contrato: "Contrato firmado",
  otro: "Otro",
}

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
  nombre_compania: "", contacto_nombre: null, contacto_cargo: null, telefono: null, email: null,
  contacto2_nombre: null, contacto2_cargo: null, contacto2_telefono: null, contacto2_email: null,
  direccion: null, sitio_web: null,
  especialidad: null, ein: null, w9_recibido: false, licencia_numero: null, licencia_vence: null,
  seguro_aseguradora: null, seguro_poliza: null, seguro_vence: null, workers_comp: false,
  metodo_pago: null, datos_pago: null, calificacion: null, activo: true, notas: null,
}

export function SubcontratistasClient({
  subcontratistas,
  contratos,
  proyectos,
  actividades,
  documentos,
  empresaId,
  puedeBorrar,
}: {
  subcontratistas: Subcontratista[]
  contratos: Subcontrato[]
  proyectos: ProyectoOpcion[]
  actividades: ActividadOpcion[]
  documentos: DocumentoSub[]
  empresaId: string
  puedeBorrar: boolean
}) {
  const router = useRouter()
  const [busqueda, setBusqueda] = useState("")
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState<Subcontratista | "nuevo" | null>(null)
  const [viendo, setViendo] = useState<Subcontratista | null>(null)
  const [contratoModal, setContratoModal] = useState<{ subcontratistaId: string; contrato: Subcontrato | null } | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [importados, setImportados] = useState<FormularioLeido[] | null>(null)
  const [leyendo, setLeyendo] = useState(false)
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
      return `${s.nombre_compania} ${s.contacto_nombre ?? ""} ${s.contacto2_nombre ?? ""} ${s.especialidad ?? ""} ${s.telefono ?? ""} ${s.email ?? ""}`
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
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/plantillas/Formulario_Subcontratista.xlsx"
            download
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Descargar formulario
          </a>
          <label className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 cursor-pointer">
            <Upload className="h-4 w-4" /> Importar formularios (Excel, PDF o foto)
            <input
              type="file"
              accept=".xlsx,.pdf,.png,.jpg,.jpeg"
              multiple
              className="hidden"
              onChange={async (e) => {
                const archivos = Array.from(e.target.files ?? [])
                e.target.value = ""
                if (archivos.length === 0) return
                setLeyendo(true)
                // Excel: lectura local. PDF/foto: la IA extrae los datos (uno por uno).
                const leidos: FormularioLeido[] = []
                for (const archivo of archivos) {
                  if (/\.xlsx$/i.test(archivo.name)) {
                    leidos.push(await leerFormulario(archivo))
                  } else {
                    const fd = new FormData()
                    fd.set("archivo", archivo)
                    try {
                      leidos.push(await leerFormularioConIA(fd))
                    } catch {
                      leidos.push({ archivo: archivo.name, datos: null, error: "No se pudo leer el archivo." })
                    }
                  }
                }
                setImportados(leidos)
                setLeyendo(false)
              }}
            />
          </label>
          <Button onClick={() => setEditando("nuevo")}>
            <Plus className="h-4 w-4 mr-1" /> Agregar subcontratista
          </Button>
        </div>
      </div>
      {leyendo && <p className="text-xs text-slate-400">Leyendo archivos… (los PDF y fotos los lee la IA, puede tardar unos segundos por archivo)</p>}
      {importados && (
        <ModalImportar
          leidos={importados}
          existentes={subcontratistas}
          onClose={() => setImportados(null)}
          onTerminado={() => { setImportados(null); router.refresh() }}
        />
      )}

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
                      <button
                        onClick={() => setViendo(s)}
                        className="text-sm font-semibold text-slate-900 hover:text-blue-600 hover:underline text-left"
                        title="Ver detalles"
                      >
                        {s.nombre_compania}
                      </button>
                      {s.especialidad && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{s.especialidad}</span>}
                      {!s.activo && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Inactivo</span>}
                      {s.calificacion && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600">
                          <Star className="h-3 w-3 fill-current" /> {s.calificacion}
                        </span>
                      )}
                    </div>
                    {s.contacto_nombre && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s.contacto_nombre}{s.contacto_cargo ? ` · ${s.contacto_cargo}` : ""}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                      {s.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {s.telefono}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {s.email}</span>}
                    </div>
                    {s.contacto2_nombre && (
                      <p className="text-xs text-slate-500 mt-1.5">
                        {s.contacto2_nombre}{s.contacto2_cargo ? ` · ${s.contacto2_cargo}` : ""}
                        {s.contacto2_telefono ? ` · ${s.contacto2_telefono}` : ""}
                      </p>
                    )}
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
                      {documentos
                        .filter((d) => d.subcontratista_id === s.id && estadoVencimiento(d.fecha_vence))
                        .map((d) => (
                          <span
                            key={d.id}
                            className={cn("flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded", estadoVencimiento(d.fecha_vence) === "vencido" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}
                          >
                            <AlertTriangle className="h-3 w-3" /> {TIPOS_DOC[d.tipo]} {estadoVencimiento(d.fecha_vence) === "vencido" ? "vencido" : "vence pronto"} ({formatoFecha(d.fecha_vence)})
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <p className="text-slate-400">Contratos activos</p>
                    <p className="text-base font-semibold text-slate-900">{money(montoActivo)}</p>
                    <p className="text-slate-400">{susContratos.length} contrato(s) en total</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViendo(s)}
                      className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" /> Detalles
                    </button>
                    <button
                      onClick={() => setEditando(s)}
                      className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
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
                    <DocumentosSub
                      subcontratistaId={s.id}
                      empresaId={empresaId}
                      docs={documentos.filter((d) => d.subcontratista_id === s.id)}
                      puedeBorrar={puedeBorrar}
                      onCambio={() => router.refresh()}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {viendo && (
        <ModalDetalle
          s={viendo}
          documentos={documentos.filter((d) => d.subcontratista_id === viendo.id)}
          onClose={() => setViendo(null)}
          onEditar={() => { setEditando(viendo); setViendo(null) }}
        />
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

function DocumentosSub({
  subcontratistaId,
  empresaId,
  docs,
  puedeBorrar,
  onCambio,
}: {
  subcontratistaId: string
  empresaId: string
  docs: DocumentoSub[]
  puedeBorrar: boolean
  onCambio: () => void
}) {
  const [tipo, setTipo] = useState<TipoDocumento>("seguro")
  const [vence, setVence] = useState("")
  const [notas, setNotas] = useState("")
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState("")
  const [, startTransition] = useTransition()

  const subir = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError("")
    setSubiendo(true)
    const supabase = createClient()
    for (const file of Array.from(files)) {
      const limpio = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `${empresaId}/${subcontratistaId}/${Date.now()}_${limpio}`
      const { error: errSubida } = await supabase.storage.from("subcontratistas-docs").upload(path, file)
      if (errSubida) {
        setError(`Error subiendo ${file.name}: ${errSubida.message}`)
        continue
      }
      const res = await registrarDocumentoSubcontratista({
        subcontratistaId,
        tipo,
        nombreArchivo: file.name,
        storagePath: path,
        fechaVence: vence || null,
        notas: notas || null,
      })
      if (res.error) setError(res.error)
    }
    setSubiendo(false)
    setVence("")
    setNotas("")
    onCambio()
  }

  const abrir = async (d: DocumentoSub) => {
    const supabase = createClient()
    const { data, error: errUrl } = await supabase.storage.from("subcontratistas-docs").createSignedUrl(d.storage_path, 60)
    if (errUrl || !data) {
      setError("No se pudo abrir el documento.")
      return
    }
    window.open(data.signedUrl, "_blank")
  }

  const borrar = (d: DocumentoSub) => {
    if (!confirm(`¿Borrar "${d.nombre_archivo}"?`)) return
    startTransition(async () => {
      const res = await eliminarDocumentoSubcontratista(d.id)
      if (res.error) alert(res.error)
      else onCambio()
    })
  }

  return (
    <div className="pt-3 mt-3 border-t border-slate-200 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Documentos ({docs.length})</p>
      {docs.length === 0 && <p className="text-xs text-slate-400 italic">Sin documentos todavía.</p>}
      {docs.map((d) => {
        const est = estadoVencimiento(d.fecha_vence)
        return (
          <div key={d.id} className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">{TIPOS_DOC[d.tipo]}</span>
            <button onClick={() => abrir(d)} className="text-blue-600 hover:underline truncate max-w-[280px] text-left" title="Abrir">
              {d.nombre_archivo}
            </button>
            {d.fecha_vence && (
              <span className={cn(est === "vencido" ? "text-red-600 font-medium" : est === "pronto" ? "text-amber-600 font-medium" : "text-slate-500")}>
                vence {formatoFecha(d.fecha_vence)}
              </span>
            )}
            {d.notas && <span className="text-slate-400 truncate max-w-[200px]">{d.notas}</span>}
            {puedeBorrar && (
              <button onClick={() => borrar(d)} className="ml-auto text-slate-300 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} className="border border-slate-200 rounded-md px-2 py-1.5 text-xs bg-white">
            {Object.entries(TIPOS_DOC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">Vence (opcional)</label>
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="border border-slate-200 rounded-md px-2 py-1 text-xs" />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] text-slate-500 mb-0.5">Nota (opcional)</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs" />
        </div>
        <label className={cn("inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 rounded-md px-3 py-1.5 bg-white cursor-pointer hover:bg-slate-50", subiendo && "opacity-60 pointer-events-none")}>
          <Upload className="h-3.5 w-3.5" /> {subiendo ? "Subiendo…" : "Subir archivo"}
          <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx" className="hidden" onChange={(e) => { void subir(e.target.files); e.target.value = "" }} />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  const vacio = valor === null || valor === undefined || valor === ""
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={cn("text-sm break-words", vacio ? "text-slate-300" : "text-slate-800")}>{vacio ? "—" : valor}</p>
    </div>
  )
}

function ModalDetalle({
  s,
  documentos,
  onClose,
  onEditar,
}: {
  s: Subcontratista
  documentos: DocumentoSub[]
  onClose: () => void
  onEditar: () => void
}) {
  const sec = "text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2"
  const rejilla = "grid grid-cols-2 gap-x-4 gap-y-3"
  const siNo = (v: boolean) => (v ? "Sí" : "No")
  const venc = (iso: string | null) => {
    const e = estadoVencimiento(iso)
    return (
      <span className={cn(e === "vencido" && "text-red-600 font-medium", e === "pronto" && "text-amber-600 font-medium")}>
        {formatoFecha(iso)}{e === "vencido" ? " (vencido)" : e === "pronto" ? " (vence pronto)" : ""}
      </span>
    )
  }

  return (
    <Modal titulo={s.nombre_compania} onClose={onClose}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 -mt-3">
          {s.especialidad && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{s.especialidad}</span>}
          <span className={cn("text-xs px-1.5 py-0.5 rounded", s.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>
            {s.activo ? "Activo" : "Inactivo"}
          </span>
          {s.calificacion && (
            <span className="flex items-center gap-0.5 text-xs text-amber-600"><Star className="h-3 w-3 fill-current" /> {s.calificacion}/5</span>
          )}
        </div>

        <section>
          <h4 className={sec}>Compañía</h4>
          <div className={rejilla}>
            <Dato label="Dirección" valor={s.direccion} />
            <Dato label="Sitio web" valor={s.sitio_web} />
          </div>
        </section>

        <section>
          <h4 className={sec}>Persona de contacto 1</h4>
          <div className={rejilla}>
            <Dato label="Nombre" valor={s.contacto_nombre} />
            <Dato label="Cargo / rol" valor={s.contacto_cargo} />
            <Dato label="Teléfono" valor={s.telefono} />
            <Dato label="Email" valor={s.email} />
          </div>
        </section>

        <section>
          <h4 className={sec}>Persona de contacto 2</h4>
          <div className={rejilla}>
            <Dato label="Nombre" valor={s.contacto2_nombre} />
            <Dato label="Cargo / rol" valor={s.contacto2_cargo} />
            <Dato label="Teléfono" valor={s.contacto2_telefono} />
            <Dato label="Email" valor={s.contacto2_email} />
          </div>
        </section>

        <section>
          <h4 className={sec}>Legales y fiscales</h4>
          <div className={rejilla}>
            <Dato label="EIN / Tax ID" valor={s.ein} />
            <Dato label="W-9 recibido" valor={siNo(s.w9_recibido)} />
            <Dato label="Licencia (número)" valor={s.licencia_numero} />
            <Dato label="Licencia vence" valor={s.licencia_vence ? venc(s.licencia_vence) : null} />
            <Dato label="Seguro: aseguradora" valor={s.seguro_aseguradora} />
            <Dato label="Seguro: póliza" valor={s.seguro_poliza} />
            <Dato label="Seguro vence" valor={s.seguro_vence ? venc(s.seguro_vence) : null} />
            <Dato label="Workers' comp" valor={siNo(s.workers_comp)} />
          </div>
        </section>

        <section>
          <h4 className={sec}>Datos de pago</h4>
          <div className={rejilla}>
            <Dato label="Método de pago" valor={s.metodo_pago} />
            <Dato label="Datos" valor={s.datos_pago} />
          </div>
        </section>

        {s.notas && (
          <section>
            <h4 className={sec}>Notas</h4>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.notas}</p>
          </section>
        )}

        <section>
          <h4 className={sec}>Documentos ({documentos.length})</h4>
          {documentos.length === 0 ? (
            <p className="text-sm text-slate-300">—</p>
          ) : (
            <ul className="text-sm text-slate-700 space-y-1">
              {documentos.map((d) => (
                <li key={d.id}>
                  {TIPOS_DOC[d.tipo]} · {d.nombre_archivo}
                  {d.fecha_vence && <span className="text-slate-400"> · vence {formatoFecha(d.fecha_vence)}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-400 mt-1">Para abrir o subir documentos usa el botón Contratos de la tarjeta.</p>
        </section>

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cerrar</Button>
          <Button type="button" className="flex-1" onClick={onEditar}>Editar</Button>
        </div>
      </div>
    </Modal>
  )
}

function ModalImportar({
  leidos,
  existentes,
  onClose,
  onTerminado,
}: {
  leidos: FormularioLeido[]
  existentes: Subcontratista[]
  onClose: () => void
  onTerminado: () => void
}) {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

  // Un formulario es duplicado si ya hay un subcontratista con el mismo nombre
  // o el mismo EIN (guardamos cuál es, para poder sustituirlo), o si aparece
  // dos veces en los archivos elegidos (ese segundo solo se puede omitir).
  const filas = useMemo(() => {
    const vistos = new Set<string>()
    return leidos.map((l) => {
      if (!l.datos) return { ...l, duplicado: false, existente: null as Subcontratista | null }
      const nombre = norm(l.datos.nombre_compania)
      const ein = norm(l.datos.ein)
      const existente = existentes.find((e) => norm(e.nombre_compania) === nombre || (ein && norm(e.ein) === ein)) ?? null
      const repetidoEnLote = vistos.has(nombre)
      vistos.add(nombre)
      return { ...l, duplicado: !!existente || repetidoEnLote, existente }
    })
  }, [leidos, existentes])

  // Para cada duplicado: omitir (por defecto) o sustituir los datos del existente
  const [acciones, setAcciones] = useState<Record<number, "omitir" | "sustituir">>({})
  const accionDe = (i: number) => acciones[i] ?? "omitir"

  const aImportar = filas
    .map((f, i) => ({ f, i }))
    .filter(({ f, i }) => f.datos && (!f.duplicado || (f.existente && accionDe(i) === "sustituir")))
  const [isPending, startTransition] = useTransition()
  const [errores, setErrores] = useState<string[]>([])

  // Sustituir = los datos del formulario reemplazan a los guardados; lo que el
  // formulario trae vacío NO borra lo que ya había (ni calificación, estado o notas).
  const fusionar = (actual: Subcontratista, nuevo: SubcontratistaInput): SubcontratistaInput => {
    const { id: _id, ...base } = actual
    void _id
    const resultado: SubcontratistaInput = { ...base }
    const r = resultado as unknown as Record<string, unknown>
    for (const k of Object.keys(nuevo) as (keyof SubcontratistaInput)[]) {
      if (k === "calificacion" || k === "activo" || k === "notas") continue
      const v = nuevo[k]
      if (typeof v === "boolean") {
        if (v) r[k] = true
      } else if (v !== null && v !== "") {
        r[k] = v
      }
    }
    return resultado
  }

  const importar = () => {
    startTransition(async () => {
      const fallos: string[] = []
      for (const { f } of aImportar) {
        const res = f.duplicado && f.existente
          ? await actualizarSubcontratista(f.existente.id, fusionar(f.existente, f.datos!))
          : await crearSubcontratista(f.datos!)
        if (res.error) fallos.push(`${f.datos!.nombre_compania}: ${res.error}`)
      }
      if (fallos.length > 0) setErrores(fallos)
      else onTerminado()
    })
  }

  return (
    <Modal titulo="Importar formularios" onClose={onClose} ancho="max-w-xl">
      <div className="space-y-2">
        {filas.map((f, i) => (
          <div key={i} className="flex items-start justify-between gap-3 border border-slate-200 rounded-lg p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-slate-800 truncate">{f.datos?.nombre_compania ?? f.archivo}</p>
              <p className="text-xs text-slate-400 truncate">{f.archivo}</p>
              {f.datos && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {[f.datos.especialidad, f.datos.telefono, f.datos.email].filter(Boolean).join(" · ") || "Sin más datos"}
                </p>
              )}
            </div>
            {f.error ? (
              <span className="text-xs text-red-600 text-right max-w-[200px]">{f.error}</span>
            ) : f.duplicado ? (
              <div className="shrink-0 text-right space-y-1">
                <span className="block text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                  {f.existente ? "Ya existe" : "Repetido en los archivos"}
                </span>
                <select
                  value={f.existente ? accionDe(i) : "omitir"}
                  disabled={!f.existente}
                  onChange={(e) => setAcciones((p) => ({ ...p, [i]: e.target.value as "omitir" | "sustituir" }))}
                  className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                >
                  <option value="omitir">Omitir</option>
                  <option value="sustituir">Sustituir datos</option>
                </select>
              </div>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">Nuevo</span>
            )}
          </div>
        ))}
      </div>
      {errores.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 space-y-1">
          {errores.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}
      <div className="flex gap-3 mt-5">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancelar</Button>
        <Button type="button" className="flex-1" onClick={importar} isLoading={isPending} disabled={aImportar.length === 0}>
          Importar {aImportar.length} subcontratista(s)
        </Button>
      </div>
    </Modal>
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Compañía</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Compañía *" span>
              <input required value={d.nombre_compania} onChange={(e) => set("nombre_compania", e.target.value)} className={inputCls} />
            </Campo>
            <Campo label="Especialidad / oficio"><input {...t("especialidad")} placeholder="Ej. Plomería, Electricidad" /></Campo>
            <Campo label="Sitio web"><input {...t("sitio_web")} /></Campo>
            <Campo label="Dirección" span><input {...t("direccion")} /></Campo>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Persona de contacto 1</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre"><input {...t("contacto_nombre")} /></Campo>
            <Campo label="Cargo / rol"><input {...t("contacto_cargo")} placeholder="Ej. Dueño, Administración" /></Campo>
            <Campo label="Teléfono"><input {...t("telefono")} /></Campo>
            <Campo label="Email"><input type="email" {...t("email")} /></Campo>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Persona de contacto 2</h4>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre"><input {...t("contacto2_nombre")} /></Campo>
            <Campo label="Cargo / rol"><input {...t("contacto2_cargo")} placeholder="Ej. Jefe de obra" /></Campo>
            <Campo label="Teléfono"><input {...t("contacto2_telefono")} /></Campo>
            <Campo label="Email"><input type="email" {...t("contacto2_email")} /></Campo>
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
