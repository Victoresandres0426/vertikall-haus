import type { createClient } from "@/lib/supabase/server"
import { cargarDatosMateriales } from "./datos"
import { formatoPct } from "./comparativo"

type Supabase = Awaited<ReturnType<typeof createClient>>

type AlertaNueva = {
  tipo: "material_sobreconsumo" | "material_compra"
  referencia_id: string
  nivel: "amarillo" | "rojo"
  titulo: string
  que_ocurrio: string
  desviacion_actual: string
  recomendacion: string
  impacto_financiero: number | null
  fecha_limite_accion: string | null
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`

function recortar(s: string, max = 70) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

// Evalúa (y sincroniza en la tabla `alertas`):
//  · Sobreconsumo: material con lo comprado ≥ 90% (amarillo) o > 100% (rojo)
//    de lo presupuestado, por cantidad o por costo.
//  · Compra anticipada: por división, materiales aún sin comprar cuya fecha de
//    compra (inicio de la división - días de anticipación) ya llegó o pasó.
// Es seguro llamarla cada vez que se carga la página de Materiales o se liga un
// gasto: crea las que faltan, actualiza el nivel y resuelve las que ya no aplican.
export async function evaluarAlertasMateriales(
  supabase: Supabase,
  proyectoId: string
): Promise<{ creadas: number; actualizadas: number; resueltas: number }> {
  const resultado = { creadas: 0, actualizadas: 0, resueltas: 0 }
  const datos = await cargarDatosMateriales(supabase, proyectoId)
  if (datos.comparativo.length === 0) return resultado

  const vigentes: AlertaNueva[] = []

  // ── Sobreconsumo ──
  for (const m of datos.comparativo) {
    if (m.estado !== "aviso" && m.estado !== "sobreconsumo") continue
    const sobre = m.estado === "sobreconsumo"
    const partes: string[] = []
    if (m.pct_cantidad !== null) {
      partes.push(
        `${m.comprado_cantidad.toLocaleString("en-US", { maximumFractionDigits: 2 })} de ${m.cantidad_total.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${m.unidad ?? ""} (${formatoPct(m.pct_cantidad)})`
      )
    }
    partes.push(`${money(m.comprado_monto)} de ${money(m.costo_total)} (${formatoPct(m.pct_costo)})`)
    const exceso = Math.max(0, m.comprado_monto - m.costo_total)
    vigentes.push({
      tipo: "material_sobreconsumo",
      referencia_id: m.id,
      nivel: sobre ? "rojo" : "amarillo",
      titulo: `${sobre ? "Sobreconsumo" : "Material cerca del límite"}: ${recortar(m.descripcion)}`,
      que_ocurrio: sobre
        ? `Lo comprado de este material ya supera lo presupuestado en el cómputo de materiales (${m.seccion ?? "sin división"}).`
        : `Lo comprado de este material ya alcanzó el ${formatoPct(m.pct)} de lo presupuestado (${m.seccion ?? "sin división"}).`,
      desviacion_actual: partes.join(" · "),
      recomendacion: sobre
        ? "Revisa si hubo desperdicio, un error de medición o un cambio de alcance antes de comprar más."
        : "Verifica cuánto falta por instalar antes de hacer otra compra de este material.",
      impacto_financiero: sobre ? exceso : null,
      fecha_limite_accion: null,
    })
  }

  // ── Compra anticipada: una alerta por división ──
  const porDivision = new Map<string, typeof datos.compras>()
  for (const c of datos.compras) {
    if (!c.proceso_id) continue
    if (c.estado_compra !== "vencida" && c.estado_compra !== "comprar_ya") continue
    const arr = porDivision.get(c.proceso_id) ?? []
    arr.push(c)
    porDivision.set(c.proceso_id, arr)
  }
  for (const [procesoId, items] of porDivision) {
    const hayVencidos = items.some((i) => i.estado_compra === "vencida")
    const inicio = items.map((i) => i.fecha_inicio).filter(Boolean).sort()[0] ?? null
    const pendiente = items.reduce((s, i) => s + Math.max(0, i.costo_total - i.comprado_monto), 0)
    const nombre = datos.nombreProceso.get(procesoId) ?? "división"
    const fechaCompraMin = items.map((i) => i.fecha_compra).filter(Boolean).sort()[0] ?? null
    vigentes.push({
      tipo: "material_compra",
      referencia_id: procesoId,
      nivel: hayVencidos ? "rojo" : "amarillo",
      titulo: hayVencidos
        ? `Materiales sin comprar y la obra ya inició: ${nombre}`
        : `Hora de comprar materiales: ${nombre}`,
      que_ocurrio: hayVencidos
        ? `La división ${nombre} inició el ${inicio} y aún hay ${items.length} materiales sin comprar.`
        : `La división ${nombre} inicia el ${inicio}. Con los días de anticipación configurados ya toca comprar ${items.length} materiales.`,
      desviacion_actual: `${items.length} materiales pendientes por ${money(pendiente)} aprox. Primera fecha de compra: ${fechaCompraMin}.`,
      recomendacion: "Abre Materiales → Cuándo comprar para ver el detalle y hacer los pedidos.",
      impacto_financiero: pendiente,
      fecha_limite_accion: inicio,
    })
  }

  // ── Sincronizar con las alertas existentes ──
  const { data: existentesRaw } = await supabase
    .from("alertas")
    .select("id, tipo, nivel, referencia_id")
    .eq("proyecto_id", proyectoId)
    .in("tipo", ["material_sobreconsumo", "material_compra"])
    .in("estado", ["activa", "en_revision"])

  const existentes = (existentesRaw ?? []) as { id: string; tipo: string; nivel: string; referencia_id: string | null }[]
  const clave = (tipo: string, ref: string | null) => `${tipo}::${ref}`
  const porClave = new Map(existentes.map((e) => [clave(e.tipo, e.referencia_id), e]))
  const claves = new Set(vigentes.map((v) => clave(v.tipo, v.referencia_id)))

  for (const v of vigentes) {
    const e = porClave.get(clave(v.tipo, v.referencia_id))
    const campos = {
      nivel: v.nivel,
      titulo: v.titulo,
      que_ocurrio: v.que_ocurrio,
      desviacion_actual: v.desviacion_actual,
      recomendacion: v.recomendacion,
      impacto_financiero: v.impacto_financiero,
      fecha_limite_accion: v.fecha_limite_accion,
    }
    if (e) {
      const { error } = await supabase
        .from("alertas")
        .update({ ...campos, updated_at: new Date().toISOString() })
        .eq("id", e.id)
      if (!error) resultado.actualizadas++
    } else {
      const { error } = await supabase.from("alertas").insert({
        proyecto_id: proyectoId,
        tipo: v.tipo,
        referencia_id: v.referencia_id,
        estado: "activa",
        rol_que_decide: "project_manager",
        alternativas: [],
        ...campos,
      })
      if (error) console.error("evaluarAlertasMateriales insert:", error.message)
      else resultado.creadas++
    }
  }

  for (const e of existentes) {
    if (!claves.has(clave(e.tipo, e.referencia_id))) {
      const { error } = await supabase
        .from("alertas")
        .update({ estado: "resuelta", updated_at: new Date().toISOString() })
        .eq("id", e.id)
      if (!error) resultado.resueltas++
    }
  }

  return resultado
}
