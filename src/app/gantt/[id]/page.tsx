import { Fragment } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { BotonImprimir } from "./boton-imprimir"

type Actividad = {
  id: string
  codigo: string
  nombre: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  es_critica: boolean
  activa: boolean | null
}

type Proceso = {
  id: string
  codigo: string
  nombre: string
  orden: number
  actividades: Actividad[]
}

// ── Utilidades de fecha (todo en horario local, sin componentes de hora) ──

function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00")
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const DIA_SEMANA = ["D", "L", "M", "M", "J", "V", "S"]

export default async function GanttPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: proyecto, error } = await supabase
    .from("proyectos")
    .select(`
      id, codigo, nombre, fecha_inicio_plan, fecha_fin_plan,
      procesos (
        id, codigo, nombre, orden,
        actividades (
          id, codigo, nombre, fecha_inicio_plan, fecha_fin_plan, es_critica, activa
        )
      )
    `)
    .eq("id", id)
    .single()

  if (error || !proyecto) notFound()

  const procesos: Proceso[] = ((proyecto.procesos ?? []) as unknown as Proceso[])
    .map((p) => ({
      ...p,
      actividades: (p.actividades ?? [])
        .filter((a) => a.activa !== false && a.fecha_inicio_plan && a.fecha_fin_plan)
        .sort((a, b) => (a.fecha_inicio_plan! < b.fecha_inicio_plan! ? -1 : a.fecha_inicio_plan! > b.fecha_inicio_plan! ? 1 : a.codigo.localeCompare(b.codigo))),
    }))
    .sort((a, b) => a.orden - b.orden)
    .filter((p) => p.actividades.length > 0)

  const todasFechas: string[] = procesos.flatMap((p) => p.actividades.flatMap((a) => [a.fecha_inicio_plan!, a.fecha_fin_plan!]))

  if (todasFechas.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center text-slate-500">
        Este proyecto todavía no tiene actividades con fechas cargadas — no se puede generar el diagrama de Gantt.
      </div>
    )
  }

  const rangeStart = parseISO(todasFechas.reduce((min, f) => (f < min ? f : min)))
  const rangeEnd = parseISO(todasFechas.reduce((max, f) => (f > max ? f : max)))

  // ── Partimos el rango completo en tramos mensuales — una hoja impresa por mes ──
  type Tramo = { inicio: Date; fin: Date }
  const tramos: Tramo[] = []
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
  while (cursor <= rangeEnd) {
    const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    tramos.push({
      inicio: cursor < rangeStart ? rangeStart : cursor,
      fin: finMes > rangeEnd ? rangeEnd : finMes,
    })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900">
      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          .pagina-gantt { page-break-after: always; }
          .pagina-gantt:last-child { page-break-after: auto; }
        }
        table.gantt { table-layout: fixed; width: 100%; border-collapse: collapse; }
        table.gantt th, table.gantt td { border: 1px solid #e2e8f0; }
      `}</style>

      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <p className="text-xs text-slate-400 font-mono">{proyecto.codigo}</p>
          <h1 className="text-lg font-bold text-slate-900">{proyecto.nombre} — Diagrama de Gantt</h1>
        </div>
        <BotonImprimir />
      </div>

      {tramos.map((tramo, tramoIdx) => {
        const dias: Date[] = []
        for (let d = new Date(tramo.inicio); d <= tramo.fin; d.setDate(d.getDate() + 1)) {
          dias.push(new Date(d))
        }
        const nDias = dias.length
        const pctFijo = 30 // % del ancho para código + nombre
        const pctDia = (100 - pctFijo) / nDias

        return (
          <div key={tramoIdx} className="pagina-gantt mb-8">
            <div className="mb-2">
              <p className="text-xs text-slate-400 font-mono">{proyecto.codigo} — {proyecto.nombre}</p>
              <h2 className="text-base font-bold text-slate-900">
                {NOMBRES_MES[tramo.inicio.getMonth()]} {tramo.inicio.getFullYear()}
                {tramo.inicio.getMonth() !== tramo.fin.getMonth() && ` – ${NOMBRES_MES[tramo.fin.getMonth()]} ${tramo.fin.getFullYear()}`}
              </h2>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-1">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-[#3B72D8] rounded-sm" /> Actividad normal</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-red-500 rounded-sm" /> Ruta crítica</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-slate-200 rounded-sm" /> Fin de semana</span>
                <span>◀ = continúa de la hoja anterior · ▶ = continúa en la siguiente</span>
              </div>
            </div>

            <table className="gantt text-[8px]">
              <colgroup>
                <col style={{ width: "5%" }} />
                <col style={{ width: `${pctFijo - 5}%` }} />
                {dias.map((_, i) => <col key={i} style={{ width: `${pctDia}%` }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="bg-slate-100 px-1 py-1 text-left">Cód.</th>
                  <th className="bg-slate-100 px-1 py-1 text-left">Actividad</th>
                  {dias.map((d, i) => {
                    const esFinde = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <th key={i} className={`px-0 py-1 text-center font-normal ${esFinde ? "bg-slate-200" : "bg-slate-100"}`}>
                        <div>{d.getDate()}</div>
                        <div className="text-slate-400">{DIA_SEMANA[d.getDay()]}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {procesos.map((proc) => (
                  <Fragment key={proc.id}>
                    <tr>
                      <td colSpan={2 + nDias} className="bg-slate-50 px-1 py-1 font-semibold text-slate-700">
                        {proc.codigo} — {proc.nombre}
                      </td>
                    </tr>
                    {proc.actividades.map((act) => {
                      const actInicio = parseISO(act.fecha_inicio_plan!)
                      const actFin = parseISO(act.fecha_fin_plan!)
                      const solapa = actFin >= tramo.inicio && actInicio <= tramo.fin
                      if (!solapa) {
                        return (
                          <tr key={act.id}>
                            <td className="px-1 py-0.5 font-mono text-slate-400">{act.codigo}</td>
                            <td className="px-1 py-0.5 text-slate-600 truncate">{act.nombre}</td>
                            {dias.map((_, i) => <td key={i} />)}
                          </tr>
                        )
                      }
                      const startIdx = Math.max(0, diasEntre(tramo.inicio, actInicio))
                      const endIdx = Math.min(nDias - 1, diasEntre(tramo.inicio, actFin))
                      const antes = actInicio < tramo.inicio
                      const despues = actFin > tramo.fin
                      const colSpanBar = endIdx - startIdx + 1
                      return (
                        <tr key={act.id}>
                          <td className="px-1 py-0.5 font-mono text-slate-400">{act.codigo}</td>
                          <td className="px-1 py-0.5 text-slate-600 truncate">{act.nombre}</td>
                          {startIdx > 0 && <td colSpan={startIdx} />}
                          <td colSpan={colSpanBar} className="p-0">
                            <div
                              className={`h-3 mx-px flex items-center justify-center text-white text-[7px] ${act.es_critica ? "bg-red-500" : "bg-[#3B72D8]"}`}
                              style={{
                                borderTopLeftRadius: antes ? 0 : 4,
                                borderBottomLeftRadius: antes ? 0 : 4,
                                borderTopRightRadius: despues ? 0 : 4,
                                borderBottomRightRadius: despues ? 0 : 4,
                              }}
                            >
                              {antes ? "◀" : ""}{despues ? "▶" : ""}
                            </div>
                          </td>
                          {endIdx < nDias - 1 && <td colSpan={nDias - 1 - endIdx} />}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
