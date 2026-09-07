import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { MaterialesClient, type MaterialCatalogo, type MaterialActividad } from "./materiales-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

const ROLES_GESTION = ["project_manager", "dueno", "superadmin", "administrador"]

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: perfil }, { data: proyectosActivos }] = await Promise.all([
    supabase.from("perfiles_usuario").select("rol").eq("id", user.id).single(),
    supabase.from("proyectos").select("id, codigo, nombre").eq("activo", true).order("created_at", { ascending: false }),
  ])

  const todosLosProyectos = proyectosActivos ?? []
  const cookieId = await getProyectoActivoId()
  const proyectoActivo = resolverProyectoActivo(todosLosProyectos, cookieId)

  // El catálogo de materiales es de toda la empresa (no pertenece a un solo
  // proyecto), así que se muestra completo -- lo que sí se filtra por el
  // proyecto activo son las asignaciones/consumo por actividad.
  const { data: catalogo } = await supabase
    .from("materiales_catalogo")
    .select("id, codigo, nombre, descripcion, unidad, categoria, precio_unitario, stock_actual, stock_minimo")
    .order("categoria")
    .order("nombre")

  let asignados: MaterialActividad[] = []
  if (proyectoActivo) {
    const { data } = await supabase
      .from("materiales_actividad")
      .select(`
        id, cantidad_plan, cantidad_recibida, cantidad_en_transito,
        costo_unitario:precio_unitario,
        material_id,
        actividades!inner ( nombre, codigo, proyecto_id ),
        materiales_catalogo ( nombre, unidad )
      `)
      .eq("actividades.proyecto_id", proyectoActivo.id)
      .order("created_at", { ascending: false })
      .limit(20)
    asignados = (data ?? []) as unknown as MaterialActividad[]
  }

  return {
    catalogo: (catalogo ?? []) as MaterialCatalogo[],
    asignados,
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
  }
}

export default async function MaterialesPage() {
  const { catalogo, asignados, puedeCrear, todosLosProyectos, proyectoActivoId } = await getData()

  const categorias = Array.from(new Set(catalogo.map((m) => m.categoria ?? "Sin categoría")))
  const bajoStock = catalogo.filter(
    (m) => m.stock_minimo != null && m.stock_actual != null && m.stock_actual <= m.stock_minimo
  )

  return (
    <div>
      <Header
        titulo="Materiales"
        subtitulo={
          catalogo.length === 0
            ? "Catálogo vacío"
            : `${catalogo.length} materiales · ${categorias.length} categorías${bajoStock.length > 0 ? ` · ⚠ ${bajoStock.length} bajo stock mínimo` : ""}`
        }
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo proyectos={todosLosProyectos} proyectoActualId={proyectoActivoId} />
          ) : undefined
        }
      />
      <MaterialesClient catalogoInicial={catalogo} asignados={asignados} puedeCrear={puedeCrear} />
    </div>
  )
}
