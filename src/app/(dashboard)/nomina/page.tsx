import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import {
  NominaClient,
  type PeriodoNomina,
  type LineaNomina,
  type TrabajadorOpcion,
  type ProyectoOpcion,
} from "./nomina-client"

const ROLES_NOMINA = ["dueno", "superadmin", "administrador"]

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_NOMINA.includes(perfil.rol)) redirect("/sin-acceso")

  const [{ data: periodosRaw }, { data: trabajadoresRaw }, { data: proyectosRaw }] = await Promise.all([
    supabase
      .from("periodos_nomina")
      .select("id, periodo, fecha_inicio, fecha_fin, estado, created_at")
      .eq("empresa_id", perfil.empresa_id)
      .order("fecha_inicio", { ascending: false }),
    supabase
      .from("trabajadores")
      .select("id, nombre_completo, rol_obra")
      .eq("empresa_id", perfil.empresa_id)
      .eq("activo", true)
      .order("nombre_completo"),
    supabase
      .from("proyectos")
      .select("id, nombre, codigo")
      .eq("empresa_id", perfil.empresa_id),
  ])

  const periodos = (periodosRaw ?? []) as PeriodoNomina[]
  const periodoIds = periodos.map((p) => p.id)

  let lineas: LineaNomina[] = []
  if (periodoIds.length > 0) {
    const { data: lineasRaw } = await supabase
      .from("lineas_nomina")
      .select(
        "id, periodo_id, trabajador_id, dias_trabajados, horas_regulares, horas_extra, salario_base, extra_monto, bonos, deducciones, anticipos, neto_a_pagar, distribucion_proyectos"
      )
      .in("periodo_id", periodoIds)
    lineas = (lineasRaw ?? []) as LineaNomina[]
  }

  return {
    periodos,
    lineas,
    trabajadores: (trabajadoresRaw ?? []) as TrabajadorOpcion[],
    proyectos: (proyectosRaw ?? []) as ProyectoOpcion[],
  }
}

export default async function NominaPage() {
  const { periodos, lineas, trabajadores, proyectos } = await getData()

  return (
    <div>
      <Header
        titulo="Nómina"
        subtitulo={periodos.length === 0 ? "Sin periodos creados" : `${periodos.length} periodo${periodos.length !== 1 ? "s" : ""}`}
      />
      <NominaClient
        periodosIniciales={periodos}
        lineasIniciales={lineas}
        trabajadores={trabajadores}
        proyectos={proyectos}
      />
    </div>
  )
}
