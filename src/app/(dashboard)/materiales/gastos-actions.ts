"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const ROLES_GESTION = ["project_manager", "administrador", "dueno", "superadmin"]

async function verificarAcceso(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "No autenticado" }

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { ok: false as const, error: "No tienes permisos para registrar gastos" }
  }
  return { ok: true as const, userId: user.id }
}

export type LineaGastoInput = {
  actividadId: string | null
  tipoRecurso: "material" | "equipo" | "subcontrato" | "indirecto"
  descripcion: string
  unidad: string | null
  cantidad: number
  precioUnitario: number
  tax: number
}

export type FacturaGastoInput = {
  proyectoId: string
  fecha: string
  lugar: string
  referencia: string | null
  fotoReferencia: string | null
  lineas: LineaGastoInput[]
}

// Registra una factura/recibo completo -- crea la cabecera (facturas_gasto)
// y una fila en costos_reales por cada línea, cada una ya asignada a su
// actividad. costos_reales es la misma tabla que usa la mano de obra
// (migración 050) y ya está conectada por trigger a actividades.costo_real
// (migración 057) -- no hace falta actualizar nada más a mano, el costo
// real de cada actividad se recalcula solo.
export async function crearFacturaGasto(input: FacturaGastoInput): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.fecha) return { error: "La fecha es obligatoria" }
  if (!input.lugar?.trim()) return { error: "El lugar de compra es obligatorio" }
  if (input.lineas.length === 0) return { error: "Agrega al menos un artículo o servicio" }

  for (const l of input.lineas) {
    if (!l.descripcion?.trim()) return { error: "Cada línea necesita una descripción" }
    if (!l.actividadId) return { error: "Cada línea debe asignarse a una actividad" }
  }

  const subtotal = input.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)
  const taxTotal = input.lineas.reduce((s, l) => s + (l.tax || 0), 0)
  const total = subtotal + taxTotal

  const { data: factura, error: errFactura } = await supabase
    .from("facturas_gasto")
    .insert({
      proyecto_id: input.proyectoId,
      fecha: input.fecha,
      lugar: input.lugar.trim(),
      referencia: input.referencia?.trim() || null,
      foto_referencia: input.fotoReferencia?.trim() || null,
      subtotal,
      tax_total: taxTotal,
      total,
      creado_por: acceso.userId,
    })
    .select("id")
    .single()

  if (errFactura || !factura) {
    console.error("crearFacturaGasto - factura:", errFactura)
    return { error: "No se pudo guardar la factura." }
  }

  const { error: errLineas } = await supabase.from("costos_reales").insert(
    input.lineas.map((l) => ({
      proyecto_id: input.proyectoId,
      actividad_id: l.actividadId,
      tipo_recurso: l.tipoRecurso,
      descripcion: l.descripcion.trim(),
      fecha: input.fecha,
      monto: l.cantidad * l.precioUnitario + (l.tax || 0),
      referencia: input.referencia?.trim() || null,
      unidad: l.unidad?.trim() || null,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
      tax: l.tax || 0,
      factura_id: factura.id,
      aprobado: true,
    }))
  )

  if (errLineas) {
    console.error("crearFacturaGasto - lineas:", errLineas)
    // La factura ya quedó guardada -- se borra para no dejar una cabecera
    // huérfana sin ninguna línea (mejor que el usuario reintente limpio).
    await supabase.from("facturas_gasto").delete().eq("id", factura.id)
    return { error: "No se pudieron guardar los artículos de la factura." }
  }

  revalidatePath("/materiales")
  revalidatePath("/actividades")
  revalidatePath("/presupuesto")
  revalidatePath("/dashboard")
  revalidatePath("/proyectos")
  revalidatePath("/alertas")

  return { id: factura.id }
}

// ── Análisis de la foto del recibo con IA ───────────────────────
// Mismo patrón que src/app/(dashboard)/proyectos/importar/actions.ts
// (fetch directo a la API de Anthropic con la misma ANTHROPIC_API_KEY
// ya configurada) pero mandando la imagen como bloque "image" en vez
// de texto. La IA solo extrae los datos -- nunca sabe a qué actividad
// asignar cada línea, eso lo hace el usuario a mano en el modal.

export type LineaExtraida = {
  descripcion: string
  unidad: string | null
  cantidad: number
  precioUnitario: number
  tax: number
}

export type ReciboExtraido = {
  lugar: string | null
  fecha: string | null // YYYY-MM-DD
  referencia: string | null
  lineas: LineaExtraida[]
}

