"use client"

import { useMemo, useRef, useState, useTransition, useEffect, type PointerEvent as ReactPointerEvent } from "react"
import { useRouter } from "next/navigation"
import { Link2 } from "lucide-react"
import { parseISO, diasEntre, formatISO, colorBarra, NOMBRES_MES, DIA_SEMANA } from "@/lib/gantt-utils"
import { actualizarFechasActividad } from "../actions"
import type { ActividadEditable, ProcesoEditable, DependenciaEditable } from "./types"
import { DependenciasModal } from "./dependencias-modal"

const DAY_WIDTH = 26
const ROW_HEIGHT = 28
const LABEL_WIDTH = 260
const HEADER_HEIGHT = 34

type RenderRow =
  | { tipo: "proceso"; key: string; codigo: string; nombre: string }
  | { tipo: "actividad"; key: string; act: ActividadEditable }

type DragState = {
  actId: string
  modo: "move" | "resize-l" | "resize-r"
  startClientX: number
  startInicioIdx: number
  startFinIdx: number
  previewInicioIdx: number
  previewFinIdx: number
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function GanttEditableClient({
  procesos,
  dependencias,
  rangeStartISO,
  rangeEndISO,
  hoyISO,
  soloLectura,
}: {
  procesos: ProcesoEditable[]
  dependencias: DependenciaEditable[]
  rangeStartISO: string
  rangeEndISO: string
  hoyISO: string
  soloLectura: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [drag, setDrag] = useState<DragState | null>(null)
  const [guardandoId, setGuardandoId] = useState<string | null>(null)
  const [errorInfo, setErrorInfo] = useState<{ id: string; msg: string } | null>(null)
  const [modalActId, setModalActId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const yaHizoScrollInicial = useRef(false)

  const todasActividades = useMemo(() => procesos.flatMap((p) => p.actividades), [procesos])

  const rangeStart = useMemo(() => parseISO(rangeStartISO), [rangeStartISO])
  const rangeEnd = useMemo(() => parseISO(rangeEndISO), [rangeEndISO])
  const hoy = useMemo(() => parseISO(hoyISO), [hoyISO])

  const dias = useMemo(() => {
    const out: Date[] = []
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) out.push(new Date(d))
    return out
  }, [rangeStart, rangeEnd])
  const totalDias = dias.length
  const todayIdx = diasEntre(rangeStart, hoy)

  const renderRows: RenderRow[] = useMemo(() => {
    const rows: RenderRow[] = []
    for (const p of procesos) {
      rows.push({ tipo: "proceso", key: `p-${p.id}`, codigo: p.codigo, nombre: p.nombre })
      for (const a of p.actividades) rows.push({ tipo: "actividad", key: `a-${a.id}`, act: a })
    }
    return rows
  }, [procesos])

  // Posición (en índice de día + fila) de cada actividad -- incorpora la
  // vista previa de arrastre si esa actividad se está moviendo/
  // estirando en este momento. Tanto las barras como las flechas de
  // dependencia leen de aquí, así que las flechas siguen a la barra en
  // vivo mientras se arrastra.
  const posPorActividad = useMemo(() => {
    const map = new Map<string, { inicioIdx: number; finIdx: number; rowIdx: number }>()
    renderRows.forEach((row, rowIdx) => {
      if (row.tipo !== "actividad") return
      const act = row.act
      const baseInicioIdx = diasEntre(rangeStart, parseISO(act.fecha_inicio_plan!))
      const baseFinIdx = diasEntre(rangeStart, parseISO(act.fecha_fin_plan!))
      const enArrastre = drag?.actId === act.id
      const inicioIdx = enArrastre ? drag!.previewInicioIdx : baseInicioIdx
      const finIdx = enArrastre ? drag!.previewFinIdx : baseFinIdx
      map.set(act.id, { inicioIdx, finIdx, rowIdx })
    })
    return map
  }, [renderRows, rangeStart, drag])

  // Al abrir la vista, centra el scroll horizontal cerca de "hoy" en vez
  // de dejar al usuario viendo el colchón de días vacíos del inicio.
  useEffect(() => {
    if (yaHizoScrollInicial.current || !scrollRef.current) return
    yaHizoScrollInicial.current = true
    const destino = Math.max(0, (todayIdx - 5) * DAY_WIDTH)
    scrollRef.current.scrollLeft = destino
  }, [todayIdx])

  function guardar(actId: string, fecha_inicio_plan: string, fecha_fin_plan: string) {
    setGuardandoId(actId)
    setErrorInfo(null)
    startTransition(async () => {
      const res = await actualizarFechasActividad(actId, { fecha_inicio_plan, fecha_fin_plan })
      setGuardandoId(null)
      if (res.error) {
        setErrorInfo({ id: actId, msg: res.error })
        setTimeout(() => setErrorInfo((prev) => (prev?.id === actId ? null : prev)), 5000)
      } else {
        router.refresh()
      }
    })
  }

  function handlersPara(act: ActividadEditable, modo: DragState["modo"]) {
    if (soloLectura) return {}
    return {
      onPointerDown: (e: ReactPointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const inicioIdx0 = diasEntre(rangeStart, parseISO(act.fecha_inicio_plan!))
        const finIdx0 = diasEntre(rangeStart, parseISO(act.fecha_fin_plan!))
        setDrag({
          actId: act.id,
          modo,
          startClientX: e.clientX,
          startInicioIdx: inicioIdx0,
          startFinIdx: finIdx0,
          previewInicioIdx: inicioIdx0,
          previewFinIdx: finIdx0,
        })
      },
      onPointerMove: (e: ReactPointerEvent) => {
        setDrag((prev) => {
          if (!prev || prev.actId !== act.id) return prev
          const deltaDias = Math.round((e.clientX - prev.startClientX) / DAY_WIDTH)
          let nuevoInicio = prev.startInicioIdx
          let nuevoFin = prev.startFinIdx
          if (prev.modo === "move") {
            nuevoInicio = prev.startInicioIdx + deltaDias
            nuevoFin = prev.startFinIdx + deltaDias
            if (nuevoInicio < 0) {
              nuevoFin -= nuevoInicio
              nuevoInicio = 0
            }
            if (nuevoFin > totalDias - 1) {
              nuevoInicio -= nuevoFin - (totalDias - 1)
              nuevoFin = totalDias - 1
            }
          } else if (prev.modo === "resize-l") {
            nuevoInicio = Math.min(Math.max(0, prev.startInicioIdx + deltaDias), prev.startFinIdx)
          } else {
            nuevoFin = Math.max(Math.min(totalDias - 1, prev.startFinIdx + deltaDias), prev.startInicioIdx)
          }
          if (nuevoInicio === prev.previewInicioIdx && nuevoFin === prev.previewFinIdx) return prev
          return { ...prev, previewInicioIdx: nuevoInicio, previewFinIdx: nuevoFin }
        })
      },
      onPointerUp: () => {
        setDrag((prev) => {
          if (!prev || prev.actId !== act.id) return null
          const cambio = prev.previewInicioIdx !== prev.startInicioIdx || prev.previewFinIdx !== prev.startFinIdx
          if (cambio) {
            const nuevaInicio = addDays(rangeStart, prev.previewInicioIdx)
            const nuevaFin = addDays(rangeStart, prev.previewFinIdx)
            guardar(act.id, formatISO(nuevaInicio), formatISO(nuevaFin))
          }
          return null
        })
      },
    }
  }

  // Agrupa los días en tramos por mes para el rótulo superior del encabezado.
  const gruposMes = useMemo(() => {
    const grupos: { mes: number; anio: number; startIdx: number; count: number }[] = []
    dias.forEach((d, i) => {
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.mes === d.getMonth() && ultimo.anio === d.getFullYear()) {
        ultimo.count++
      } else {
        grupos.push({ mes: d.getMonth(), anio: d.getFullYear(), startIdx: i, count: 1 })
      }
    })
    return grupos
  }, [dias])

  return (
    <div>
      <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-2 flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-[#3B72D8] rounded-sm" /> Programada</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-amber-500 rounded-sm" /> En progreso</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-emerald-500 rounded-sm" /> Completada</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-red-500 rounded-sm" /> Atrasada</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-[#3B72D8] rounded-sm ring-2 ring-slate-900" /> Ruta crítica</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-slate-100 rounded-sm" /> Fin de semana</span>
        <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-2.5 bg-violet-600" /> Hoy</span>
        {!soloLectura && (
          <span>
            Arrastra el centro de una barra para moverla, o sus bordes para estirarla/encogerla — se guarda solo y recalcula la ruta crítica.
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="border border-slate-200 rounded-lg overflow-auto"
        style={{ maxHeight: "75vh" }}
      >
        <div className="flex" style={{ width: LABEL_WIDTH + totalDias * DAY_WIDTH }}>
          {/* Columna de etiquetas -- sticky a la izquierda: siempre visible aunque
              se desplace horizontalmente. */}
          <div
            className="sticky left-0 shrink-0 border-r border-slate-200 bg-white"
            style={{ width: LABEL_WIDTH, zIndex: 30 }}
          >
            <div style={{ height: HEADER_HEIGHT }} className="sticky top-0 border-b border-slate-200 bg-slate-100" />
            {renderRows.map((row) =>
              row.tipo === "proceso" ? (
                <div
                  key={row.key}
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center px-2 text-[11px] font-semibold text-slate-700 bg-slate-50 border-b border-slate-200 truncate"
                >
                  {row.codigo} — {row.nombre}
                </div>
              ) : (
                <div
                  key={row.key}
                  style={{ height: ROW_HEIGHT }}
                  className="flex items-center gap-1 px-2 text-[10px] border-b border-slate-100 bg-white"
                >
                  <span className="font-mono text-slate-400 shrink-0">{row.act.codigo}</span>
                  <span className="text-slate-600 truncate flex-1">{row.act.nombre}</span>
                  <button
                    onClick={() => setModalActId(row.act.id)}
                    title="Ver/editar dependencias de esta actividad"
                    className="text-slate-500 hover:text-slate-900 shrink-0"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            )}
          </div>

          {/* Línea de tiempo */}
          <div style={{ width: totalDias * DAY_WIDTH }}>
            {/* Encabezado: mes arriba, día/semana abajo -- sticky arriba: siempre
                visible aunque se desplace verticalmente. */}
            <div
              className="sticky top-0 border-b border-slate-200 bg-slate-100"
              style={{ height: HEADER_HEIGHT, zIndex: 20 }}
            >
              {gruposMes.map((g) => (
                <div
                  key={`${g.anio}-${g.mes}`}
                  className="absolute top-0 h-4 text-[9px] text-slate-500 px-1 truncate border-l border-slate-200"
                  style={{ left: g.startIdx * DAY_WIDTH, width: g.count * DAY_WIDTH }}
                >
                  {NOMBRES_MES[g.mes]} {g.anio}
                </div>
              ))}
              {dias.map((d, i) => {
                const esFinde = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div
                    key={i}
                    className={`absolute bottom-0 h-[18px] text-center text-[8px] border-l border-slate-200 ${esFinde ? "bg-slate-200" : ""}`}
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                  >
                    <div>{d.getDate()}</div>
                    <div className="text-slate-400 leading-none">{DIA_SEMANA[d.getDay()]}</div>
                  </div>
                )
              })}
            </div>

            {/* Cuerpo: franjas de fin de semana + línea de hoy + barras */}
            <div
              className="relative"
              style={{
                height: renderRows.length * ROW_HEIGHT,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_HEIGHT - 1}px, #f1f5f9 ${ROW_HEIGHT - 1}px, #f1f5f9 ${ROW_HEIGHT}px)`,
              }}
            >
              {dias.map((d, i) => {
                const esFinde = d.getDay() === 0 || d.getDay() === 6
                if (!esFinde) return null
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 bg-slate-100"
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH, zIndex: 0 }}
                  />
                )
              })}

              {todayIdx >= 0 && todayIdx < totalDias && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-violet-600"
                  style={{ left: (todayIdx + 0.5) * DAY_WIDTH, zIndex: 20 }}
                />
              )}

              {/* Flechas finas de dependencia -- de la predecesora a la sucesora */}
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                width={totalDias * DAY_WIDTH}
                height={renderRows.length * ROW_HEIGHT}
                style={{ zIndex: 8 }}
              >
                <defs>
                  <marker id="flecha-dependencia" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8" />
                  </marker>
                </defs>
                {dependencias.map((dep) => {
                  const origen = posPorActividad.get(dep.predecesora_id)
                  const destino = posPorActividad.get(dep.actividad_id)
                  if (!origen || !destino) return null
                  const ladoOrigen = dep.tipo === "inicio_a_inicio" || dep.tipo === "inicio_a_fin" ? "inicio" : "fin"
                  const ladoDestino = dep.tipo === "fin_a_fin" || dep.tipo === "inicio_a_fin" ? "fin" : "inicio"
                  const x1 = (ladoOrigen === "inicio" ? origen.inicioIdx : origen.finIdx + 1) * DAY_WIDTH
                  const y1 = origen.rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2
                  const x2 = (ladoDestino === "inicio" ? destino.inicioIdx : destino.finIdx + 1) * DAY_WIDTH
                  const y2 = destino.rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2
                  const offset = Math.min(40, Math.max(16, Math.abs(x2 - x1) / 3))
                  const c1x = ladoOrigen === "fin" ? x1 + offset : x1 - offset
                  const c2x = ladoDestino === "fin" ? x2 + offset : x2 - offset
                  return (
                    <path
                      key={dep.id}
                      d={`M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth={1.25}
                      markerEnd="url(#flecha-dependencia)"
                    />
                  )
                })}
              </svg>

              {renderRows.map((row, rowIdx) => {
                if (row.tipo !== "actividad") return null
                const act = row.act
                const pos = posPorActividad.get(act.id)!
                const inicioIdx = pos.inicioIdx
                const finIdx = pos.finIdx
                const left = inicioIdx * DAY_WIDTH
                const width = (finIdx - inicioIdx + 1) * DAY_WIDTH
                const top = rowIdx * ROW_HEIGHT
                const guardando = guardandoId === act.id
                const error = errorInfo?.id === act.id ? errorInfo.msg : null

                return (
                  <div
                    key={row.key}
                    className="absolute"
                    style={{ left, width, top: top + 3, height: ROW_HEIGHT - 6, zIndex: 10 }}
                  >
                    <div
                      className={`absolute inset-0 rounded flex items-center justify-center text-white text-[8px] ${colorBarra(act, hoy)} ${act.es_critica ? "ring-2 ring-slate-900" : ""} ${soloLectura ? "" : "cursor-grab active:cursor-grabbing"}`}
                      title={`${act.codigo} — ${act.nombre}\n${formatISO(addDays(rangeStart, inicioIdx))} a ${formatISO(addDays(rangeStart, finIdx))}`}
                      {...handlersPara(act, "move")}
                    />
                    {!soloLectura && (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" {...handlersPara(act, "resize-l")} />
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" {...handlersPara(act, "resize-r")} />
                      </>
                    )}
                    {guardando && (
                      <span className="absolute -top-3 left-0 text-[8px] text-slate-500 whitespace-nowrap">guardando…</span>
                    )}
                    {error && (
                      <span className="absolute -top-3 left-0 text-[8px] text-red-600 whitespace-nowrap bg-white px-0.5 rounded">{error}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {modalActId && (() => {
        const act = todasActividades.find((a) => a.id === modalActId)
        if (!act) return null
        return (
          <DependenciasModal
            act={act}
            todasActividades={todasActividades}
            dependencias={dependencias}
            soloLectura={soloLectura}
            onClose={() => setModalActId(null)}
          />
        )
      })()}
    </div>
  )
}
