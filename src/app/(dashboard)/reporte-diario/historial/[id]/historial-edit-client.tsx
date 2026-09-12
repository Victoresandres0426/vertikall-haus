"use client"

import { useState, useTransition, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Save, ArrowLeft, AlertTriangle, Gauge } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { actualizarReporteDiario } from "../../actions"

export type TrabajadorHist = { id: string; nombre_completo: string; rol_obra: string | null }
export type ActividadHist = {
  id: string; codigo: string; nombre: string; unidad: string | null
  cantidad_objetivo: number | null; cantidad_ejecutada: number | null; avance_porcentaje: number
}
export type SplitInicial = { actividadId: string; rol: string; horas: number; avance: number }
export type AsistenciaInicial = { presente: boolean; horas_regulares: number; horas_extra: number }
export type AvanceInicial = { cantidad_ejecutada_dia: number; porcentaje_avance_total: number | null; incidencias: string }
// Rendimiento real vs. plan de este día -- ver lib/engine/rendimiento.ts.
// pct puede ser null (nadie tiene horas registradas todavía) o superar
// 100 (se produjo más rápido de lo que el plan asumía).
export type RendimientoTotales = { horasReales: number; horasEquivalentesPlan: number; pct: number | null }
export type RendimientoTrabajador = RendimientoTotales & { trabajadorId: string; nombre: string }

type AsistenciaState = "presente" | "medio_dia" | "ausente"

// "horasAuto" = true mientras las horas de ese renglón sigan viniendo
// del reparto automático de las horas regulares del trabajador entre
// sus actividades del día (en vez de un número puesto a mano) -- se
// apaga (false) en cuanto el capataz edita el campo "Horas" de ese
// renglón directamente, para no pisarle esa corrección.
type SplitState = { actividadId: string; rol: string; horas: number; avance: number; horasAuto: boolean }

type WorkerState = {
  id: string
  nombre_completo: string
  rol_obra: string | null
  asistencia: AsistenciaState
  horasRegulares: number
  horasExtra: number
  splits: SplitState[]
}

// "auto" = true mientras cantidadHoy siga viniendo automáticamente de la
// suma de los splits de Asistencia que apuntan a esta actividad -- se
// apaga (false) en cuanto alguien la agrega a mano con "+ Agregar avance
// de otra actividad" o edita el número directamente en su tarjeta, para
// no pisarle esa corrección.
type AvanceRow = { actividadId: string; cantidadHoy: number; porcentajeTotal: number | null; incidencias: string; auto: boolean }

// Texto de una opción del <select> de actividades -- incluye el % de
// avance reportado hasta ahora para poder identificar de un vistazo
// cuáles ya van avanzadas sin tener que salir a consultar Actividades.
function labelActividad(a: ActividadHist): string {
  const pct = a.avance_porcentaje ?? 0
  return `${a.codigo} — ${a.nombre} (${pct}%)`
}

// Envuelve un input con una etiqueta pequeña y siempre visible arriba
// -- a diferencia de un placeholder, no desaparece al escribir, así que
// cualquiera que use la app puede saber qué significa cada casilla sin
// tener que adivinar.
function CampoEtiquetado({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <label className="text-[10px] text-slate-400 leading-none">{label}</label>
      {children}
    </div>
  )
}

// Color según qué tan cerca (o lejos) del plan quedó el rendimiento --
// no es una nota "buena/mala" absoluta, solo resalta lo que más se aleja
// de 100% (tanto por debajo -- se produjo menos de lo esperado -- como
// muy por encima, que casi siempre es plan mal calibrado, no que de
// verdad se produjo varias veces más rápido de lo humanamente posible).
function colorRendimiento(pct: number | null): string {
  if (pct === null) return "text-slate-400"
  if (pct < 70) return "text-red-600"
  if (pct < 90) return "text-amber-600"
  if (pct > 150) return "text-amber-600"
  return "text-emerald-600"
}

function formatoPct(pct: number | null): string {
  return pct === null ? "—" : `${Math.round(pct)}%`
}

