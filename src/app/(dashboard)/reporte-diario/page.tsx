import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ReporteClient } from "./reporte-client"
import type { ActividadDB, TrabajadorDB, ProyectoSimple } from "./reporte-client"

async function getData(): Promise<{
  proyectos: ProyectoSimple[]
  actividadesPorProyecto: Record<string, ActividadDB[]>
  trabajadores: TrabajadorDB[]
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

  // Trabajadores de la empresa (si existen)
  const { data: trabajadoresRaw } = await supabase
    .from("trabajadores")
    .select("id, nombre_completo, rol_obra, especialidad")
    .eq("activa" as never, true)
    .order("nombre_completo")

  const trabajadores: TrabajadorDB[] = (trabajadoresRaw ?? []) as TrabajadorDB[]

  return { proyectos, actividadesPorProyecto, trabajadores }
}

export default async function ReporteDiarioPage() {
  const { proyectos, actividadesPorProyecto, trabajadores } = await getData()

  return (
    <ReporteClient
      proyectos={proyectos}
      actividadesPorProyecto={actividadesPorProyecto}
      trabajadores={trabajadores}
    />
  )
}
