import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { FlujoCajaClient, type Proyeccion, type ProyectoOpcion } from "./flujo-caja-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

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

  const { data: proyectos } = await supabase
    .from("proyectos")
    .select("id, nombre, codigo")
    .order("nombre")

  const todosLosProyectos = proyectos ?? []
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  let proyecciones: Proyeccion[] = []
  if (proyectoActivo) {
    const { data, error } = await supabase
      .from("flujo_caja_proyecciones")
      .select(`
        id, semana,
        ingresos_plan, ingresos_real,
        egresos_plan, egresos_real,
        saldo_proyectado, alerta_liquidez,
        proyectos ( nombre, codigo )
      `)
      .eq("proyecto_id", proyectoActivo.id)
      .order("semana", { ascending: true })
    if (error) console.error("Error cargando flujo de caja:", error.message)
    proyecciones = (data ?? []) as unknown as Proyeccion[]
  }

  return {
    proyecciones,
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
  }
}

export default async function FlujoCajaPage() {
  const { proyecciones, proyectos, puedeCrear, todosLosProyectos, proyectoActivoId } = await getData()

  return (
    <div>
      <Header
        titulo="Flujo de Caja"
        subtitulo={
          proyecciones.length === 0
            ? "Sin proyecciones cargadas"
            : `${proyecciones.length} semanas`
        }
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo proyectos={todosLosProyectos} proyectoActualId={proyectoActivoId} />
          ) : undefined
        }
      />
      <FlujoCajaClient proyeccionesIniciales={proyecciones} proyectos={proyectos} puedeCrear={puedeCrear} />
    </div>
  )
}
