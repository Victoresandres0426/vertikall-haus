// Traducción automática (lazy + cacheada) de la bitácora de obra.
//
// Cada nota se guarda tal cual la escribió su autor. Esta función se
// llama desde CUALQUIER pantalla que lea la bitácora (dashboard interno
// en español, o portal en el idioma que tenga el lector) para procesar
// -- una sola vez por nota, la primera vez que alguien la lee -- las
// que todavía no tienen idioma_detectado: se le pide a la IA que
// detecte en qué idioma está escrita y la traduzca al otro idioma, y se
// cachea el resultado en la base (migración 125) para que ningún lector
// futuro (en ninguno de los dos idiomas) tenga que esperar de nuevo.
//
// Si falla (sin API key, IA no responde, etc.) se ignora en silencio y
// la nota se sigue mostrando tal cual se escribió -- nunca bloquea la
// página, mismo criterio que traducirReportesFaltantes.

import type { createClient } from "@/lib/supabase/server"

export type EntradaBitacoraTraducible = {
  id: string
  nota: string | null
  idioma_detectado?: "es" | "en" | null
  nota_traducida?: string | null
}

export async function traducirBitacoraFaltantes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entradas: EntradaBitacoraTraducible[]
): Promise<void> {
  const faltantes = entradas.filter((e) => e.nota && e.nota.trim() && !e.idioma_detectado)
  if (faltantes.length === 0) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return

  try {
    const lista = faltantes.map((e) => ({ id: e.id, nota: e.nota }))
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8192,
        system: `Eres un traductor de notas de bitácora de obra de construcción. Recibes un array JSON de objetos {id, nota}. Para cada nota: (1) detecta si el idioma en el que está escrita es español o inglés, (2) tradúcela al idioma contrario (si detectas español, traduce al inglés; si detectas inglés, traduce al español), con el tono profesional y directo que usaría un contratista general. Devuelve ÚNICAMENTE un JSON válido (sin texto antes ni después, sin markdown), con esta forma exacta: { "traducciones": [ { "id": string, "idioma_detectado": "es" | "en", "nota_traducida": string } ] }. Debes devolver una entrada por cada "id" recibido.`,
        messages: [{ role: "user", content: JSON.stringify(lista) }],
      }),
    })
    if (!respuesta.ok) return

    const json = await respuesta.json()
    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    const texto = bloques.find((b) => b.type === "text")?.text ?? ""
    let parsed: { traducciones?: { id: string; idioma_detectado: "es" | "en"; nota_traducida: string }[] }
    try {
      parsed = JSON.parse(texto)
    } catch {
      const match = texto.match(/\{[\s\S]*\}/)
      if (!match) return
      parsed = JSON.parse(match[0])
    }

    for (const t of parsed.traducciones ?? []) {
      const entrada = faltantes.find((e) => e.id === t.id)
      if (!entrada || !t.idioma_detectado || !t.nota_traducida) continue
      // Actualiza el objeto en memoria para que esta misma visita ya
      // muestre la versión correcta, sin esperar a la próxima carga.
      entrada.idioma_detectado = t.idioma_detectado
      entrada.nota_traducida = t.nota_traducida
      // Fire-and-forget: cachea en la base, no bloquea el render.
      supabase.rpc("guardar_traduccion_bitacora", {
        p_id: t.id,
        p_idioma_detectado: t.idioma_detectado,
        p_nota_traducida: t.nota_traducida,
      }).then(() => {})
    }
  } catch (e) {
    console.error("traducirBitacoraFaltantes falló:", e)
  }
}

// Decide qué texto mostrar para una nota, según el idioma del lector.
// Si aún no se detectó el idioma original, o el lector pide el mismo
// idioma en el que se escribió, se muestra el original tal cual.
export function textoBitacoraParaIdioma(
  entrada: EntradaBitacoraTraducible,
  idiomaLector: "es" | "en"
): string | null {
  if (!entrada.nota) return null
  if (!entrada.idioma_detectado || entrada.idioma_detectado === idiomaLector) return entrada.nota
  return entrada.nota_traducida ?? entrada.nota
}
