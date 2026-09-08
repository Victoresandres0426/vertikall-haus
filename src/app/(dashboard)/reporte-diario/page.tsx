import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ReporteClient } from "./reporte-client"
import type { ActividadDB, TrabajadorDB, ProyectoSimple } from "./reporte-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

async function getData(): Promise<{
  proyectos: ProyectoSimple[]
  todosLosProyectos: ProyectoSimple[]
  actividadesPorProyecto: Record<string, ActividadDB[]>
  trabajadoresPorProyecto: Record<string, TrabajadorDB[]>
  tarifaManoObraPorActividad: Record<string, number>
  horasQrPorTrabajador: Record<string, number>
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

  const todosLosProyectos: ProyectoSimple[] = (proyectosRaw ?? []) as ProyectoSimple[]

  // Reporte Diario ahora se limita al proyecto "activo" (elegido con el
  // selector en la parte superior y recordado en una cookie) en vez de
  // mezclar los de todos los proyectos a la vez.
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)
  const proyectos: ProyectoSimple[] = proyectoActivo ? [proyectoActivo] : []

  // Obtener actividades activas (no completadas/canceladas) del proyecto activo
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
        .select("proyecto_id, trabajador_id, rol_obra_proyecto")
        .in("proyecto_id", proyectoIds)
        .eq("autorizado", true),
      supabase.rpc("trabajadores_directorio_empresa"),
    ])

    const directorio = new Map(
      ((directorioRaw ?? []) as (TrabajadorDB & { activo: boolean; usuario_rol: string | null })[]).map((t) => [t.id, t])
    )

    for (const asign of (asignacionesRaw ?? []) as { proyecto_id: string; trabajador_id: string; rol_obra_proyecto: string | null }[]) {
      const trabajador = directorio.get(asign.trabajador_id)
      if (!trabajador || trabajador.activo === false) continue
      if (!trabajadoresPorProyecto[asign.proyecto_id]) trabajadoresPorProyecto[asign.proyecto_id] = []
      // Solo el capataz queda obligado al QR -- un PM vinculado a Personal
      // no está obligado a estar en la obra, así que sigue con horas
      // editables a mano (ver migración 055).
      const { activo: _activo, usuario_rol, ...resto } = trabajador
      const trabajadorFinal = { ...resto, requiere_qr: usuario_rol === "capataz" }
      // El rol específico de este proyecto (si se definió) reemplaza al rol general
      // solo para lo que se muestra aquí -- no toca el registro de Personal.
      if (asign.rol_obra_proyecto) trabajadorFinal.rol_obra = asign.rol_obra_proyecto
      trabajadoresPorProyecto[asign.proyecto_id].push(trabajadorFinal)
    }
    for (const pid of Object.keys(trabajadoresPorProyecto)) {
      trabajadoresPorProyecto[pid].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))
    }
  }

  // Tarifa de mano de obra presupuestada por actividad (para el pago a
  // destajo del reporte diario) -- viene de la partida del presupuesto
  // vigente con tipo_recurso='mano_obra'. Si una actividad no tiene una
  // partida así, simplemente no aparece en el mapa y el reporte cae de
  // vuelta al pago por hora (ver registrar_asistencia_actividad, migración 054).
  const tarifaManoObraPorActividad: Record<string, number> = {}
  const actividadIds = Object.values(actividadesPorProyecto).flat().map((a) => a.id)
  if (actividadIds.length > 0) {
    try {
      const { data: partidasRaw } = await supabase
        .from("partidas_presupuesto")
        .select("actividad_id, precio_unitario, presupuestos!inner(es_baseline_actual)")
        .in("actividad_id", actividadIds)
        .eq("tipo_recurso", "mano_obra")
        .eq("presupuestos.es_baseline_actual", true)

      for (const p of (partidasRaw ?? []) as unknown as { actividad_id: string | null; precio_unitario: number | null }[]) {
        if (p.actividad_id && p.precio_unitario != null) {
          tarifaManoObraPorActividad[p.actividad_id] = Number(p.precio_unitario)
        }
      }
    } catch { /* migración 054 no aplicada aún */ }
  }

  // Horas reales del día según el check-in QR (entrada/salida) -- cuando
  // existen, el reporte se precarga con esto en vez de un default a
  // ciegas de 8h. Requiere que el trabajador haya escaneado el QR y ya
  // tenga una "salida" registrada hoy (manual o por cierre automático);
  // si aún no la tiene, el reporte sigue con el default editable.
  const horasQrPorTrabajador: Record<string, number> = {}
  if (proyectoActivo) {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
    try {
      const { data: qrRaw } = await supabase
        .from("registros_asistencia_qr")
        .select("trabajador_id, horas_trabajadas")
        .eq("proyecto_id", proyectoActivo.id)
        .eq("fecha", hoy)
        .eq("tipo", "salida")
        .not("trabajador_id", "is", null)

      for (const r of (qrRaw ?? []) as { trabajador_id: string | null; horas_trabajadas: number | null }[]) {
        if (r.trabajador_id && r.horas_trabajadas != null) {
          horasQrPorTrabajador[r.trabajador_id] = (horasQrPorTrabajador[r.trabajador_id] ?? 0) + Number(r.horas_trabajadas)
        }
      }
    } catch { /* si aún no existe registros_asistencia_qr, no rompe el reporte */ }
  }

  return { proyectos, todosLosProyectos, actividadesPorProyecto, trabajadoresPorProyecto, tarifaManoObraPorActividad, horasQrPorTrabajador }
}

export default async function ReporteDiarioPage() {
  const { proyectos, todosLosProyectos, actividadesPorProyecto, trabajadoresPorProyecto, tarifaManoObraPorActividad, horasQrPorTrabajador } = await getData()

  return (
    <ReporteClient
      proyectos={proyectos}
      todosLosProyectos={todosLosProyectos}
      actividadesPorProyecto={actividadesPorProyecto}
      trabajadoresPorProyecto={trabajadoresPorProyecto}
      tarifaManoObraPorActividad={tarifaManoObraPorActividad}
      horasQrPorTrabajador={horasQrPorTrabajador}
    />
  )
}
