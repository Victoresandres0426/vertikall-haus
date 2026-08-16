import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CheckCircle, Clock, Play, Ban, Circle, ChevronRight, AlertTriangle } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type Actividad = {
  id: string
  codigo: string
  nombre: string
  estado: string
  avance_porcentaje: number
  es_critica: boolean
  riesgo_nivel: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  holgura_dias: number
  costo_presupuesto: number
  costo_real: number
}

type Proceso = {
  id: string
  codigo: string
  nombre: string
  orden: number
  actividades: Actividad[]
}

type Proyecto = {
  id: string
  codigo: string
  nombre: string
  procesos: Proceso[]
}

function EstadoIcon({ estado }: { estado: string }) {
  const cls = "h-4 w-4 shrink-0"
  switch (estado) {
    case "completada":   return <CheckCircle className={cn(cls, "text-emerald-600")} />
    case "en_progreso":  return <Play        className={cn(cls, "text-blue-600")} />
    case "bloqueada":    return <Ban         className={cn(cls, "text-red-600")} />
    case "cancelada":    return <Ban         className={cn(cls, "text-slate-400")} />
    default:             return <Circle      className={cn(cls, "text-slate-300")} />
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

async function getProyectosConActividades(): Promise<Proyecto[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data, error } = await supabase
    .from("proyectos")
    .select(`
      id, codigo, nombre,
      procesos (
        id, codigo, nombre, orden,
        actividades (
          id, codigo, nombre, estado,
          avance_porcentaje, es_critica, riesgo_nivel,
          fecha_inicio_plan, fecha_fin_plan, holgura_dias,
          costo_presupuesto, costo_real
        )
      )
    `)
    .eq("activo", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error cargando actividades:", error.message)
    return []
  }

  // Ordenar procesos y actividades
  return ((data ?? []) as unknown as Proyecto[]).map((proy) => ({
    ...proy,
    procesos: (proy.procesos ?? [])
      .sort((a, b) => a.orden - b.orden)
      .map((proc) => ({
        ...proc,
        actividades: (proc.actividades ?? []).sort(
          (a, b) => a.codigo.localeCompare(b.codigo)
        ),
      })),
  }))
}

export default async function ActividadesPage() {
  const proyectos = await getProyectosConActividades()

  const totalActs = proyectos.flatMap((p) => p.procesos.flatMap((pr) => pr.actividades))
  const enProgreso = totalActs.filter((a) => a.estado === "en_progreso").length
  const completadas = totalActs.filter((a) => a.estado === "completada").length
  const bloqueadas = totalActs.filter((a) => a.estado === "bloqueada").length

  return (
    <div>
      <Header
        titulo="Actividades"
        subtitulo={`${totalActs.length} actividades · ${enProgreso} en progreso · ${completadas} completadas`}
      />

      <div className="p-6 space-y-6">
        {/* Resumen */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", val: totalActs.length, color: "text-slate-900" },
            { label: "En progreso", val: enProgreso, color: "text-blue-600" },
            { label: "Completadas", val: completadas, color: "text-emerald-600" },
            { label: "Bloqueadas", val: bloqueadas, color: "text-red-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Actividades por proyecto */}
        {proyectos.length === 0 ? (
          <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <p className="text-lg font-medium">Sin actividades</p>
            <p className="text-sm mt-1">Crea un proyecto y agrega actividades</p>
          </div>
        ) : (
          proyectos.map((proy) => (
            <div key={proy.id}>
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{proy.codigo}</span>
                <h2 className="text-base font-semibold text-slate-900">{proy.nombre}</h2>
              </div>

              <div className="space-y-3">
                {proy.procesos.map((proc) => {
                  const acts = proc.actividades
                  const promedioAvance = acts.length > 0
                    ? Math.round(acts.reduce((s, a) => s + (a.avance_porcentaje ?? 0), 0) / acts.length)
                    : 0

                  return (
                    <div key={proc.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {/* Header proceso */}
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">{proc.codigo}</span>
                          <h3 className="text-sm font-semibold text-slate-800">{proc.nombre}</h3>
                          <span className="text-xs text-slate-400">· {acts.length} actividad{acts.length !== 1 ? "es" : ""}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={promedioAvance} className="w-20 h-1.5" />
                          <span className="text-xs font-medium text-slate-600">{promedioAvance}%</span>
                        </div>
                      </div>

                      {/* Lista de actividades */}
                      <div className="divide-y divide-slate-50">
                        {acts.map((act) => (
                          <div key={act.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                            <EstadoIcon estado={act.estado} />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-slate-400">{act.codigo}</span>
                                <span className="text-sm font-medium text-slate-800 truncate">{act.nombre}</span>
                                {act.es_critica && (
                                  <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                                    Crítica
                                  </span>
                                )}
                                {act.riesgo_nivel === "rojo" && <AlertaBadge nivel="rojo" />}
                                {act.riesgo_nivel === "amarillo" && <AlertaBadge nivel="amarillo" />}
                              </div>

                              <div className="flex items-center gap-3 mt-1">
                                <Progress value={act.avance_porcentaje ?? 0} className="w-24 h-1" />
                                <span className="text-xs text-slate-500">{act.avance_porcentaje ?? 0}%</span>
                                {act.fecha_fin_plan && (
                                  <span className="text-xs text-slate-400">
                                    Fin plan: {act.fecha_fin_plan}
                                  </span>
                                )}
                                {(act.holgura_dias ?? 0) > 0 && (
                                  <span className="text-xs text-slate-400">
                                    Holgura: {act.holgura_dias}d
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-right hidden sm:block">
                              <Badge variant={estadoVariant(act.estado)} className="text-xs">
                                {estadoLabel(act.estado)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
