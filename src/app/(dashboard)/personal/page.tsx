import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { PersonalClient } from "./personal-client"

type SearchParams = { fecha?: string }

export default async function PersonalPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, empresa_id, nombre_completo, rol")
    .eq("id", user.id)
    .single()

  if (!perfil) redirect("/sin-acceso")

  const ROLES_VEN_PERSONAL = ["dueno", "superadmin", "administrador", "project_manager"]
  if (!ROLES_VEN_PERSONAL.includes(perfil.rol)) redirect("/sin-acceso")

  // Ganancias del día: qué ganó cada trabajador en una fecha puntual
  // (default hoy), sumando lo que registró el Reporte Diario por
  // actividad (destajo o por hora, migraciones 050/054). Mismo nivel de
  // acceso que costos_reales -- RLS de asistencia_actividad_diaria ya
  // restringe esto a dueno/superadmin/administrador/project_manager.
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
  const fechaGanancias = params.fecha ?? hoy

  const [{ data: trabajadores }, { data: proyectos }, { data: tarifasRaw }, { data: usuariosSistemaRaw }, { data: gananciasRaw }] = await Promise.all([
    supabase
      .from("trabajadores")
      .select("id, nombre_completo, codigo, especialidad, rol_obra, nivel_experiencia, tarifa_diaria, moneda, activo, fecha_ingreso, notas, usuario_id, telefono_personal, direccion, contacto_emergencia_nombre, contacto_emergencia_telefono")
      .eq("empresa_id", perfil.empresa_id)
      .order("nombre_completo"),
    supabase
      .from("proyectos")
      .select("id, nombre")
      .eq("empresa_id", perfil.empresa_id)
      .eq("estado", "activo"),
    supabase
      .from("tarifas_trabajo")
      .select("id, trabajador_id, rol_obra, tarifa_hora")
      .eq("activo", true),
    // Cuentas del sistema (capataz/PM/etc.) que se pueden vincular a un
    // registro de Personal, para que también puedan cobrar como
    // trabajador si hacen tarea de campo (no solo su rol de gestión).
    supabase
      .from("perfiles_usuario")
      .select("id, nombre_completo, rol")
      .eq("empresa_id", perfil.empresa_id)
      .neq("rol", "cliente")
      .order("nombre_completo"),
    // Si 050/054 no están aplicadas todavía, esto vuelve con error y
    // data=null -- no rompe la página, solo deja las ganancias vacías.
    supabase
      .from("asistencia_actividad_diaria")
      .select(`
        trabajador_id, horas, costo, modo_pago, avance_cantidad, rol_aplicado,
        reportes_diarios!inner ( fecha, proyectos ( nombre ) ),
        actividades ( nombre, unidad )
      `)
      .eq("reportes_diarios.fecha", fechaGanancias),
  ])

  const puedeEditar = ["dueno", "superadmin", "administrador", "project_manager"].includes(perfil.rol)

  const tarifasPorTrabajador: Record<string, { id: string; rol_obra: string; tarifa_hora: number | null }[]> = {}
  for (const t of tarifasRaw ?? []) {
    const row = t as { id: string; trabajador_id: string; rol_obra: string; tarifa_hora: number | null }
    if (!tarifasPorTrabajador[row.trabajador_id]) tarifasPorTrabajador[row.trabajador_id] = []
    tarifasPorTrabajador[row.trabajador_id].push({ id: row.id, rol_obra: row.rol_obra, tarifa_hora: row.tarifa_hora })
  }

  // Ganancias del día por trabajador: total + desglose por actividad.
  type GananciaDetalle = {
    proyecto: string; actividad: string; horas: number
    avance_cantidad: number | null; modo_pago: string; costo: number
  }
  const gananciasPorTrabajador: Record<string, { total: number; detalle: GananciaDetalle[] }> = {}
  for (const g of (gananciasRaw ?? []) as unknown as {
    trabajador_id: string; horas: number; costo: number; modo_pago: string | null
    avance_cantidad: number | null
    reportes_diarios: { fecha: string; proyectos: { nombre: string } | null } | null
    actividades: { nombre: string; unidad: string | null } | null
  }[]) {
    if (!gananciasPorTrabajador[g.trabajador_id]) {
      gananciasPorTrabajador[g.trabajador_id] = { total: 0, detalle: [] }
    }
    const entrada = gananciasPorTrabajador[g.trabajador_id]
    entrada.total += Number(g.costo ?? 0)
    entrada.detalle.push({
      proyecto: g.reportes_diarios?.proyectos?.nombre ?? "—",
      actividad: g.actividades?.nombre ?? "—",
      horas: Number(g.horas ?? 0),
      avance_cantidad: g.avance_cantidad != null ? Number(g.avance_cantidad) : null,
      modo_pago: g.modo_pago ?? "hora",
      costo: Number(g.costo ?? 0),
    })
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        titulo="Personal"
        subtitulo="Trabajadores y operarios registrados"
      />
      <div className="flex-1 overflow-auto">
        <PersonalClient
          trabajadores={trabajadores ?? []}
          proyectos={proyectos ?? []}
          puedeEditar={puedeEditar}
          empresaId={perfil.empresa_id}
          tarifasPorTrabajador={tarifasPorTrabajador}
          usuariosSistema={usuariosSistemaRaw ?? []}
          gananciasPorTrabajador={gananciasPorTrabajador}
          fechaGanancias={fechaGanancias}
        />
      </div>
    </div>
  )
}
