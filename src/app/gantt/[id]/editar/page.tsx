import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { parseISO, formatISO, hoyMexico } from "@/lib/gantt-utils"
import { GanttEditableClient, type ActividadEditable, type ProcesoEditable } from "./gantt-editable-client"

// Días de "colchón" antes/después del rango real de actividades, para
// que haya espacio de sobra donde arrastrar una barra más allá de las
// fechas que ya existen (por ejemplo, adelantar el inicio del proyecto
// completo, o correr la última actividad varias semanas).
const COLCHON_ANTES_DIAS = 21
const COLCHON_DESPUES_DIAS = 45

export default async function GanttEditarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  const rolesEditan = ["project_manager", "administrador", "dueno", "superadmin"]
  const puedeEditar = !!perfil && rolesEditan.includes(perfil.rol)

  const { data: proyecto, error } = await supabase
    .from("proyectos")
    .select(`
      id, codigo, nombre,
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

  const procesos: ProcesoEditable[] = ((proyecto.procesos ?? []) as unknown as ProcesoEditable[])
    .map((p) => ({
      ...p,
      actividades: (p.actividades ?? [])
        .filter((a: ActividadEditable) => a.activa !== false && a.fecha_inicio_plan && a.fecha_fin_plan)
        .sort((a: ActividadEditable, b: ActividadEditable) =>
          a.fecha_inicio_plan! < b.fecha_inicio_plan! ? -1 : a.fecha_inicio_plan! > b.fecha_inicio_plan! ? 1 : a.codigo.localeCompare(b.codigo)
        ),
    }))
    .sort((a, b) => a.orden - b.orden)
    .filter((p) => p.actividades.length > 0)

  const todasFechas: string[] = procesos.flatMap((p) => p.actividades.flatMap((a) => [a.fecha_inicio_plan!, a.fecha_fin_plan!]))

  if (todasFechas.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center text-slate-500">
        Este proyecto todavía no tiene actividades con fechas cargadas — no hay nada que mover todavía.
      </div>
    )
  }

  const rangeStartReal = parseISO(todasFechas.reduce((min, f) => (f < min ? f : min)))
  const rangeEndReal = parseISO(todasFechas.reduce((max, f) => (f > max ? f : max)))

  const rangeStart = new Date(rangeStartReal)
  rangeStart.setDate(rangeStart.getDate() - COLCHON_ANTES_DIAS)
  const rangeEnd = new Date(rangeEndReal)
  rangeEnd.setDate(rangeEnd.getDate() + COLCHON_DESPUES_DIAS)

  const hoy = hoyMexico()

  return (
    <div className="min-h-screen bg-white p-6 text-slate-900">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="text-xs text-slate-400 font-mono">{proyecto.codigo}</p>
          <h1 className="text-lg font-bold text-slate-900">{proyecto.nombre} — Editar cronograma</h1>
        </div>
        <Link
          href={`/gantt/${proyecto.id}`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Ver / imprimir
        </Link>
      </div>

      {!puedeEditar && (
        <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Puedes ver el cronograma pero no tienes permiso para mover o estirar actividades. Solo project manager, administrador, dueño o superadmin pueden editarlo.
        </p>
      )}

      <GanttEditableClient
        procesos={procesos}
        rangeStartISO={formatISO(rangeStart)}
        rangeEndISO={formatISO(rangeEnd)}
        hoyISO={formatISO(hoy)}
        soloLectura={!puedeEditar}
      />
    </div>
  )
}
