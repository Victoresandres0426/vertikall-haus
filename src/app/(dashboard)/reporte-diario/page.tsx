import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ReporteClient } from "./reporte-client"
import type { ActividadDB, TrabajadorDB, ProyectoSimple } from "./reporte-client"

async function getData(): Promise<{
  proyectos: ProyectoSimple[]
  actividadesPorProyecto: Record<string, ActividadDB[]>
  trabajadoresPorProyecto: Record<string, TrabajadorDB[]>
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Obtener proyectos activos
  const { data: proyectosRaw } = await supabase
    .from("proyectos")
    .select("id, codigo, nombre")
    .eq("activo", true)
    .order("created_at", { ascending: false })

  const proyectos: ProyectoSimple[] = (proyectosRaw ?? []) as ProyectoSimple[]

  // Obtener actividades activas (no completadas/canceladas) para todos los proyectos
  const proyectoIds = proyectos.map((p) => p.id)
  const actividadesPorProyecto: Record<string, ActividadDB[]> = {}

  if (proyectoIds.length > 0) {
    const { data: actsRaw } = await supabase
      .from("actividades")
      .select(`
        id, codigo, nombre, unidad,
        avance_porcentaje, cantidad_objetivo, cantidad_ejecutada, estado,
        proyecto_id
      `)
      .in("proyecto_id", proyectoIds)
      .not("estado", "in", '("completada","cancelada")')
      .order("codigo")

    for (const act of actsRaw ?? []) {
      const pid = (act as { proyecto_id: string } & ActividadDB).proyecto_id
      if (!actividadesPorProyecto[pid]) actividadesPorProyecto[pid] = []
      actividadesPorProyecto[pid].push(act as ActividadDB)
    }
  }

  // Trabajadores autorizados por proyecto (equipo asignado en la ficha del proyecto)
  // Nota: la tabla trabajadores tiene RLS restringida a roles de gestión (salario,
  // datos personales), así que aquí no se hace join directo -- se usa la función
  // trabajadores_directorio_empresa(), que solo expone campos no sensibles a
  // cualquier usuario autenticado de la empresa (ver migración 035).
  const trabajadoresPorProyecto: Record<string, TrabajadorDB[]> = {}

  if (proyectoIds.length > 0) {
    const [{ data: asignacionesRaw }, { data: directorioRaw }] = await Promise.all([
      supabase
        .from("proyecto_trabajadores")
        .select("proyecto_id, trabajador_id")
        .in("proyecto_id", proyectoIds)
        .eq("autorizado", true),
      supabase.rpc("trabajadores_directorio_empresa"),
    ])

    const directorio = new Map(
      ((directorioRaw ?? []) as (TrabajadorDB & { activo: boolean })[]).map((t) => [t.id, t])
    )

    for (const asign of (asignacionesRaw ?? []) as { proyecto_id: string; trabajador_id: string }[]) {
      const trabajador = directorio.get(asign.trabajador_id)
      if (!trabajador || trabajador.activo === false) continue
      if (!trabajadoresPorProyecto[asign.proyecto_id]) trabajadoresPorProyecto[asign.proyecto_id] = []
      const { activo: _activo, ...resto } = trabajador
      trabajadoresPorProyecto[asign.proyecto_id].push(resto)
    }
    for (const pid of Object.keys(trabajadoresPorProyecto)) {
      trabajadoresPorProyecto[pid].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))
    }
  }

  return { proyectos, actividadesPorProyecto, trabajadoresPorProyecto }
}

export default async function ReporteDiarioPage() {
  const { proyectos, actividadesPorProyecto, trabajadoresPorProyecto } = await getData()

  return (
    <ReporteClient
      proyectos={proyectos}
      actividadesPorProyecto={actividadesPorProyecto}
      trabajadoresPorProyecto={trabajadoresPorProyecto}
    />
  )
}
