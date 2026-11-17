import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

// Un material suele comprarse el mismo día y usarse hasta unos días después.
export const DIAS_VENTANA_USO = 5

type LineaLite = { id: string; descripcion: string; unidad: string | null; cantidad: number | null; tipo_recurso: string }

type Candidata = {
  id: string
  codigo: string
  nombre: string
  division: string | null
  // Fechas (dentro de la ventana) en las que el Reporte Diario muestra trabajo en la actividad
  fechas: string[]
  origen: "reportes" | "cronograma"
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Actividades en las que se trabajó (según los Reportes Diarios) entre la fecha
// de la compra y DIAS_VENTANA_USO días después. Si todavía no hay reportes en
// ese rango, usa las que el cronograma tiene planificadas esos días.
async function actividadesEnVentana(supabase: Supabase, proyectoId: string, fecha: string): Promise<Candidata[]> {
  const desde = fecha
  const hasta = sumarDias(fecha, DIAS_VENTANA_USO)

  const { data: reportes } = await supabase
    .from("reportes_diarios")
    .select("id, fecha")
    .eq("proyecto_id", proyectoId)
    .gte("fecha", desde)
    .lte("fecha", hasta)

  const fechaDeReporte = new Map<string, string>()
  for (const r of (reportes ?? []) as { id: string; fecha: string }[]) fechaDeReporte.set(r.id, r.fecha)

  const fechasPorActividad = new Map<string, Set<string>>()
  const registrar = (actividadId: string, reporteId: string) => {
    const f = fechaDeReporte.get(reporteId)
    if (!f) return
    const set = fechasPorActividad.get(actividadId) ?? new Set<string>()
    set.add(f)
    fechasPorActividad.set(actividadId, set)
  }

  if (fechaDeReporte.size > 0) {
    const ids = Array.from(fechaDeReporte.keys())
    const [{ data: avances }, { data: asistencias }] = await Promise.all([
      supabase.from("avance_diario").select("reporte_id, actividad_id").in("reporte_id", ids),
      supabase.from("asistencia_actividad_diaria").select("reporte_id, actividad_id").in("reporte_id", ids),
    ])
    for (const a of (avances ?? []) as { reporte_id: string; actividad_id: string }[]) registrar(a.actividad_id, a.reporte_id)
    for (const a of (asistencias ?? []) as { reporte_id: string; actividad_id: string }[]) registrar(a.actividad_id, a.reporte_id)
  }

  let origen: Candidata["origen"] = "reportes"
  let idsActividad = Array.from(fechasPorActividad.keys())

  // Sin reportes en la ventana (p. ej. la compra es muy reciente): cronograma
  const fechasPlan = new Map<string, string[]>()
  if (idsActividad.length === 0) {
    origen = "cronograma"
    const { data: plan } = await supabase
      .from("actividades")
      .select("id, fecha_inicio_plan, fecha_fin_plan")
      .eq("proyecto_id", proyectoId)
      .eq("activa", true)
      .not("fecha_inicio_plan", "is", null)
      .lte("fecha_inicio_plan", hasta)
      .gte("fecha_fin_plan", desde)
    for (const a of (plan ?? []) as { id: string; fecha_inicio_plan: string; fecha_fin_plan: string }[]) {
      fechasPlan.set(a.id, [a.fecha_inicio_plan > desde ? a.fecha_inicio_plan : desde])
    }
    idsActividad = Array.from(fechasPlan.keys())
  }
  if (idsActividad.length === 0) return []

  const { data: acts } = await supabase
    .from("actividades")
    .select("id, codigo, nombre, procesos ( codigo, nombre )")
    .in("id", idsActividad)

  type ActRaw = {
    id: string
    codigo: string
    nombre: string
    procesos: { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null
  }
  return ((acts ?? []) as unknown as ActRaw[]).map((a) => {
    const p = Array.isArray(a.procesos) ? a.procesos[0] : a.procesos
    return {
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      division: p ? `${p.codigo} ${p.nombre}` : null,
      fechas: origen === "reportes" ? Array.from(fechasPorActividad.get(a.id) ?? []).sort() : fechasPlan.get(a.id) ?? [],
      origen,
    }
  })
}

type Sugerencia = { linea: number; actividad: number | null; motivo?: string }

async function pedirAIA(fecha: string, lineas: LineaLite[], candidatas: Candidata[]): Promise<Sugerencia[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const listaActs = candidatas
    .map((c, i) => `${i + 1}|${c.codigo}|${c.nombre.slice(0, 90)}|${c.division ?? ""}|${c.origen === "reportes" ? "trabajada" : "planificada"}: ${c.fechas.join(",")}`)
    .join("\n")
  const listaLineas = lineas
    .map((l, i) => `${i + 1}|${l.descripcion.slice(0, 120)}|${l.cantidad ?? ""} ${l.unidad ?? ""}|${l.tipo_recurso}`)
    .join("\n")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system:
          `Eres un asistente de control de costos de obra. Recibes (A) las actividades en las que se trabajó en una obra en los ${DIAS_VENTANA_USO} días siguientes a una compra (número|código|nombre|división|estado: fechas) y (B) las líneas de esa compra (número|descripción|cantidad|tipo). Un material se compra un día y se puede usar hasta ${DIAS_VENTANA_USO} días después, así que busca la actividad donde ese artículo se usaría de forma lógica (por ejemplo, hardboard y plywood para carpintería o forros; cable y cajas para electricidad). Si hay varias actividades razonables, elige la más probable. Si ninguna encaja claramente, usa null: es mejor no sugerir que sugerir mal. Responde ÚNICAMENTE con JSON válido: [{"linea": number, "actividad": number | null, "motivo": "máximo 12 palabras, en español"}]. Fecha de compra: ${fecha}.`,
        messages: [{ role: "user", content: `A) ACTIVIDADES:\n${listaActs}\n\nB) LÍNEAS DE LA COMPRA:\n${listaLineas}` }],
      }),
    })
    if (!respuesta.ok) {
      console.error("sugerirActividades IA:", respuesta.status, (await respuesta.text()).slice(0, 300))
      return null
    }
    const json = await respuesta.json()
    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    let texto = bloques.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim()
    if (texto.startsWith("```")) texto = texto.replace(/^```(json)?/i, "").replace(/```$/, "").trim()
    return JSON.parse(texto) as Sugerencia[]
  } catch (err) {
    console.error("sugerirActividades IA:", err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Propone la actividad de las líneas de una factura que aún no tienen actividad
// ni partida. Solo guarda la sugerencia (no cambia costos). Nunca lanza error.
export async function sugerirActividadesParaFactura(
  supabase: Supabase,
  proyectoId: string,
  facturaId: string
): Promise<number> {
  try {
    const { data: factura } = await supabase.from("facturas_gasto").select("fecha").eq("id", facturaId).single()
    if (!factura?.fecha) return 0

    const { data: lineasRaw } = await supabase
      .from("costos_reales")
      .select("id, descripcion, unidad, cantidad, tipo_recurso")
      .eq("factura_id", facturaId)
      .is("actividad_id", null)
      .is("partida_id", null)
    const lineas = (lineasRaw ?? []) as LineaLite[]
    if (lineas.length === 0) return 0

    const candidatas = await actividadesEnVentana(supabase, proyectoId, factura.fecha)
    if (candidatas.length === 0) return 0

    const resultado = await pedirAIA(factura.fecha, lineas, candidatas)
    if (!resultado) return 0

    let n = 0
    for (const s of resultado) {
      if (s.actividad == null) continue
      const linea = lineas[s.linea - 1]
      const act = candidatas[s.actividad - 1]
      if (!linea || !act) continue
      const detalle = act.origen === "reportes" ? "trabajada" : "planificada"
      const motivo = `${s.motivo?.trim() || "Coincide con el trabajo de esos días"} (${detalle} ${act.fechas[0] ?? ""})`
      const { error } = await supabase
        .from("costos_reales")
        .update({ actividad_sugerida_id: act.id, actividad_sugerida_motivo: motivo })
        .eq("id", linea.id)
      if (!error) n++
    }
    return n
  } catch (err) {
    console.error("sugerirActividadesParaFactura:", err)
    return 0
  }
}
