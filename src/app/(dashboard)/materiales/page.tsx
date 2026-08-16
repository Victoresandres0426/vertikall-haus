import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { MaterialesClient, type MaterialCatalogo, type MaterialActividad } from "./materiales-client"

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

  const [{ data: catalogo }, { data: asignados }] = await Promise.all([
    supabase
      .from("materiales_catalogo")
      .select("id, codigo, nombre, descripcion, unidad, categoria, precio_unitario, stock_actual, stock_minimo")
      .order("categoria")
      .order("nombre"),
    supabase
      .from("materiales_actividad")
      .select(`
        id, cantidad_plan, cantidad_recibida, cantidad_en_transito, costo_unitario,
        material_id,
        actividades ( nombre, codigo ),
        materiales_catalogo ( nombre, unidad )
      `)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  return {
    catalogo: (catalogo ?? []) as MaterialCatalogo[],
    asignados: (asignados ?? []) as unknown as MaterialActividad[],
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
  }
}

export default async function MaterialesPage() {
  const { catalogo, asignados, puedeCrear } = await getData()

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
      />
      <MaterialesClient catalogoInicial={catalogo} asignados={asignados} puedeCrear={puedeCrear} />
    </div>
  )
}