// Un rendimiento muy por encima de 100% casi nunca significa que se
// trabajó varias veces más rápido de lo planeado -- lo más común es que
// el plan de la actividad (cantidad propuesta / duración en días /
// personal planeado) todavía no está calibrado para este cálculo por
// hora-hombre (ej. una duración puesta a ojo antes de que existiera este
// indicador). Se avisa en vez de dejar el número solo, que se ve como un
// error del sistema cuando en realidad es un dato de plan por revisar.
function avisoRendimiento(pct: number | null): string | null {
  if (pct === null) return null
  if (pct > 150) return "revisa cantidad, duración o personal planeado de la actividad"
  return null
}

function estadoInicial(a: AsistenciaInicial | undefined): AsistenciaState {
  if (!a) return "ausente"
  if (!a.presente) return "ausente"
  return a.horas_regulares === 4 ? "medio_dia" : "presente"
}

export function HistorialEditClient({
  reporteId,
  proyectoId,
  fecha,
  clima: climaInicial,
  observaciones: observacionesInicial,
  trabajadores,
  actividades,
  asistenciaInicial,
  avanceInicial,
  splitsPorTrabajador,
  rendimientoDia,
  rendimientoPorTrabajador,
}: {
  reporteId: string
  proyectoId: string
  fecha: string
  clima: string | null
  observaciones: string | null
  trabajadores: TrabajadorHist[]
  actividades: ActividadHist[]
  asistenciaInicial: Record<string, AsistenciaInicial>
  avanceInicial: Record<string, AvanceInicial>
  splitsPorTrabajador: Record<string, SplitInicial[]>
  rendimientoDia: RendimientoTotales
  rendimientoPorTrabajador: RendimientoTrabajador[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [guardado, setGuardado] = useState(false)

  const [clima, setClima] = useState(climaInicial ?? "")
  const [observaciones, setObservaciones] = useState(observacionesInicial ?? "")

  const [workers, setWorkers] = useState<WorkerState[]>(
    trabajadores.map((t) => {
      const a = asistenciaInicial[t.id]
      return {
        id: t.id,
        nombre_completo: t.nombre_completo,
        rol_obra: t.rol_obra,
        asistencia: estadoInicial(a),
        horasRegulares: a?.horas_regulares ?? 0,
        horasExtra: a?.horas_extra ?? 0,
        // Un renglón guardado con 0 horas normalmente es porque nunca se
        // llenó a mano (se pagó todo a destajo por cantidad) -- se marca
        // como "auto" para que en vez de mostrar 0 se vea un reparto real
        // de las horas del día. Si ya tenía horas puestas, se respeta tal cual.
        splits: (splitsPorTrabajador[t.id] ?? []).map((s) => ({ actividadId: s.actividadId, rol: s.rol, horas: s.horas, avance: s.avance, horasAuto: s.horas === 0 })),
      }
    })
  )

  const [avanceRows, setAvanceRows] = useState<AvanceRow[]>(
    Object.entries(avanceInicial).map(([actividadId, v]) => ({
      actividadId,
      cantidadHoy: v.cantidad_ejecutada_dia,
      porcentajeTotal: v.porcentaje_avance_total,
      incidencias: v.incidencias,
      // Ya guardado previamente -- se trata como dato manual/definitivo,
      // no se sobreescribe solo porque coincida con un split.
      auto: false,
    }))
  )

  const actividadPorId = new Map(actividades.map((a) => [a.id, a]))
  const actividadesDisponiblesParaAvance = actividades.filter((a) => !avanceRows.some((r) => r.actividadId === a.id))

  const toggleAsistencia = (id: string, tipo: AsistenciaState) => {
    setWorkers((prev) => prev.map((w) => {
      if (w.id !== id) return w
      const horasRegulares = tipo === "ausente" ? 0 : tipo === "medio_dia" ? 4 : 8
      return { ...w, asistencia: tipo, horasRegulares }
    }))
  }

  const updateWorkerField = (id: string, field: "horasRegulares" | "horasExtra", value: number) => {
    setWorkers((prev) => prev.map((w) => (w.id === id ? { ...w, [field]: value } : w)))
  }

  const agregarSplit = (workerId: string) => {
    setWorkers((prev) => prev.map((w) => {
      if (w.id !== workerId) return w
      const primeraActividad = actividades[0]?.id ?? ""
      return { ...w, splits: [...w.splits, { actividadId: primeraActividad, rol: w.rol_obra ?? "", horas: 0, avance: 0, horasAuto: true }] }
    }))
  }

  const quitarSplit = (workerId: string, idx: number) => {
    setWorkers((prev) => prev.map((w) => (w.id !== workerId ? w : { ...w, splits: w.splits.filter((_, i) => i !== idx) })))
  }

  const updateSplit = (workerId: string, idx: number, field: "actividadId" | "rol" | "horas" | "avance", value: string | number) => {
    setWorkers((prev) => prev.map((w) => {
      if (w.id !== workerId) return w
      // Si edita "Horas" a mano, ese renglón deja de repartirse solo.
      const splits = w.splits.map((s, i) => (i === idx ? { ...s, [field]: value, horasAuto: field === "horas" ? false : s.horasAuto } : s))
      return { ...w, splits }
    }))
  }

  const agregarAvance = (actividadId: string) => {
    if (!actividadId) return
    setAvanceRows((prev) => [...prev, { actividadId, cantidadHoy: 0, porcentajeTotal: actividadPorId.get(actividadId)?.avance_porcentaje ?? 0, incidencias: "", auto: false }])
  }

  const quitarAvance = (actividadId: string) => {
    setAvanceRows((prev) => prev.filter((r) => r.actividadId !== actividadId))
  }

  const updateAvance = (actividadId: string, field: "cantidadHoy" | "porcentajeTotal" | "incidencias", value: string | number) => {
    setAvanceRows((prev) => prev.map((r) => {
      if (r.actividadId !== actividadId) return r
      // Edición manual -- deja de auto-sincronizarse con los splits de Asistencia.
      const dejaDeSerAuto = field === "cantidadHoy" || field === "porcentajeTotal"
      return { ...r, [field]: value, auto: dejaDeSerAuto ? false : r.auto }
    }))
  }

  // Mantiene "Avance por actividad" sincronizado en vivo con lo que se
  // asigna en los splits de Asistencia de cada trabajador: si una
  // actividad recibe cantidad ahí y todavía no tiene su tarjeta de
  // avance, se crea sola; si ya la tiene y sigue siendo "auto", se
  // actualiza. Las filas ya guardadas antes (o editadas a mano) no se
  // tocan -- solo las que el propio sistema generó automáticamente.
  useEffect(() => {
    const sumas: Record<string, number> = {}
    for (const w of workers) {
      if (w.asistencia === "ausente") continue
      for (const s of w.splits) {
        if (!s.actividadId || !s.avance || s.avance <= 0) continue
        sumas[s.actividadId] = (sumas[s.actividadId] ?? 0) + s.avance
      }
    }
    setAvanceRows((prev) => {
      let cambio = false
      const conservadas = prev.filter((r) => {
        if (!r.auto) return true
        const sigueVigente = sumas[r.actividadId] !== undefined
        if (!sigueVigente) cambio = true
        return sigueVigente
      })
      const next = conservadas.map((r) => {
        if (!r.auto) return r
        const suma = sumas[r.actividadId]
        if (suma === r.cantidadHoy) return r
        cambio = true
        const act = actividadPorId.get(r.actividadId)
        const objetivo = act?.cantidad_objetivo ?? 0
        const base = act?.cantidad_ejecutada ?? 0
        const pct = objetivo > 0 ? Math.round(((base + suma) / objetivo) * 100) : r.porcentajeTotal
        return { ...r, cantidadHoy: suma, porcentajeTotal: pct }
      })
      for (const [actividadId, suma] of Object.entries(sumas)) {
        if (next.some((r) => r.actividadId === actividadId)) continue
        cambio = true
        const act = actividadPorId.get(actividadId)
        const objetivo = act?.cantidad_objetivo ?? 0
        const base = act?.cantidad_ejecutada ?? 0
        const pct = objetivo > 0 ? Math.round(((base + suma) / objetivo) * 100) : (act?.avance_porcentaje ?? 0)
        next.push({ actividadId, cantidadHoy: suma, porcentajeTotal: pct, incidencias: "", auto: true })
      }
      return cambio ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers])

  // Reparte solas las horas regulares del trabajador entre los
  // renglones cuyo campo "Horas" nadie ha puesto a mano (horasAuto) --
  // en vez de mostrar 0 (que da a entender que no se trabajó nada en esa
  // tarea), se ve cuánto de la jornada le tocaría a cada actividad. Los
  // renglones que sí tienen una hora puesta a mano se respetan tal cual,
  // y lo que sobra de horasRegulares se reparte entre el resto.
  useEffect(() => {
    setWorkers((prev) => {
      let cambio = false
      const next = prev.map((w) => {
        const autoIdx = w.splits.reduce<number[]>((acc, s, i) => (s.horasAuto ? [...acc, i] : acc), [])
        if (autoIdx.length === 0) return w
        const manual = w.splits.filter((s) => !s.horasAuto).reduce((sum, s) => sum + (s.horas || 0), 0)
        const restante = Math.max(0, w.horasRegulares - manual)
        const cadaUna = Math.round((restante / autoIdx.length) * 100) / 100
        let huboCambio = false
        const splits = w.splits.map((s) => {
          if (!s.horasAuto) return s
          if (s.horas === cadaUna) return s
          huboCambio = true
          return { ...s, horas: cadaUna }
        })
        if (!huboCambio) return w
        cambio = true
        return { ...w, splits }
      })
      return cambio ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers])

  const handleGuardar = () => {
    setError("")
    setGuardado(false)

    const asistencia = workers.map((w) => ({
      trabajador_id: w.id,
      presente: w.asistencia !== "ausente",
      horas_regulares: w.horasRegulares,
      horas_extra: w.horasExtra,
    }))

    const avances = avanceRows.map((r) => ({
      actividad_id: r.actividadId,
      cantidad_ejecutada_dia: r.cantidadHoy,
      porcentaje_avance_total: r.porcentajeTotal ?? 0,
      incidencias: r.incidencias || undefined,
    }))

    const horasPorActividad = workers.flatMap((w) =>
      w.splits
        .filter((s) => s.actividadId && (s.horas > 0 || s.avance > 0))
        .map((s) => ({
          trabajador_id: w.id,
          actividad_id: s.actividadId,
          rol_aplicado: s.rol || null,
          horas: s.horas,
          avance_cantidad: s.avance || undefined,
        }))
    )

    startTransition(async () => {
      const res = await actualizarReporteDiario({
        reporte_id: reporteId,
        proyecto_id: proyectoId,
        fecha,
        clima: clima || undefined,
        observaciones: observaciones || undefined,
        avances,
        asistencia,
        horasPorActividad,
      })
      if (res.error) setError(res.error)
      else {
        setGuardado(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <button
        onClick={() => router.push("/reporte-diario/historial")}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al historial
      </button>

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
          <CardDescription>Fecha: {fecha}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Input label="Clima" value={clima} onChange={(e) => setClima(e.target.value)} placeholder="Ej. Soleado" />
          <div className="col-span-2">
            <Textarea label="Observaciones generales" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-slate-400" /> Rendimiento real vs. plan
          </CardTitle>
          <CardDescription>
            Compara cuánto se produjo realmente contra lo que el plan de cada actividad asumía para esas horas
            (no es solo el reflejo de las horas trabajadas).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-2xl font-bold", colorRendimiento(rendimientoDia.pct))}>
                {formatoPct(rendimientoDia.pct)}
              </span>
              <span className="text-xs text-slate-400">rendimiento del día completo</span>
            </div>
            {avisoRendimiento(rendimientoDia.pct) && (
              <p className="text-xs text-amber-600 mt-0.5">⚠ {avisoRendimiento(rendimientoDia.pct)}</p>
            )}
          </div>
          {rendimientoPorTrabajador.length === 0 ? (
            <p className="text-sm text-slate-400">Sin avance por actividad registrado este día.</p>
          ) : (
            <div className="space-y-1.5">
              {rendimientoPorTrabajador.map((r) => (
                <div key={r.trabajadorId} className="border-b border-slate-50 pb-1.5 last:border-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">{r.nombre}</span>
                    <span className={cn("font-semibold", colorRendimiento(r.pct))}>{formatoPct(r.pct)}</span>
                  </div>
                  {avisoRendimiento(r.pct) && (
                    <p className="text-[11px] text-amber-600">⚠ {avisoRendimiento(r.pct)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asistencia y actividades por trabajador</CardTitle>
          <CardDescription>Corrige horas, asistencia y a qué actividad(es) se dedicó cada quien.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workers.length === 0 && <p className="text-sm text-slate-400">Sin trabajadores en este reporte.</p>}
          {workers.map((w) => (
            <div key={w.id} className="border border-slate-100 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-medium text-sm text-slate-800">{w.nombre_completo}</p>
                  {w.rol_obra && <p className="text-xs text-slate-400 capitalize">{w.rol_obra}</p>}
                </div>
                <div className="flex gap-1.5">
                  {(["presente", "medio_dia", "ausente"] as const).map((tipo) => (
                    <button
                      key={tipo}
                      onClick={() => toggleAsistencia(w.id, tipo)}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-lg border font-medium",
                        w.asistencia === tipo
                          ? tipo === "ausente" ? "bg-red-600 text-white border-red-600" : "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {tipo === "presente" ? "Presente" : tipo === "medio_dia" ? "Medio día" : "Ausente"}
                    </button>
                  ))}
                </div>
              </div>

              {w.asistencia !== "ausente" && (
                <>
                  <div className="flex gap-3">
                    <Input
                      label="Horas regulares" type="number" className="w-32 text-sm"
                      value={w.horasRegulares}
                      onChange={(e) => updateWorkerField(w.id, "horasRegulares", Number(e.target.value))}
                    />
                    <Input
                      label="Horas extra" type="number" className="w-32 text-sm"
                      value={w.horasExtra}
                      onChange={(e) => updateWorkerField(w.id, "horasExtra", Number(e.target.value))}
                    />
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Actividad(es) de ese día</p>
                    {w.splits.map((s, idx) => {
                      const actSel = actividadPorId.get(s.actividadId)
                      return (
                      <div key={idx} className="bg-slate-50 rounded-lg p-2 space-y-1.5">
                        <div className="flex items-end gap-2 flex-wrap">
                          <CampoEtiquetado label="Actividad" className="flex-1 min-w-40">
                            <select
                              value={s.actividadId}
                              onChange={(e) => updateSplit(w.id, idx, "actividadId", e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                            >
                              {actividades.map((a) => (
                                <option key={a.id} value={a.id}>{labelActividad(a)}</option>
                              ))}
                            </select>
                          </CampoEtiquetado>
                          <CampoEtiquetado label="Rol aplicado">
                            <input
                              value={s.rol}
                              onChange={(e) => updateSplit(w.id, idx, "rol", e.target.value)}
                              placeholder="Ej. Carpintero"
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                            />
                          </CampoEtiquetado>
                          <CampoEtiquetado label={s.horasAuto ? "Horas (auto)" : "Horas"}>
                            <input
                              type="number" value={s.horas}
                              onChange={(e) => updateSplit(w.id, idx, "horas", Number(e.target.value))}
                              title={s.horasAuto ? "Repartido solo entre las horas regulares del día -- edítalo para fijarlo a mano" : undefined}
                              className={cn(
                                "w-20 border rounded-lg px-2 py-1.5 text-xs",
                                s.horasAuto ? "border-dashed border-slate-300 text-slate-500 bg-white" : "border-slate-200"
                              )}
                            />
                          </CampoEtiquetado>
                          <CampoEtiquetado label={`Avance (${actSel?.unidad ?? "und"})`}>
                            <input
                              type="number" value={s.avance}
                              onChange={(e) => updateSplit(w.id, idx, "avance", Number(e.target.value))}
                              placeholder="0"
                              className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                            />
                          </CampoEtiquetado>
                          <button onClick={() => quitarSplit(w.id, idx)} className="text-slate-300 hover:text-red-500 mb-1.5">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {actSel && (() => {
                          const seSobregira = (actSel.cantidad_objetivo ?? 0) > 0 && (actSel.cantidad_ejecutada ?? 0) > (actSel.cantidad_objetivo as number)
                          return (
                            <p className="text-[11px] text-slate-400 pl-1">
                              Propuesto: {actSel.cantidad_objetivo ?? "—"} {actSel.unidad ?? ""} · Ejecutado a la fecha:{" "}
                              <span className={cn(seSobregira ? "text-red-600 font-semibold" : undefined)}>
                                {actSel.cantidad_ejecutada ?? 0} {actSel.unidad ?? ""}
                              </span>
                              {" "}· <span className={cn(seSobregira ? "text-red-600 font-semibold" : undefined)}>{actSel.avance_porcentaje ?? 0}%</span> avance
                            </p>
                          )
                        })()}
                      </div>
                      )
                    })}
                    <button
                      onClick={() => agregarSplit(w.id)}
                      className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar actividad
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avance por actividad</CardTitle>
          <CardDescription>Cantidad y % acumulado registrados ese día.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {avanceRows.map((r) => {
            const act = actividadPorId.get(r.actividadId)
            const excedePresupuesto = !!act && (act.cantidad_objetivo ?? 0) > 0 && (act.cantidad_ejecutada ?? 0) > (act.cantidad_objetivo as number)
            return (
              <div key={r.actividadId} className="border border-slate-100 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{act?.codigo} — {act?.nombre ?? "—"}</p>
                    {act && (
                      <p className="text-[11px] text-slate-400">
                        Propuesto: {act.cantidad_objetivo ?? "—"} {act.unidad ?? ""} · Ejecutado a la fecha:{" "}
                        <span className={cn(excedePresupuesto ? "text-red-600 font-semibold" : undefined)}>
                          {act.cantidad_ejecutada ?? 0} {act.unidad ?? ""}
                        </span>
                        {" "}· <span className={cn(excedePresupuesto ? "text-red-600 font-semibold" : undefined)}>{act.avance_porcentaje ?? 0}%</span> avance
                      </p>
                    )}
                    {excedePresupuesto && (
                      <p className="flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1 mt-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Lo ejecutado ya supera la cantidad presupuestada. Revisa si la cantidad reportada es correcta.
                      </p>
                    )}
                  </div>
                  <button onClick={() => quitarAvance(r.actividadId)} className="text-slate-300 hover:text-red-500 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Input
                    label={`Cantidad hoy (${act?.unidad ?? "und"})`} type="number" className="w-36 text-sm"
                    value={r.cantidadHoy}
                    onChange={(e) => updateAvance(r.actividadId, "cantidadHoy", Number(e.target.value))}
                  />
                  <Input
                    label="% acumulado" type="number" className="w-32 text-sm"
                    value={r.porcentajeTotal ?? 0}
                    onChange={(e) => updateAvance(r.actividadId, "porcentajeTotal", Number(e.target.value))}
                  />
                </div>
                <Input
                  label="Incidencias" value={r.incidencias}
                  onChange={(e) => updateAvance(r.actividadId, "incidencias", e.target.value)}
                  placeholder="Incidencias o bloqueos..."
                />
              </div>
            )
          })}

          {actividadesDisponiblesParaAvance.length > 0 && (
            <select
              value=""
              onChange={(e) => agregarAvance(e.target.value)}
              className="w-full border border-dashed border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 bg-white"
            >
              <option value="">+ Agregar avance de otra actividad...</option>
              {actividadesDisponiblesParaAvance.map((a) => (
                <option key={a.id} value={a.id}>{labelActividad(a)}</option>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
      )}
      {guardado && !error && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          Cambios guardados. Costos, avances y alertas se recalcularon.
        </div>
      )}

      <div className="flex justify-end pb-8">
        <Button onClick={handleGuardar} isLoading={isPending} size="lg">
          <Save className="h-4 w-4" /> Guardar cambios
        </Button>
      </div>
    </div>
  )
}