const PROMPT_SISTEMA_RECIBO = `Eres un asistente que extrae datos estructurados de fotos de recibos o facturas de compras de materiales o servicios de construcción (Home Depot, Lowe's, proveedores locales, subcontratistas, etc.), sin importar el idioma o formato del recibo.

Identifica:
1. El lugar/comercio donde se hizo la compra (nombre del negocio, y sucursal si aparece).
2. La fecha de la compra (formato YYYY-MM-DD). Si no se ve claramente, usa null.
3. Un número de referencia, folio o ticket si aparece impreso.
4. Cada artículo o servicio individual de la lista, con: descripción (tal cual aparece o una versión legible si está abreviada), unidad de medida si se puede inferir (texto corto: pza, ft, gal, caja, etc. -- si no hay forma de saberlo usa null), cantidad, precio unitario, y el impuesto (tax) que le corresponde a esa línea específica.

Si el recibo trae un solo monto de tax total (no desglosado por línea), repártelo proporcionalmente entre las líneas según su subtotal (cantidad × precio unitario), igual que haría un contador. Si una línea no tiene tax, usa 0.

Responde ÚNICAMENTE con un JSON válido (sin texto antes ni después, sin markdown, sin \`\`\`), con esta forma exacta:

{
  "lugar": string | null,
  "fecha": string | null,
  "referencia": string | null,
  "lineas": [
    { "descripcion": string, "unidad": string | null, "cantidad": number, "precioUnitario": number, "tax": number }
  ]
}

Si la imagen no es un recibo legible o no se distingue ningún artículo, devuelve "lineas": [] y deja los demás campos en null.`

export async function analizarReciboFoto(
  formData: FormData,
  proyectoId: string
): Promise<{ data?: ReciboExtraido; rutaFoto?: string; error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { error: "El análisis con IA aún no está configurado (falta la clave de Anthropic)." }
  }

  const file = formData.get("foto") as File | null
  if (!file) return { error: "No se recibió ninguna foto" }

  const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/gif"]
  if (!tiposPermitidos.includes(file.type)) {
    return { error: "Formato de imagen no soportado. Usa JPG, PNG o WEBP." }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "La imagen es demasiado grande (máximo 10MB)." }
  }

  let arrayBuffer: ArrayBuffer
  let base64: string
  try {
    arrayBuffer = await file.arrayBuffer()
    base64 = Buffer.from(arrayBuffer).toString("base64")
  } catch (err) {
    console.error("analizarReciboFoto - lectura imagen:", err)
    return { error: "No se pudo leer la imagen." }
  }

  const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif"

  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: PROMPT_SISTEMA_RECIBO,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: "Analiza este recibo/factura y extrae los datos según el formato indicado." },
            ],
          },
        ],
      }),
    })

    if (!respuesta.ok) {
      const textoError = await respuesta.text()
      console.error("Error de Anthropic API (recibo):", respuesta.status, textoError)
      return { error: `Error al analizar la foto con IA (código ${respuesta.status}).` }
    }

    const json = await respuesta.json()

    if (json?.type === "error" || !json?.content) {
      console.error(`Anthropic sin contenido (recibo) | status=${respuesta.status} | body=${JSON.stringify(json).slice(0, 800)}`)
      return { error: "La IA no pudo procesar la foto. Intenta de nuevo." }
    }

    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    const textoRespuesta: string = bloques
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n")

    let limpio = textoRespuesta.trim()
    if (limpio.startsWith("```")) {
      limpio = limpio.replace(/^```(json)?/i, "").replace(/```$/, "").trim()
    }

    let parsed: ReciboExtraido
    try {
      parsed = JSON.parse(limpio)
    } catch (err) {
      console.error(
        `Error parseando JSON de la IA (recibo) | texto_preview=${JSON.stringify(limpio.slice(0, 500))} | err=${String(err)}`
      )
      return { error: "La IA no devolvió un resultado válido. Puedes llenar los datos a mano." }
    }

    if (!parsed || !Array.isArray(parsed.lineas)) {
      return { error: "No se pudo extraer información reconocible de la foto." }
    }

    // Subimos la foto al bucket privado "recibos" bajo {proyecto_id}/{uuid}.{ext}.
    // Si esto falla no abortamos la extracción -- el usuario puede seguir sin
    // la foto archivada y guardar la factura igual.
    let rutaFoto: string | undefined
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
    const ruta = `${proyectoId}/${crypto.randomUUID()}.${ext}`
    const { error: errSubida } = await supabase.storage.from("recibos").upload(ruta, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })
    if (errSubida) {
      console.error("analizarReciboFoto - subida a storage:", errSubida)
    } else {
      rutaFoto = ruta
    }

    return { data: parsed, rutaFoto }
  } catch (err) {
    console.error("Error llamando a Anthropic (recibo):", err)
    return { error: "Error de conexión al analizar la foto con IA." }
  }
}

export async function eliminarFacturaGasto(facturaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  // ON DELETE SET NULL en costos_reales.factura_id -- borrar la factura no
  // borra los costos reales ya contados en cada actividad, solo desvincula
  // la referencia a la factura. Para quitar también el costo hay que borrar
  // las líneas primero.
  const { error: errLineas } = await supabase.from("costos_reales").delete().eq("factura_id", facturaId)
  if (errLineas) {
    console.error("eliminarFacturaGasto - lineas:", errLineas)
    return { error: "No se pudieron borrar los artículos de la factura." }
  }

  const { error } = await supabase.from("facturas_gasto").delete().eq("id", facturaId)
  if (error) {
    console.error("eliminarFacturaGasto:", error)
    return { error: "No se pudo borrar la factura." }
  }

  revalidatePath("/materiales")
  revalidatePath("/actividades")
  revalidatePath("/presupuesto")
  revalidatePath("/dashboard")
  revalidatePath("/proyectos")
  revalidatePath("/alertas")

  return {}
}
