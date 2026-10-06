import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { ChangeOrdersClient, type ChangeOrder, type ProyectoOpcion } from "./change-orders-client"
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
    .select("id, nombre, codigo, margen_co_pct")
    .order("nombre")

  const todosLosProyectos = proyectos ?? []
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  let changeOrders: ChangeOrder[] = []
  if (proyectoActivo) {
    const { data, error } = await supabase
      .from("change_orders")
      .select(`
        id, numero, titulo, descripcion, solicitado_por,
        estado, impacto_costo, impacto_dias,
        costo_directo, margen_pct_aplicado, costo_margen, motivo_rechazo,
        facturado, cobrado, created_at, aprobado_at, proyecto_id,
        proyectos ( nombre, codigo ),
        change_order_renglones ( id, proceso_id, nombre, descripcion, costo_material, costo_mano_obra, duracion_dias, cantidad_objetivo, unidad, orden )
      `)
      .eq("proyecto_id", proyectoActivo.id)
      .order("created_at", { ascending: false })
    if (error) console.error("Error cargando change orders:", error.message)
    changeOrders = (data ?? []) as unknown as ChangeOrder[]
  }

  // Divisiones (procesos) por proyecto -- para que el modal deje elegir
  // a qué división pertenece cada renglón del CO, igual que el resto
  // del presupuesto. Se traen de todos los proyectos de una vez (es un
  // catálogo chico) y el modal filtra por el proyecto seleccionado.
  const { data: procesos } = await supabase
    .from("procesos")
    .select("id, proyecto_id, codigo, nombre")
    .order("orden")

  const procesosPorProyecto: Record<string, { id: string; codigo: string; nombre: string }[]> = {}
  for (const p of procesos ?? []) {
    if (!procesosPorProyecto[p.proyecto_id]) procesosPorProyecto[p.proyecto_id] = []
    procesosPorProyecto[p.proyecto_id].push({ id: p.id, codigo: p.codigo, nombre: p.nombre })
  }

  return {
    changeOrders,
    proyectos: (proyectos ?? []) as ProyectoOpcion[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
    procesosPorProyecto,
  }
}

export default async function ChangeOrdersPage() {
  const { changeOrders, proyectos, puedeCrear, todosLosProyectos, proyectoActivoId, procesosPorProyecto } = await getData()

  return (
    <div>
      <Header
        titulo="Change Orders"
        subtitulo={
          changeOrders.length === 0
            ? "Sin órdenes de cambio"
            : `${changeOrders.length} total`
        }
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo proyectos={todosLosProyectos} proyectoActualId={proyectoActivoId} />
          ) : undefined
        }
      />
      <ChangeOrdersClient
        changeOrdersIniciales={changeOrders}
        proyectos={proyectos}
        puedeCrear={puedeCrear}
        procesosPorProyecto={procesosPorProyecto}
      />
    </div>
  )
}
