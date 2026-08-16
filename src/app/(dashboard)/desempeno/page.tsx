import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react"
import { CircularProgress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type IIDPSnapshot = {
  id: string
  fecha: string
  score_total: number
  score_cronograma: number
  score_finanzas: number
  score_productividad: number
  score_calidad: number
  score_logistica: number
  score_gestion: number
  tendencia: string | null
  proyectos: { nombre: string; codigo: string } | null
}

async function getData(): Promise<IIDPSnapshot[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("iidp_snapshots")
    .select(`
      id, fecha,
      score_total, score_cronograma, score_finanzas,
      score_productividad, score_calidad, score_logistica, score_gestion,
      tendencia,
      proyectos ( nombre, codigo )
    `)
    .order("fecha", { ascending: false })

  if (error) {
    console.error("Error cargando IIDP:", error.message)
    return []
  }
  return (data ?? []) as unknown as IIDPSnapshot[]
}

const dimensiones = [
  { key: "score_cronograma", label: "Cronograma" },
  { key: "score_finanzas", label: "Finanzas" },
  { key: "score_productividad", label: "Productividad" },
  { key: "score_calidad", label: "Calidad" },
  { key: "score_logistica", label: "Logística" },
  { key: "score_gestion", label: "Gestión" },
] as const

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600"
  if (score >= 60) return "text-amber-600"
  return "text-red-600"
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-50 border-emerald-200"
  if (score >= 60) return "bg-amber-50 border-amber-200"
  return "bg-red-50 border-red-200"
}

function scoreBar(score: number) {
  if (score >= 80) return "bg-emerald-500"
  if (score >= 60) return "bg-amber-500"
  return "bg-red-500"
}

function TendenciaIcon({ tendencia }: { tendencia: string | null }) {
  if (tendencia === "mejorando") return <TrendingUp className="h-4 w-4 text-emerald-600" />
  if (tendencia === "empeorando") return <TrendingDown className="h-4 w-4 text-red-600" />
  return <Minus className="h-4 w-4 text-slate-400" />
}

export default async function DesempenoPage() {
  const snapshots = await getData()

  // Agrupar por proyecto → obtener el último snapshot por proyecto
  const proyectoMap = new Map<string, { nombre: string; codigo: string; snapshots: IIDPSnapshot[] }>()
  for (const snap of snapshots) {
    const pid = snap.proyectos?.nombre ?? "Desconocido"
    if (!proyectoMap.has(pid)) {
      proyectoMap.set(pid, { nombre: snap.proyectos?.nombre ?? "—", codigo: snap.proyectos?.codigo ?? "", snapshots: [] })
    }
    proyectoMap.get(pid)!.snapshots.push(snap)
  }

  const ultimosPorProyecto = Array.from(proyectoMap.values()).map((p) => ({
    ...p,
    ultimo: p.snapshots[0], // ya ordenado desc por fecha
  }))

  return (
    <div>
      <Header
        titulo="Desempeño (IIDP)"
        subtitulo={
          snapshots.length === 0
            ? "Sin datos de desempeño"
            : `${snapshots.length} mediciones · ${proyectoMap.size} proyecto${proyectoMap.size !== 1 ? "s" : ""}`
        }
      />

      <div className="p-6 space-y-6">
        {snapshots.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin mediciones de desempeño</p>
            <p className="text-sm mt-1">El IIDP se calcula automáticamente con cada reporte diario</p>
          </div>
        ) : (
          <>
            {/* Cards de último IIDP por proyecto */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ultimosPorProyecto.map(({ nombre, codigo, ultimo }) => (
                <div key={nombre} className={cn("border rounded-xl p-5", scoreBg(ultimo.score_total))}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="font-mono text-xs text-slate-500">{codigo}</span>
                        <TendenciaIcon tendencia={ultimo.tendencia} />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800 truncate">{nombre}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(ultimo.fecha).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <CircularProgress value={Math.round(ultimo.score_total)} size={64} strokeWidth={6} />
                  </div>

                  {/* Dimensiones */}
                  <div className="mt-4 space-y-1.5">
                    {dimensiones.map(({ key, label }) => {
                      const val = Math.round(ultimo[key] ?? 0)
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
                          <div className="flex-1 bg-white/60 rounded-full h-1.5">
                            <div
                              className={cn("h-1.5 rounded-full", scoreBar(val))}
                              style={{ width: `${val}%` }}
                            />
                          </div>
                          <span className={cn("text-xs font-bold w-8 text-right", scoreColor(val))}>{val}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Historial por proyecto */}
            {Array.from(proyectoMap.entries()).map(([, proy]) => (
              <div key={proy.nombre} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <span className="font-mono text-xs text-slate-500">{proy.codigo}</span>
                  <h3 className="text-sm font-semibold text-slate-800">{proy.nombre}</h3>
                  <span className="text-xs text-slate-400">· {proy.snapshots.length} mediciones</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2 text-slate-500 font-medium">Fecha</th>
                        <th className="text-center px-3 py-2 text-slate-500 font-medium">IIDP</th>
                        {dimensiones.map((d) => (
                          <th key={d.key} className="text-center px-2 py-2 text-slate-400 font-medium whitespace-nowrap">
                            {d.label}
                          </th>
                        ))}
                        <th className="text-center px-3 py-2 text-slate-500 font-medium">Tendencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {proy.snapshots.map((snap) => (
                        <tr key={snap.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                            {new Date(snap.fecha).toLocaleDateString("es-MX", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn("font-bold text-sm", scoreColor(Math.round(snap.score_total)))}>
                              {Math.round(snap.score_total)}
                            </span>
                          </td>
                          {dimensiones.map((d) => {
                            const val = Math.round(snap[d.key] ?? 0)
                            return (
                              <td key={d.key} className={cn("px-2 py-2.5 text-center font-medium", scoreColor(val))}>
                                {val}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5 text-center">
                            <span className="flex justify-center">
                              <TendenciaIcon tendencia={snap.tendencia} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
