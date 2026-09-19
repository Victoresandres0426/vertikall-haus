import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { MaterialesClient, type MaterialCatalogo, type MaterialActividad } from "./materiales-client"
import type { FacturaGasto, ActividadOpcion, PartidaOpcion } from "./gastos-client"
import { getProyectoActivoId, resolverProyectoActivo } from "@/lib/proyecto-activo"

// El análisis de la foto del recibo con IA (gastos-actions.ts) puede tardar
// más que el límite por defecto de las funciones de Vercel -- esto le da
// más margen a las acciones de esta página (subir foto y luego analizar).
export const maxDuration = 60

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
  let facturas: FacturaGasto[] = []
  let actividadesOpciones: ActividadOpcion[] = []
  let partidasIndirectasOpciones: PartidaOpcion[] = []
  if (proyectoActivo) {
    const [{ data }, { data: facturasRaw }, { data: lineasRaw }, { data: actividadesRaw }, { data: presupuestoActivo }] = await Promise.all([
      supabase
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
        .limit(20),
      supabase
        .from("facturas_gasto")
        .select("id, fecha, lugar, referencia, foto_referencia, subtotal, tax_total, total, estado_analisis")
        .eq("proyecto_id", proyectoActivo.id)
        .order("fecha", { ascending: false }),
      supabase
        .from("costos_reales")
        .select("id, factura_id, actividad_id, partida_id, tipo_recurso, descripcion, unidad, cantidad, precio_unitario, tax, monto, actividades ( codigo, nombre )")
        .eq("proyecto_id", proyectoActivo.id)
        .not("factura_id", "is", null),
      supabase
        .from("actividades")
        .select("id, codigo, nombre")
        .eq("proyecto_id", proyectoActivo.id)
        .eq("activa", true)
        .order("codigo"),
      supabase
        .from("presupuestos")
        .select("id, partidas:partidas_presupuesto ( id, codigo, descripcion, actividad_id )")
        .eq("proyecto_id", proyectoActivo.id)
        .eq("es_baseline_actual", true)
        .maybeSingle(),
    ])
    asignados = (data ?? []) as unknown as MaterialActividad[]
    const partidasBaseline = (presupuestoActivo as unknown as { partidas: PartidaOpcion[] } | null)?.partidas ?? []
    partidasIndirectasOpciones = partidasBaseline.filter((p) => !p.actividad_id)

    const lineasPorFactura = new Map<string, unknown[]>()
    for (const l of (lineasRaw ?? []) as { factura_id: string }[]) {
      const arr = lineasPorFactura.get(l.factura_id) ?? []
      arr.push(l)
      lineasPorFactura.set(l.factura_id, arr)
    }
    const facturasBase = (facturasRaw ?? []) as unknown as Omit<FacturaGasto, "lineas" | "foto_url">[]

    // foto_referencia puede ser una ruta real de Storage ("{proyecto}/{uuid}.jpg",
    // subida por el análisis con IA) o una nota de texto libre de cuando el
    // campo era manual -- intentamos firmar la URL y si falla, la tratamos
    // como nota de texto simple (no rompe nada, solo no se muestra imagen).
    const fotosFirmadas = new Map<string, string>()
    await Promise.all(
      facturasBase
        .filter((f) => f.foto_referencia && f.foto_referencia.includes("/"))
        .map(async (f) => {
          const { data: firmada } = await supabase.storage
            .from("recibos")
            .createSignedUrl(f.foto_referencia as string, 3600)
          if (firmada?.signedUrl) fotosFirmadas.set(f.id, firmada.signedUrl)
        })
    )

    facturas = facturasBase.map((f) => ({
      ...f,
      lineas: (lineasPorFactura.get(f.id) ?? []) as FacturaGasto["lineas"],
      foto_url: fotosFirmadas.get(f.id) ?? null,
    }))
    actividadesOpciones = (actividadesRaw ?? []) as ActividadOpcion[]
  }

  return {
    catalogo: (catalogo ?? []) as MaterialCatalogo[],
    asignados,
    facturas,
    actividadesOpciones,
    partidasIndirectasOpciones,
    puedeCrear: !!perfil && ROLES_GESTION.includes(perfil.rol),
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
  }
}

export default async function MaterialesPage() {
  const { catalogo, asignados, facturas, actividadesOpciones, partidasIndirectasOpciones, puedeCrear, todosLosProyectos, proyectoActivoId } = await getData()

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
      <MaterialesClient
        catalogoInicial={catalogo}
        asignados={asignados}
        puedeCrear={puedeCrear}
        facturasIniciales={facturas}
        actividadesOpciones={actividadesOpciones}
        partidasIndirectasOpciones={partidasIndirectasOpciones}
        proyectoActivoId={proyectoActivoId}
      />
    </div>
  )
}
