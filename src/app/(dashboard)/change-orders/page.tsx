import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { ChangeOrdersClient, type ChangeOrder, type ProyectoOpcion } from "./change-orders-client"

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

  const [{ data: changeOrders, error }, { data: proyectos }] = await Promise.all([
    supabase
      .from("change_orders")
      .select(`
        id, numero, titulo, descripcion, solicitado_por,
        estado, impacto_costo, impacto_dias,
        facturado, cobrado, created_at, aprobado_at,
        proyectos ( nombre, codigo )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("proyectos")
      .select("id, nombre, codigo")
      .order("nombre"),
  ])

  if (error) console.error("Error cargando change orders:", error.message)

  return {
    changeOrders: (changeOrders ?? []) as unknown as ChangeOrder[],
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
  }
}

export default async function ChangeOrdersPage() {
  const { changeOrders, proyectos, puedeCrear } = await getData()

  return (
    <div>
      <Header
        titulo="Change Orders"
        subtitulo={
          changeOrders.length === 0
            ? "Sin órdenes de cambio"
            : `${changeOrders.length} total`
        }
      />
      <ChangeOrdersClient changeOrdersIniciales={changeOrders} proyectos={proyectos} puedeCrear={puedeCrear} />
    </div>
  )
}
