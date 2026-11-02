import type { createClient } from "@/lib/supabase/server"
import {
  construirComparativo,
  construirCompras,
  type ComparativoMaterial,
  type CompraMaterial,
  type LineaCompra,
  type MaterialPresupuestado,
} from "./comparativo"

type Supabase = Awaited<ReturnType<typeof createClient>>

export type DatosMateriales = {
  hoy: string
  comparativo: ComparativoMaterial[]
  compras: CompraMaterial[]
  nombreProceso: Map<string, string>
  inicioPorProceso: Map<string, string>
  lineasPorConfirmar: number
}

// Carga todo lo necesario para la pestaña Asignación, "Cuándo comprar" y las
// alertas: materiales presupuestados (S2), gastos ya ligados/confirmados y el
// inicio de cada división según el cronograma.
export async function cargarDatosMateriales(supabase: Supabase, proyectoId: string): Promise<DatosMateriales> {
  const [{ data: proyecto }, { data: materialesRaw }, { data: lineasRaw }, { data: actividadesRaw }, { data: procesosRaw }, { count: porConfirmar }] =
    await Promise.all([
      supabase.from("proyectos").select("zona_horaria").eq("id", proyectoId).single(),
      supabase
        .from("materiales_presupuestados")
        .select(
          "id, proceso_id, seccion, codigo, descripcion, unidad, cantidad_neta, desperdicio_pct, cantidad_total, precio_unitario, costo_total, estado_plano, proveedor, dias_anticipacion, orden"
        )
        .eq("proyecto_id", proyectoId)
        .order("orden"),
      supabase
        .from("costos_reales")
        .select("material_presupuestado_id, cantidad, monto, unidad")
        .eq("proyecto_id", proyectoId)
        .not("material_presupuestado_id", "is", null)
        .eq("material_sugerido", false),
      supabase
        .from("actividades")
        .select("proceso_id, fecha_inicio_plan")
        .eq("proyecto_id", proyectoId)
        .eq("activa", true)
        .not("fecha_inicio_plan", "is", null),
      supabase.from("procesos").select("id, codigo, nombre").eq("proyecto_id", proyectoId),
      supabase
        .from("costos_reales")
        .select("id", { count: "exact", head: true })
        .eq("proyecto_id", proyectoId)
        .eq("material_sugerido", true),
    ])

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: proyecto?.zona_horaria || "America/New_York" })

  const materiales = ((materialesRaw ?? []) as Record<string, unknown>[]).map((m) => ({
    ...m,
    cantidad_neta: Number(m.cantidad_neta ?? 0),
    desperdicio_pct: Number(m.desperdicio_pct ?? 0),
    cantidad_total: Number(m.cantidad_total ?? 0),
    precio_unitario: Number(m.precio_unitario ?? 0),
    costo_total: Number(m.costo_total ?? 0),
    dias_anticipacion: Number(m.dias_anticipacion ?? 7),
    orden: Number(m.orden ?? 0),
  })) as unknown as MaterialPresupuestado[]

  const lineas: LineaCompra[] = ((lineasRaw ?? []) as Record<string, unknown>[]).map((l) => ({
    material_presupuestado_id: l.material_presupuestado_id as string,
    cantidad: l.cantidad == null ? null : Number(l.cantidad),
    monto: Number(l.monto ?? 0),
    unidad: (l.unidad as string | null) ?? null,
  }))

  const inicioPorProceso = new Map<string, string>()
  for (const a of (actividadesRaw ?? []) as { proceso_id: string; fecha_inicio_plan: string }[]) {
    const actual = inicioPorProceso.get(a.proceso_id)
    if (!actual || a.fecha_inicio_plan < actual) inicioPorProceso.set(a.proceso_id, a.fecha_inicio_plan)
  }

  const nombreProceso = new Map<string, string>()
  for (const p of (procesosRaw ?? []) as { id: string; codigo: string; nombre: string }[]) {
    nombreProceso.set(p.id, `${p.codigo} — ${p.nombre}`)
  }

  const comparativo = construirComparativo(materiales, lineas)
  const compras = construirCompras(comparativo, inicioPorProceso, hoy)

  return { hoy, comparativo, compras, nombreProceso, inicioPorProceso, lineasPorConfirmar: porConfirmar ?? 0 }
}
