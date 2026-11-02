import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import { SelectorProyectoActivo } from "@/components/layout/selector-proyecto-activo"
import { MaterialesClient } from "./materiales-client"
import type { FacturaGasto, ActividadOpcion, PartidaOpcion, MaterialOpcion } from "./gastos-client"
import { cargarDatosMateriales, type DatosMateriales } from "@/lib/materiales/datos"
import { evaluarAlertasMateriales } from "@/lib/materiales/alertas"
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

  const puedeCrear = !!perfil && ROLES_GESTION.includes(perfil.rol)

  let datosMateriales: DatosMateriales | null = null
  let materialesOpciones: MaterialOpcion[] = []
  let facturas: FacturaGasto[] = []
  let actividadesOpciones: ActividadOpcion[] = []
  let partidasIndirectasOpciones: PartidaOpcion[] = []
  if (proyectoActivo) {
    // Mantiene al día las alertas de sobreconsumo / compra anticipada cada vez
    // que se abre la página (solo quien gestiona; nunca debe tumbar la página).
    if (puedeCrear) {
      try {
        await evaluarAlertasMateriales(supabase, proyectoActivo.id)
      } catch (err) {
        console.error("evaluarAlertasMateriales:", err)
      }
    }
    datosMateriales = await cargarDatosMateriales(supabase, proyectoActivo.id)
    materialesOpciones = datosMateriales.comparativo.map((m) => ({
      id: m.id,
      descripcion: m.descripcion,
      unidad: m.unidad,
      seccion: m.proceso_id ? datosMateriales?.nombreProceso.get(m.proceso_id) ?? m.seccion : m.seccion,
    }))

    const [{ data: facturasRaw }, { data: lineasRaw }, { data: actividadesRaw }, { data: presupuestoActivo }] = await Promise.all([
      supabase
        .from("facturas_gasto")
        .select("id, fecha, lugar, referencia, foto_referencia, subtotal, tax_total, total, estado_analisis, posible_duplicado_nota")
        .eq("proyecto_id", proyectoActivo.id)
        .order("fecha", { ascending: false }),
      supabase
        .from("costos_reales")
        .select("id, factura_id, actividad_id, partida_id, material_presupuestado_id, material_sugerido, tipo_recurso, descripcion, unidad, cantidad, precio_unitario, tax, monto, actividades ( codigo, nombre )")
        .eq("proyecto_id", proyectoActivo.id)
        .not("factura_id", "is", null),
      supabase
        .from("actividades")
        .select("id, codigo, nombre, proceso_id, procesos ( codigo, nombre, orden )")
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
    // Se ordena en memoria por división (proceso.orden) -- Supabase no
    // soporta bien "order by" sobre una columna de una tabla relacionada
    // anidada. Así el selector de "asignar a actividad" en Gastos queda
    // agrupado igual que en la página de Actividades, en vez de una
    // lista plana donde actividades de nombre parecido en divisiones
    // distintas se prestan a confusión.
    type ActOpcionRaw = ActividadOpcion & {
      procesos: { codigo: string; nombre: string; orden: number } | { codigo: string; nombre: string; orden: number }[] | null
    }
    try {
      actividadesOpciones = ((actividadesRaw ?? []) as unknown as ActOpcionRaw[])
        .sort((a, b) => {
          const procA = Array.isArray(a.procesos) ? a.procesos[0] : a.procesos
          const procB = Array.isArray(b.procesos) ? b.procesos[0] : b.procesos
          const oa = procA?.orden ?? 999
          const ob = procB?.orden ?? 999
          if (oa !== ob) return oa - ob
          return (a.codigo ?? "").localeCompare(b.codigo ?? "")
        })
        .map((a) => {
          const proc = Array.isArray(a.procesos) ? a.procesos[0] : a.procesos
          return {
            id: a.id,
            codigo: a.codigo,
            nombre: a.nombre,
            proceso_codigo: proc?.codigo ?? null,
            proceso_nombre: proc?.nombre ?? null,
          }
        })
    } catch {
      // Si algo inesperado en la forma de los datos rompe el agrupado,
      // no debe tumbar la página de Materiales -- se cae de vuelta a la
      // lista plana sin división.
      actividadesOpciones = (actividadesRaw ?? []) as unknown as ActividadOpcion[]
    }
  }

  return {
    datosMateriales,
    materialesOpciones,
    facturas,
    actividadesOpciones,
    partidasIndirectasOpciones,
    puedeCrear,
    todosLosProyectos,
    proyectoActivoId: proyectoActivo?.id ?? null,
  }
}

export default async function MaterialesPage() {
  const { datosMateriales, materialesOpciones, facturas, actividadesOpciones, partidasIndirectasOpciones, puedeCrear, todosLosProyectos, proyectoActivoId } = await getData()

  const comparativo = datosMateriales?.comparativo ?? []
  const compras = datosMateriales?.compras ?? []
  const sobre = comparativo.filter((m) => m.estado === "sobreconsumo").length
  const aviso = comparativo.filter((m) => m.estado === "aviso").length
  const porComprar = compras.filter((c) => c.estado_compra === "vencida" || c.estado_compra === "comprar_ya").length
  const partesSubtitulo = [
    comparativo.length === 0 ? "Sin materiales presupuestados" : `${comparativo.length} materiales presupuestados`,
    sobre > 0 ? `⚠ ${sobre} con sobreconsumo` : null,
    aviso > 0 ? `${aviso} cerca del límite` : null,
    porComprar > 0 ? `${porComprar} por comprar` : null,
  ].filter(Boolean)

  return (
    <div>
      <Header
        titulo="Materiales"
        subtitulo={partesSubtitulo.join(" · ")}
        acciones={
          todosLosProyectos.length > 0 ? (
            <SelectorProyectoActivo proyectos={todosLosProyectos} proyectoActualId={proyectoActivoId} />
          ) : undefined
        }
      />
      <MaterialesClient
        comparativo={comparativo}
        compras={compras}
        nombreProceso={Object.fromEntries(datosMateriales?.nombreProceso ?? [])}
        lineasPorConfirmar={datosMateriales?.lineasPorConfirmar ?? 0}
        hoy={datosMateriales?.hoy ?? new Date().toISOString().slice(0, 10)}
        puedeCrear={puedeCrear}
        facturasIniciales={facturas}
        actividadesOpciones={actividadesOpciones}
        partidasIndirectasOpciones={partidasIndirectasOpciones}
        materialesOpciones={materialesOpciones}
        proyectoActivoId={proyectoActivoId}
      />
    </div>
  )
}
