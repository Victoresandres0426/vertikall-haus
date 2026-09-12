import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import { HistorialEditClient } from "./historial-edit-client"
import type { TrabajadorHist, ActividadHist, SplitInicial, AsistenciaInicial, AvanceInicial, RendimientoTotales, RendimientoTrabajador } from "./historial-edit-client"
import {
  agregarRendimiento,
  agregarRendimientoPorTrabajador,
  rendimientoPct,
  type ActividadPlanRendimiento,
  type EntradaRendimiento,
} from "@/lib/engine/rendimiento"

const ROLES_EDITAN = ["dueno", "superadmin", "administrador", "project_manager"]

export default async function HistorialReporteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, empresa_id, rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_EDITAN.includes(perfil.rol)) redirect("/sin-acceso")

  const { data: reporte } = await supabase
    .from("reportes_diarios")
    .select(`
      id, fecha, clima, observaciones_generales, proyecto_id,
      proyectos ( nombre ),
      perfiles_usuario!capataz_id ( nombre_completo )
    `)
    .eq("id", id)
    .single()

  // Si RLS no le da acceso a este proyecto (ej. un PM sin asignar) o el
  // reporte no existe, simplemente no aparece nada -- 404.
  if (!reporte) notFound()

  const proyectoId = reporte.proyecto_id as string

  const [
    { data: actividadesRaw },
    { data: asignacionesRaw },
    { data: directorioRaw },
    { data: asistenciaRaw },
    { data: avanceRaw },
    { data: splitsRaw },
  ] = await Promise.all([
    supabase
      .from("actividades")
      .select("id, codigo, nombre, unidad, cantidad_objetivo, cantidad_ejecutada, avance_porcentaje, duracion_plan_dias, personal_planeado")
      .eq("proyecto_id", proyectoId)
      .order("codigo"),
    supabase
      .from("proyecto_trabajadores")
      .select("trabajador_id, rol_obra_proyecto")
      .eq("proyecto_id", proyectoId)
      .eq("autorizado", true),
    supabase.rpc("trabajadores_directorio_empresa"),
    supabase
      .from("asistencia_diaria")
      .select("trabajador_id, presente, horas_regulares, horas_extra")
      .eq("reporte_id", id),
    supabase
      .from("avance_diario")
      .select("actividad_id, cantidad_ejecutada_dia, porcentaje_avance_total, incidencias")
      .eq("reporte_id", id),
    supabase
      .from("asistencia_actividad_diaria")
      .select("trabajador_id, actividad_id, rol_aplicado, horas, avance_cantidad")
      .eq("reporte_id", id),
  ])

  const directorio = new Map(
    ((directorioRaw ?? []) as { id: string; nombre_completo: string; rol_obra: string | null; activo: boolean }[]).map((t) => [t.id, t])
  )

  const idsAutorizados = new Set((asignacionesRaw ?? []).map((a: { trabajador_id: string }) => a.trabajador_id))
  const idsConAsistencia = new Set((asistenciaRaw ?? []).map((a: { trabajador_id: string }) => a.trabajador_id))
  const idsRelevantes = new Set([...idsAutorizados, ...idsConAsistencia])

  const rolPorProyecto = new Map(
    (asignacionesRaw ?? [])
      .filter((a: { rol_obra_proyecto: string | null }) => a.rol_obra_proyecto)
      .map((a: { trabajador_id: string; rol_obra_proyecto: string | null }) => [a.trabajador_id, a.rol_obra_proyecto])
  )

  const trabajadores: TrabajadorHist[] = [...idsRelevantes]
    .map((tid) => directorio.get(tid))
    .filter((t): t is { id: string; nombre_completo: string; rol_obra: string | null; activo: boolean } => !!t)
    .map((t) => ({ id: t.id, nombre_completo: t.nombre_completo, rol_obra: (rolPorProyecto.get(t.id) as string | undefined) ?? t.rol_obra }))
    .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))

  const actividades: ActividadHist[] = (actividadesRaw ?? []) as ActividadHist[]

  const asistenciaInicial: Record<string, AsistenciaInicial> = {}
  for (const a of (asistenciaRaw ?? []) as { trabajador_id: string; presente: boolean; horas_regulares: number; horas_extra: number }[]) {
    asistenciaInicial[a.trabajador_id] = { presente: a.presente, horas_regulares: Number(a.horas_regulares ?? 0), horas_extra: Number(a.horas_extra ?? 0) }
  }

  const avanceInicial: Record<string, AvanceInicial> = {}
  for (const a of (avanceRaw ?? []) as { actividad_id: string; cantidad_ejecutada_dia: number; porcentaje_avance_total: number | null; incidencias: string | null }[]) {
    avanceInicial[a.actividad_id] = {
      cantidad_ejecutada_dia: Number(a.cantidad_ejecutada_dia ?? 0),
      porcentaje_avance_total: a.porcentaje_avance_total != null ? Number(a.porcentaje_avance_total) : null,
      incidencias: a.incidencias ?? "",
    }
  }

  const splitsPorTrabajador: Record<string, SplitInicial[]> = {}
  for (const s of (splitsRaw ?? []) as { trabajador_id: string; actividad_id: string; rol_aplicado: string | null; horas: number; avance_cantidad: number | null }[]) {
    if (!splitsPorTrabajador[s.trabajador_id]) splitsPorTrabajador[s.trabajador_id] = []
    splitsPorTrabajador[s.trabajador_id].push({
      actividadId: s.actividad_id,
      rol: s.rol_aplicado ?? "",
      horas: Number(s.horas ?? 0),
      avance: s.avance_cantidad != null ? Number(s.avance_cantidad) : 0,
    })
  }

  // ── Rendimiento real vs. plan de este día (ver lib/engine/rendimiento.ts) ──
  // Compara, por cada renglón de asistencia_actividad_diaria, cuánto se
  // produjo realmente (avance_cantidad) contra cuánto debía producirse en
  // esas horas según el plan de la actividad (cantidad_objetivo /
  // duracion_plan_dias / personal_planeado). No es solo horas trabajadas.
  const actividadesPlan = new Map<string, ActividadPlanRendimiento>(
    (actividadesRaw ?? []).map((a: { id: string; cantidad_objetivo: number | null; duracion_plan_dias: number | null; personal_planeado: number | null }) => [
      a.id,
      {
        id: a.id,
        cantidad_objetivo: a.cantidad_objetivo != null ? Number(a.cantidad_objetivo) : null,
        duracion_plan_dias: a.duracion_plan_dias != null ? Number(a.duracion_plan_dias) : null,
        personal_planeado: a.personal_planeado != null ? Number(a.personal_planeado) : null,
      },
    ])
  )

  const entradasRendimiento: EntradaRendimiento[] = (splitsRaw ?? []).map(
    (s: { trabajador_id: string; actividad_id: string; horas: number; avance_cantidad: number | null }) => ({
      actividadId: s.actividad_id,
      trabajadorId: s.trabajador_id,
      horas: Number(s.horas ?? 0),
      avanceCantidad: s.avance_cantidad != null ? Number(s.avance_cantidad) : null,
    })
  )

  const totalesDia = agregarRendimiento(entradasRendimiento, actividadesPlan)
  const rendimientoDia: RendimientoTotales = {
    horasReales: totalesDia.horasReales,
    horasEquivalentesPlan: totalesDia.horasEquivalentesPlan,
    pct: rendimientoPct(totalesDia),
  }

  const nombrePorTrabajador = new Map(trabajadores.map((t) => [t.id, t.nombre_completo]))
  const rendimientoPorTrabajador: RendimientoTrabajador[] = agregarRendimientoPorTrabajador(entradasRendimiento, actividadesPlan)
    .map((r) => ({
      trabajadorId: r.trabajadorId,
      nombre: nombrePorTrabajador.get(r.trabajadorId) ?? "—",
      horasReales: r.horasReales,
      horasEquivalentesPlan: r.horasEquivalentesPlan,
      pct: r.rendimientoPct,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  return (
    <div>
      <Header
        titulo="Editar reporte"
        subtitulo={`${(reporte.proyectos as unknown as { nombre: string } | null)?.nombre ?? "—"} · Capataz: ${(reporte.perfiles_usuario as unknown as { nombre_completo: string } | null)?.nombre_completo ?? "—"}`}
      />
      <HistorialEditClient
        reporteId={reporte.id}
        proyectoId={proyectoId}
        fecha={reporte.fecha}
        clima={reporte.clima}
        observaciones={reporte.observaciones_generales}
        trabajadores={trabajadores}
        actividades={actividades}
        asistenciaInicial={asistenciaInicial}
        avanceInicial={avanceInicial}
        splitsPorTrabajador={splitsPorTrabajador}
        rendimientoDia={rendimientoDia}
        rendimientoPorTrabajador={rendimientoPorTrabajador}
      />
    </div>
  )
}
