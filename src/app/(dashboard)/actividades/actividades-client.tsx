"use client"

import { useState, useTransition } from "react"
import {
  CheckCircle, Play, Ban, Circle, AlertTriangle,
  Pencil, Trash2, Plus, Check, X, Loader2,
} from "lucide-react"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  actualizarProyectoInfo, crearProceso, actualizarProceso, eliminarProceso,
  crearActividad, actualizarActividad, eliminarActividad,
  type ProyectoInfoInput, type ActividadInput,
} from "./actions"

type Actividad = {
  id: string
  codigo: string
  nombre: string
  estado: string
  activa?: boolean
  avance_porcentaje: number
  es_critica: boolean
  riesgo_nivel: string
  disciplina: string | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  duracion_plan_dias: number | null
  holgura_dias: number
  costo_presupuesto: number
  costo_real: number
  costo_material: number | null
  costo_mano_obra: number | null
  cantidad_objetivo: number | null
  unidad: string | null
}

type Proceso = {
  id: string
  codigo: string
  nombre: string
  orden: number
  actividades: Actividad[]
}

export type ProyectoConActividades = {
  id: string
  codigo: string
  nombre: string
  cliente: string | null
  cliente_email: string | null
  cliente_telefono: string | null
  ubicacion: string | null
  presupuesto_base: number
  presupuesto_venta: number
  margen_objetivo: number
  procesos: Proceso[]
}

const actividadVacia: ActividadInput = {
  codigo: "",
  nombre: "",
  disciplina: null,
  costo_material: 0,
  costo_mano_obra: 0,
  cantidad_objetivo: null,
  unidad: null,
  duracion_plan_dias: 1,
  fecha_inicio_plan: null,
  fecha_fin_plan: null,
  es_critica: false,
}

function EstadoIcon({ estado }: { estado: string }) {
  const cls = "h-4 w-4 shrink-0"
  switch (estado) {
    case "completada":  return <CheckCircle className={cn(cls, "text-emerald-600")} />
    case "en_progreso": return <Play        className={cn(cls, "text-blue-600")} />
    case "bloqueada":   return <Ban         className={cn(cls, "text-red-600")} />
    case "cancelada":   return <Ban         className={cn(cls, "text-slate-400")} />
    default:            return <Circle      className={cn(cls, "text-slate-300")} />
  }
}

function estadoLabel(e: string) {
  const m: Record<string, string> = {
    completada: "Completada", en_progreso: "En progreso",
    bloqueada: "Bloqueada", cancelada: "Cancelada", no_iniciada: "No iniciada",
  }
  return m[e] ?? e
}

function estadoVariant(e: string): "default" | "success" | "secondary" | "destructive" {
  if (e === "completada") return "success"
  if (e === "en_progreso") return "default"
  if (e === "bloqueada") return "destructive"
  return "secondary"
}

const inputCls = "border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"

