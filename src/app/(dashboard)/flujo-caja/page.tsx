import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { FlujoCajaClient, type Proyeccion, type ProyectoOpcion } from "./flujo-caja-client"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) redirect("/sin-acceso")

  const [{ data: proyecciones, error }, { data: proyectos }] = await Promise.all([
    supabase
      .from("flujo_caja_proyecciones")
      .select(`
        id, semana,
        ingresos_plan, ingresos_real,
        egresos_plan, egresos_real,
        saldo_proyectado, alerta_liquidez,
        proyectos ( nombre, codigo )
      `)
      .order("semana", { ascending: true }),
    supabase
      .from("proyectos")
      .select("id, nombre, codigo")
      .order("nombre"),
  ])

  if (error) console.error("Error cargando flujo de caja:", error.message)

  return {
    proyecciones: (proyecciones ?? []) as unknown as Proyeccion[],
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
  }
}

export default async function FlujoCajaPage() {
  const { proyecciones, proyectos, puedeCrear } = await getData()

  return (
    <div>
      <Header
        titulo="Flujo de Caja"
        subtitulo={
          proyecciones.length === 0
            ? "Sin proyecciones cargadas"
            : `${proyecciones.length} semanas`
        }
      />
      <FlujoCajaClient proyeccionesIniciales={proyecciones} proyectos={proyectos} puedeCrear={puedeCrear} />
    </div>
  )
}
