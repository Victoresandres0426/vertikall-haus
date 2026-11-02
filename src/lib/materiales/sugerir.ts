import type { createClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createClient>>

type MaterialLite = { id: string; codigo: string | null; descripcion: string; unidad: string | null; seccion: string | null }
type LineaLite = { id: string; descripcion: string; unidad: string | null; cantidad: number | null }

const STOP = new Set([
  "de", "del", "la", "el", "los", "las", "para", "con", "sin", "por", "en", "y", "o", "the", "and", "for", "with",
  "pcs", "pza", "ea", "each", "ct", "pk",
])

function normalizar(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9x/.\-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP.has(t))
}

// Respaldo sin IA: coincidencia por palabras en común (coseno). Solo propone
// cuando hay un ganador claro.
function sugerirPorPalabras(lineas: LineaLite[], materiales: MaterialLite[]): Map<string, string> {
  const resultado = new Map<string, string>()
  const tokensMat = materiales.map((m) => new Set(normalizar(m.descripcion)))
  for (const l of lineas) {
    const tl = new Set(normalizar(l.descripcion))
    if (tl.size === 0) continue
    let mejor = -1
    let mejorScore = 0
    let segundo = 0
    tokensMat.forEach((tm, idx) => {
      if (tm.size === 0) return
      let comunes = 0
      tl.forEach((t) => { if (tm.has(t)) comunes++ })
      if (comunes < 2) return
      const score = comunes / Math.sqrt(tl.size * tm.size)
      if (score > mejorScore) {
        segundo = mejorScore
        mejorScore = score
        mejor = idx
      } else if (score > segundo) {
        segundo = score
      }
    })
    if (mejor >= 0 && mejorScore >= 0.5 && mejorScore - segundo >= 0.1) {
      resultado.set(l.id, materiales[mejor].id)
    }
  }
  return resultado
}

async function sugerirConIA(lineas: LineaLite[], materiales: MaterialLite[]): Promise<Map<string, string> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const listaMateriales = materiales
    .map((m, i) => `${i + 1}|${m.seccion ?? ""}|${m.descripcion.slice(0, 90)}|${m.unidad ?? ""}`)
    .join("\n")
  const listaLineas = lineas
    .map((l, i) => `${i + 1}|${l.descripcion.slice(0, 120)}|${l.cantidad ?? ""} ${l.unidad ?? ""}`)
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
          "Eres un asistente de control de materiales de construcción. Recibes (A) la lista de materiales presupuestados de una obra (número|división|descripción|unidad) y (B) las líneas de una compra (número|descripción|cantidad). Para cada línea de compra, indica a qué material presupuestado corresponde, aunque el idioma o el nivel de detalle sea distinto (la compra puede estar en inglés y abreviada). Si no hay una coincidencia razonable, usa null. No inventes coincidencias dudosas. Responde ÚNICAMENTE con JSON válido: [{\"linea\": number, \"material\": number | null}].",
        messages: [
          { role: "user", content: `A) MATERIALES PRESUPUESTADOS:\n${listaMateriales}\n\nB) LÍNEAS DE LA COMPRA:\n${listaLineas}` },
        ],
      }),
    })
    if (!respuesta.ok) {
      console.error("sugerirConIA:", respuesta.status, (await respuesta.text()).slice(0, 300))
      return null
    }
    const json = await respuesta.json()
    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    let texto = bloques.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim()
    if (texto.startsWith("```")) texto = texto.replace(/^```(json)?/i, "").replace(/```$/, "").trim()
    const parsed = JSON.parse(texto) as { linea: number; material: number | null }[]
    const resultado = new Map<string, string>()
    for (const p of parsed) {
      if (!p || p.material == null) continue
      const linea = lineas[p.linea - 1]
      const material = materiales[p.material - 1]
      if (linea && material) resultado.set(linea.id, material.id)
    }
    return resultado
  } catch (err) {
    console.error("sugerirConIA:", err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Propone, para las líneas de una factura que aún no tienen material
// presupuestado, el material al que probablemente corresponden. Se guardan
// como "sugeridas" (material_sugerido = true): no cuentan en la comparación
// hasta que el usuario las confirme. Nunca lanza error (es una ayuda).
export async function sugerirMaterialesParaFactura(
  supabase: Supabase,
  proyectoId: string,
  facturaId: string
): Promise<number> {
  try {
    const [{ data: lineasRaw }, { data: materialesRaw }] = await Promise.all([
      supabase
        .from("costos_reales")
        .select("id, descripcion, unidad, cantidad")
        .eq("factura_id", facturaId)
        .eq("tipo_recurso", "material")
        .is("material_presupuestado_id", null),
      supabase
        .from("materiales_presupuestados")
        .select("id, codigo, descripcion, unidad, seccion")
        .eq("proyecto_id", proyectoId)
        .order("orden"),
    ])
    const lineas = (lineasRaw ?? []) as LineaLite[]
    const materiales = (materialesRaw ?? []) as MaterialLite[]
    if (lineas.length === 0 || materiales.length === 0) return 0

    const sugeridas = (await sugerirConIA(lineas, materiales)) ?? sugerirPorPalabras(lineas, materiales)

    let n = 0
    for (const [lineaId, materialId] of sugeridas) {
      const { error } = await supabase
        .from("costos_reales")
        .update({ material_presupuestado_id: materialId, material_sugerido: true })
        .eq("id", lineaId)
      if (!error) n++
    }
    return n
  } catch (err) {
    console.error("sugerirMaterialesParaFactura:", err)
    return 0
  }
}