export function ActividadesClient({
  proyectos, puedeEditar,
}: { proyectos: ProyectoConActividades[]; puedeEditar: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Edición de datos de proyecto
  const [editandoProyectoId, setEditandoProyectoId] = useState<string | null>(null)
  const [draftProyecto, setDraftProyecto] = useState<ProyectoInfoInput | null>(null)

  // Edición / creación de procesos
  const [editandoProcesoId, setEditandoProcesoId] = useState<string | null>(null)
  const [draftProceso, setDraftProceso] = useState<{ codigo: string; nombre: string } | null>(null)
  const [creandoProcesoEn, setCreandoProcesoEn] = useState<string | null>(null)
  const [draftNuevoProceso, setDraftNuevoProceso] = useState({ codigo: "", nombre: "" })

  // Edición / creación de actividades
  const [editandoActividadId, setEditandoActividadId] = useState<string | null>(null)
  const [draftActividad, setDraftActividad] = useState<ActividadInput | null>(null)
  const [creandoActividadEn, setCreandoActividadEn] = useState<{ proyectoId: string; procesoId: string } | null>(null)
  const [draftNuevaActividad, setDraftNuevaActividad] = useState<ActividadInput>(actividadVacia)

  const iniciarEdicionProyecto = (p: ProyectoConActividades) => {
    setError(null)
    setEditandoProyectoId(p.id)
    setDraftProyecto({
      nombre: p.nombre,
      cliente: p.cliente,
      cliente_email: p.cliente_email,
      cliente_telefono: p.cliente_telefono,
      ubicacion: p.ubicacion,
      presupuesto_base: p.presupuesto_base,
      presupuesto_venta: p.presupuesto_venta,
      margen_objetivo: p.margen_objetivo,
    })
  }

  const guardarProyecto = (proyectoId: string) => {
    if (!draftProyecto) return
    setError(null)
    startTransition(async () => {
      const res = await actualizarProyectoInfo(proyectoId, draftProyecto)
      if (res.error) setError(res.error)
      else { setEditandoProyectoId(null); setDraftProyecto(null) }
    })
  }

  const iniciarEdicionProceso = (proc: Proceso) => {
    setError(null)
    setEditandoProcesoId(proc.id)
    setDraftProceso({ codigo: proc.codigo, nombre: proc.nombre })
  }

  const guardarProceso = (procesoId: string) => {
    if (!draftProceso) return
    setError(null)
    startTransition(async () => {
      const res = await actualizarProceso(procesoId, draftProceso.codigo, draftProceso.nombre)
      if (res.error) setError(res.error)
      else { setEditandoProcesoId(null); setDraftProceso(null) }
    })
  }

  const borrarProceso = (procesoId: string) => {
    if (!confirm("¿Eliminar este proceso? Solo se puede si no tiene actividades.")) return
    setError(null)
    startTransition(async () => {
      const res = await eliminarProceso(procesoId)
      if (res.error) setError(res.error)
    })
  }

  const guardarNuevoProceso = (proyectoId: string) => {
    if (!draftNuevoProceso.nombre.trim()) { setError("El nombre del proceso es obligatorio"); return }
    setError(null)
    startTransition(async () => {
      const res = await crearProceso(proyectoId, draftNuevoProceso.codigo, draftNuevoProceso.nombre)
      if (res.error) setError(res.error)
      else { setCreandoProcesoEn(null); setDraftNuevoProceso({ codigo: "", nombre: "" }) }
    })
  }

  const iniciarEdicionActividad = (act: Actividad) => {
    setError(null)
    setEditandoActividadId(act.id)
    setDraftActividad({
      codigo: act.codigo,
      nombre: act.nombre,
      disciplina: act.disciplina,
      costo_material: act.costo_material ?? 0,
      costo_mano_obra: act.costo_mano_obra ?? 0,
      cantidad_objetivo: act.cantidad_objetivo,
      unidad: act.unidad,
      duracion_plan_dias: act.duracion_plan_dias ?? 1,
      fecha_inicio_plan: act.fecha_inicio_plan,
      fecha_fin_plan: act.fecha_fin_plan,
      es_critica: act.es_critica,
    })
  }

  const guardarActividad = (actividadId: string) => {
    if (!draftActividad) return
    if (!draftActividad.nombre.trim()) { setError("El nombre de la actividad es obligatorio"); return }
    setError(null)
    startTransition(async () => {
      const res = await actualizarActividad(actividadId, draftActividad)
      if (res.error) setError(res.error)
      else { setEditandoActividadId(null); setDraftActividad(null) }
    })
  }

  const borrarActividad = (actividadId: string) => {
    if (!confirm("¿Eliminar esta actividad?")) return
    setError(null)
    startTransition(async () => {
      const res = await eliminarActividad(actividadId)
      if (res.error) setError(res.error)
    })
  }

  const guardarNuevaActividad = () => {
    if (!creandoActividadEn) return
    if (!draftNuevaActividad.nombre.trim()) { setError("El nombre de la actividad es obligatorio"); return }
    setError(null)
    startTransition(async () => {
      const res = await crearActividad(creandoActividadEn.proyectoId, creandoActividadEn.procesoId, draftNuevaActividad)
      if (res.error) setError(res.error)
      else { setCreandoActividadEn(null); setDraftNuevaActividad(actividadVacia) }
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {proyectos.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="text-lg font-medium">Sin actividades</p>
          <p className="text-sm mt-1">Crea un proyecto y agrega actividades</p>
        </div>
      ) : (
        proyectos.map((proy) => (
          <div key={proy.id}>
            <div className="flex items-start gap-2 mb-3">
              <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded shrink-0 mt-0.5">{proy.codigo}</span>
              <h2 className="text-base font-semibold text-slate-900">{proy.nombre}</h2>
              {puedeEditar && editandoProyectoId !== proy.id && (
                <button
                  onClick={() => iniciarEdicionProyecto(proy)}
                  className="text-slate-300 hover:text-slate-600 transition-colors ml-1"
                  title="Editar datos del proyecto"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editandoProyectoId === proy.id && draftProyecto && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Nombre del proyecto</label>
                  <input value={draftProyecto.nombre} onChange={(e) => setDraftProyecto({ ...draftProyecto, nombre: e.target.value })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Cliente</label>
                  <input value={draftProyecto.cliente ?? ""} onChange={(e) => setDraftProyecto({ ...draftProyecto, cliente: e.target.value || null })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Ubicación</label>
                  <input value={draftProyecto.ubicacion ?? ""} onChange={(e) => setDraftProyecto({ ...draftProyecto, ubicacion: e.target.value || null })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Correo del cliente</label>
                  <input value={draftProyecto.cliente_email ?? ""} onChange={(e) => setDraftProyecto({ ...draftProyecto, cliente_email: e.target.value || null })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Teléfono del cliente</label>
                  <input value={draftProyecto.cliente_telefono ?? ""} onChange={(e) => setDraftProyecto({ ...draftProyecto, cliente_telefono: e.target.value || null })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Presupuesto base ($)</label>
                  <input type="number" value={draftProyecto.presupuesto_base} onChange={(e) => setDraftProyecto({ ...draftProyecto, presupuesto_base: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Presupuesto venta ($)</label>
                  <input type="number" value={draftProyecto.presupuesto_venta} onChange={(e) => setDraftProyecto({ ...draftProyecto, presupuesto_venta: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-full")} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Margen objetivo (%)</label>
                  <input type="number" value={draftProyecto.margen_objetivo} onChange={(e) => setDraftProyecto({ ...draftProyecto, margen_objetivo: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-full")} />
                </div>
                <div className="col-span-2 flex items-center gap-2 justify-end">
                  <button onClick={() => { setEditandoProyectoId(null); setDraftProyecto(null) }} disabled={isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </button>
                  <button onClick={() => guardarProyecto(proy.id)} disabled={isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#3B72D8] hover:bg-[#3163C2] text-white text-xs font-medium disabled:opacity-60">
                    {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {proy.procesos.map((proc) => {
                const acts = proc.actividades
                const promedioAvance = acts.length > 0
                  ? Math.round(acts.reduce((s, a) => s + (a.avance_porcentaje ?? 0), 0) / acts.length)
                  : 0

                return (
                  <div key={proc.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                      {editandoProcesoId === proc.id && draftProceso ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input value={draftProceso.codigo} onChange={(e) => setDraftProceso({ ...draftProceso, codigo: e.target.value })} className={cn(inputCls, "w-16")} placeholder="Código" />
                          <input value={draftProceso.nombre} onChange={(e) => setDraftProceso({ ...draftProceso, nombre: e.target.value })} className={cn(inputCls, "flex-1")} placeholder="Nombre del proceso" />
                          <button onClick={() => guardarProceso(proc.id)} disabled={isPending} className="text-emerald-600 hover:text-emerald-700"><Check className="h-4 w-4" /></button>
                          <button onClick={() => { setEditandoProcesoId(null); setDraftProceso(null) }} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">{proc.codigo}</span>
                          <h3 className="text-sm font-semibold text-slate-800">{proc.nombre}</h3>
                          <span className="text-xs text-slate-400">· {acts.length} actividad{acts.length !== 1 ? "es" : ""}</span>
                          {puedeEditar && (
                            <>
                              <button onClick={() => iniciarEdicionProceso(proc)} className="text-slate-300 hover:text-slate-600 transition-colors" title="Renombrar proceso">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => borrarProceso(proc.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar proceso">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 shrink-0">
                        <Progress value={promedioAvance} className="w-20 h-1.5" />
                        <span className="text-xs font-medium text-slate-600">{promedioAvance}%</span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-50">
                      {acts.map((act) => (
                        editandoActividadId === act.id && draftActividad ? (
                          <div key={act.id} className="px-4 py-3 bg-slate-50/50 flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <input value={draftActividad.codigo} onChange={(e) => setDraftActividad({ ...draftActividad, codigo: e.target.value })} className={cn(inputCls, "w-16")} placeholder="Código" />
                              <input value={draftActividad.nombre} onChange={(e) => setDraftActividad({ ...draftActividad, nombre: e.target.value })} className={cn(inputCls, "flex-1 min-w-[180px]")} placeholder="Nombre" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input type="number" value={draftActividad.cantidad_objetivo ?? ""} onChange={(e) => setDraftActividad({ ...draftActividad, cantidad_objetivo: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-16")} title="Cantidad" placeholder="Cant." />
                              <input value={draftActividad.unidad ?? ""} onChange={(e) => setDraftActividad({ ...draftActividad, unidad: e.target.value || null })} className={cn(inputCls, "w-14")} title="Unidad" placeholder="UM" />
                              <input type="number" value={draftActividad.costo_material} onChange={(e) => setDraftActividad({ ...draftActividad, costo_material: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-20")} title="Costo material ($)" placeholder="Material $" />
                              <input type="number" value={draftActividad.costo_mano_obra} onChange={(e) => setDraftActividad({ ...draftActividad, costo_mano_obra: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-20")} title="Costo mano de obra ($)" placeholder="M.O. $" />
                              <input type="number" value={draftActividad.duracion_plan_dias} onChange={(e) => setDraftActividad({ ...draftActividad, duracion_plan_dias: parseFloat(e.target.value) || 1 })} className={cn(inputCls, "w-16")} title="Días de duración" placeholder="Días" />
                              <input type="date" value={draftActividad.fecha_inicio_plan ?? ""} onChange={(e) => setDraftActividad({ ...draftActividad, fecha_inicio_plan: e.target.value || null })} className={cn(inputCls, "w-36")} title="Fecha inicio plan" />
                              <input type="date" value={draftActividad.fecha_fin_plan ?? ""} onChange={(e) => setDraftActividad({ ...draftActividad, fecha_fin_plan: e.target.value || null })} className={cn(inputCls, "w-36")} title="Fecha fin plan" />
                              <input value={draftActividad.disciplina ?? ""} onChange={(e) => setDraftActividad({ ...draftActividad, disciplina: e.target.value || null })} className={cn(inputCls, "w-28")} title="Disciplina / cuadrilla" placeholder="Disciplina" />
                              <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                                <input type="checkbox" checked={draftActividad.es_critica} onChange={(e) => setDraftActividad({ ...draftActividad, es_critica: e.target.checked })} className="h-3.5 w-3.5" />
                                Crítica
                              </label>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => { setEditandoActividadId(null); setDraftActividad(null) }} disabled={isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
                                <X className="h-3.5 w-3.5" /> Cancelar
                              </button>
                              <button onClick={() => guardarActividad(act.id)} disabled={isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#3B72D8] hover:bg-[#3163C2] text-white text-xs font-medium disabled:opacity-60">
                                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div key={act.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                            <EstadoIcon estado={act.estado} />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-slate-400">{act.codigo}</span>
                                <span className="text-sm font-medium text-slate-800 truncate">{act.nombre}</span>
                                {act.es_critica && (
                                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">Crítica</span>
                                )}
                                {act.riesgo_nivel === "rojo" && <AlertaBadge nivel="rojo" />}
                                {act.riesgo_nivel === "amarillo" && <AlertaBadge nivel="amarillo" />}
                              </div>

                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                <Progress value={act.avance_porcentaje ?? 0} className="w-24 h-1" />
                                <span className="text-xs text-slate-500">{act.avance_porcentaje ?? 0}%</span>
                                {act.cantidad_objetivo != null && (
                                  <span className="text-xs text-slate-400">{act.cantidad_objetivo} {act.unidad ?? ""}</span>
                                )}
                                <span className="text-xs text-slate-400">
                                  ${(act.costo_presupuesto ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                                {act.fecha_fin_plan && (
                                  <span className="text-xs text-slate-400">Fin plan: {act.fecha_fin_plan}</span>
                                )}
                                {(act.holgura_dias ?? 0) > 0 && (
                                  <span className="text-xs text-slate-400">Holgura: {act.holgura_dias}d</span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-right hidden sm:block">
                              <Badge variant={estadoVariant(act.estado)} className="text-xs">
                                {estadoLabel(act.estado)}
                              </Badge>
                            </div>

                            {puedeEditar && (
                              <div className="shrink-0 flex items-center gap-1">
                                <button onClick={() => iniciarEdicionActividad(act)} className="text-slate-300 hover:text-slate-600 transition-colors" title="Editar actividad">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => borrarActividad(act.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Eliminar actividad">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      ))}

                      {acts.length === 0 && (
                        <p className="text-xs text-slate-400 px-4 py-3">Sin actividades en este proceso.</p>
                      )}

                      {puedeEditar && creandoActividadEn?.procesoId === proc.id && (
                        <div className="px-4 py-3 bg-slate-50/50 flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <input value={draftNuevaActividad.codigo} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, codigo: e.target.value })} className={cn(inputCls, "w-16")} placeholder="Código" />
                            <input value={draftNuevaActividad.nombre} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, nombre: e.target.value })} className={cn(inputCls, "flex-1 min-w-[180px]")} placeholder="Nombre de la actividad" />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <input type="number" value={draftNuevaActividad.cantidad_objetivo ?? ""} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, cantidad_objetivo: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-16")} placeholder="Cant." />
                            <input value={draftNuevaActividad.unidad ?? ""} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, unidad: e.target.value || null })} className={cn(inputCls, "w-14")} placeholder="UM" />
                            <input type="number" value={draftNuevaActividad.costo_material} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, costo_material: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-20")} placeholder="Material $" />
                            <input type="number" value={draftNuevaActividad.costo_mano_obra} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, costo_mano_obra: parseFloat(e.target.value) || 0 })} className={cn(inputCls, "w-20")} placeholder="M.O. $" />
                            <input type="number" value={draftNuevaActividad.duracion_plan_dias} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, duracion_plan_dias: parseFloat(e.target.value) || 1 })} className={cn(inputCls, "w-16")} placeholder="Días" />
                            <input type="date" value={draftNuevaActividad.fecha_inicio_plan ?? ""} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, fecha_inicio_plan: e.target.value || null })} className={cn(inputCls, "w-36")} />
                            <input type="date" value={draftNuevaActividad.fecha_fin_plan ?? ""} onChange={(e) => setDraftNuevaActividad({ ...draftNuevaActividad, fecha_fin_plan: e.target.value || null })} className={cn(inputCls, "w-36")} />
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => { setCreandoActividadEn(null); setDraftNuevaActividad(actividadVacia) }} disabled={isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
                              <X className="h-3.5 w-3.5" /> Cancelar
                            </button>
                            <button onClick={guardarNuevaActividad} disabled={isPending} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#3B72D8] hover:bg-[#3163C2] text-white text-xs font-medium disabled:opacity-60">
                              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                            </button>
                          </div>
                        </div>
                      )}

                      {puedeEditar && creandoActividadEn?.procesoId !== proc.id && (
                        <button
                          onClick={() => { setCreandoActividadEn({ proyectoId: proy.id, procesoId: proc.id }); setDraftNuevaActividad(actividadVacia); setError(null) }}
                          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Agregar actividad
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {puedeEditar && creandoProcesoEn === proy.id && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                  <input value={draftNuevoProceso.codigo} onChange={(e) => setDraftNuevoProceso({ ...draftNuevoProceso, codigo: e.target.value })} className={cn(inputCls, "w-16")} placeholder="Código" />
                  <input value={draftNuevoProceso.nombre} onChange={(e) => setDraftNuevoProceso({ ...draftNuevoProceso, nombre: e.target.value })} className={cn(inputCls, "flex-1")} placeholder="Nombre del proceso" />
                  <button onClick={() => { setCreandoProcesoEn(null); setDraftNuevoProceso({ codigo: "", nombre: "" }) }} disabled={isPending} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                  <button onClick={() => guardarNuevoProceso(proy.id)} disabled={isPending} className="text-emerald-600 hover:text-emerald-700">
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {puedeEditar && creandoProcesoEn !== proy.id && (
                <button
                  onClick={() => { setCreandoProcesoEn(proy.id); setError(null) }}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl hover:text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar proceso
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
