import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { RiesgosClient, type Riesgo, type ProyectoOpcion } from "./riesgos-client"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  const [{ data: riesgos, error }, { data: proyectos }] = await Promise.all([
    supabase
      .from("riesgos")
      .select(`
        id, titulo, descripcion, categoria,
        probabilidad, impacto_costo, impacto_dias, exposicion,
        estado, mitigacion, created_at,
        proyectos ( nombre, codigo ),
        actividades ( nombre, codigo )
      `)
      .order("exposicion", { ascending: false, nullsFirst: false }),
    supabase
      .from("proyectos")
      .select("id, nombre, codigo")
      .order("nombre"),
  ])

  if (error) console.error("Error cargando riesgos:", error.message)

  return {
    riesgos: (riesgos ?? []) as unknown as Riesgo[],
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
  }
}

export default async function RiesgosPage() {
  const { riesgos, proyectos, puedeCrear } = await getData()

  return (
    <div>
      <Header
        titulo="Registro de Riesgos"
        subtitulo={
          riesgos.length === 0
            ? "Sin riesgos registrados"
            : `${riesgos.length} riesgos registrados`
        }
      />
      <RiesgosClient riesgosIniciales={riesgos} proyectos={proyectos} puedeCrear={puedeCrear} />
    </div>
  )
}
