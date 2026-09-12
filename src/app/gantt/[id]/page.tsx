import { Fragment } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Move } from "lucide-react"
import { BotonImprimir } from "./boton-imprimir"
import { BotonRecalcular } from "./boton-recalcular"
import { parseISO, diasEntre, colorBarra, hoyMexico, NOMBRES_MES, DIA_SEMANA } from "@/lib/gantt-utils"

type Actividad = {
  id: string
  codigo: string
  nombre: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  es_critica: boolean
  activa: boolean | null
  estado: string | null
}

type Proceso = {
  id: string
  codigo: string
  nombre: string
  orden: number
  actividades: Actividad[]
}

export default async function GanttPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: proyecto, error } = await supabase
    .from("proyectos")
    .select(`
      id, codigo, nombre, fecha_inicio_plan, fecha_fin_plan, zona_horaria,
      procesos (
        id, codigo, nombre, orden,
        actividades (
          id, codigo, nombre, fecha_inicio_plan, fecha_fin_plan, es_critica, activa, estado
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

  // "Hoy" en la zona horaria del proyecto (no siempre México) -- así la
  // línea de hoy cae en el día correcto sin importar dónde esté la obra.
  const hoy = hoyMexico(proyecto.zona_horaria)

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
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
      `}</style>

      <div className="flex items-center justify-between mb-4 print:hidden">
        <div>
          <p className="text-xs text-slate-400 font-mono">{proyecto.codigo}</p>
          <h1 className="text-lg font-bold text-slate-900">{proyecto.nombre} — Diagrama de Gantt</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/gantt/${proyecto.id}/editar`}
            title="Arrastra y estira las barras para mover fechas -- los cambios se guardan solos y recalculan la ruta crítica"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors shrink-0"
          >
            <Move className="h-4 w-4" />
            Editar cronograma
          </Link>
          <BotonRecalcular proyectoId={proyecto.id} />
          <BotonImprimir />
        </div>
      </div>

      {tramos.map((tramo, tramoIdx) => {
        const dias: Date[] = []
        for (let d = new Date(tramo.inicio); d <= tramo.fin; d.setDate(d.getDate() + 1)) {
          dias.push(new Date(d))
        }
        const nDias = dias.length
        const pctFijo = 30 // % del ancho para código + nombre
        const pctDia = (100 - pctFijo) / nDias

        // Línea vertical de "hoy" -- solo se dibuja si la fecha actual cae
        // dentro de este tramo/mes. Se posiciona con un div absoluto sobre
        // la tabla en vez de partir columnas, porque las barras usan
        // colSpan y eso complicaría dibujar una línea continua.
        const hoyEnTramo = hoy >= tramo.inicio && hoy <= tramo.fin
        const hoyIdx = hoyEnTramo ? diasEntre(tramo.inicio, hoy) : -1
        const hoyOffsetPct = pctFijo + (hoyIdx + 0.5) * pctDia

        return (
          <div key={tramoIdx} className="pagina-gantt mb-8">
            <div className="mb-2">
              <p className="text-xs text-slate-400 font-mono">{proyecto.codigo} — {proyecto.nombre}</p>
              <h2 className="text-base font-bold text-slate-900">
                {NOMBRES_MES[tramo.inicio.getMonth()]} {tramo.inicio.getFullYear()}
                {tramo.inicio.getMonth() !== tramo.fin.getMonth() && ` – ${NOMBRES_MES[tramo.fin.getMonth()]} ${tramo.fin.getFullYear()}`}
              </h2>
              <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-1 flex-wrap">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-[#3B72D8] rounded-sm" /> Programada</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-amber-500 rounded-sm" /> En progreso</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-emerald-500 rounded-sm" /> Completada</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-red-500 rounded-sm" /> Atrasada (no arrancó o no terminó a tiempo)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-[#3B72D8] rounded-sm border-2 border-slate-900" /> Ruta crítica</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 bg-slate-200 rounded-sm" /> Fin de semana</span>
                <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-2.5 bg-violet-600" /> Hoy</span>
                <span>◀ = continúa de la hoja anterior · ▶ = continúa en la siguiente</span>
              </div>
            </div>

            <div className="relative">
              {hoyEnTramo && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-violet-600 z-10 pointer-events-none print:block"
                  style={{ left: `${hoyOffsetPct}%` }}
                />
              )}
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
                              className={`h-3 mx-px flex items-center justify-center text-white text-[7px] ${colorBarra(act, hoy)} ${act.es_critica ? "border-2 border-slate-900" : ""}`}
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
          </div>
        )
      })}
    </div>
  )
}
