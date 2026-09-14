"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

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

function revalidarTodo() {
  revalidatePath("/materiales")
  revalidatePath("/actividades")
  revalidatePath("/presupuesto")
  revalidatePath("/dashboard")
  revalidatePath("/proyectos")
  revalidatePath("/alertas")
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

// Registra una factura/recibo completo llenado a mano -- crea la cabecera
// (facturas_gasto) y una fila en costos_reales por cada línea. La actividad
// de cada línea es OPCIONAL: se puede guardar sin asignarla y completarla
// después (ver asignarActividadLinea) -- en obra casi nunca hay tiempo de
// clasificar cada artículo en el momento de la compra.
export async function crearFacturaGasto(input: FacturaGastoInput): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  if (!input.fecha) return { error: "La fecha es obligatoria" }
  if (!input.lugar?.trim()) return { error: "El lugar de compra es obligatorio" }
  if (input.lineas.length === 0) return { error: "Agrega al menos un artículo o servicio" }

  for (const l of input.lineas) {
    if (!l.descripcion?.trim()) return { error: "Cada línea necesita una descripción" }
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
      estado_analisis: "manual",
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
      actividad_id: l.actividadId || null,
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
    // huérfana sin ningún artículo (mejor que el usuario reintente limpio).
    await supabase.from("facturas_gasto").delete().eq("id", factura.id)
    return { error: "No se pudieron guardar los artículos de la factura." }
  }

  revalidarTodo()
  return { id: factura.id }
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

  revalidarTodo()
  return {}
}

// Asigna (o quita) la actividad de una línea ya guardada -- esto es lo que
// permite completar después una factura que se guardó sin clasificar, sin
// importar si se creó a mano o por análisis de IA.
export async function asignarActividadLinea(lineaId: string, actividadId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { error } = await supabase
    .from("costos_reales")
    .update({ actividad_id: actividadId })
    .eq("id", lineaId)

  if (error) {
    console.error("asignarActividadLinea:", error)
    return { error: "No se pudo asignar la actividad." }
  }

  revalidarTodo()
  return {}
}

// ── Análisis de la foto del recibo con IA, en segundo plano ─────
// Mismo patrón que src/app/(dashboard)/proyectos/importar/actions.ts
// (fetch directo a la API de Anthropic con la misma ANTHROPIC_API_KEY ya
// configurada) pero mandando la imagen como bloque "image" en vez de texto.
//
// A diferencia de la primera versión, esto ya NO bloquea al usuario
// mientras la IA trabaja: crearFacturaBorradorConFoto sube la foto y crea
// la factura al instante (unos segundos), y programa el análisis con
// after() de Next.js para que siga corriendo en el servidor después de
// responder -- el usuario puede cerrar la app y seguir con su día, y
// cuando vuelva a abrir Gastos la factura ya va a tener sus líneas
// (o un aviso de error con opción de reintentar).

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

async function llamarAnthropicRecibo(base64: string, mediaType: string): Promise<ReciboExtraido> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")

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
    throw new Error(`Anthropic respondió ${respuesta.status}`)
  }

  const json = await respuesta.json()
  if (json?.type === "error" || !json?.content) {
    console.error(`Anthropic sin contenido (recibo) | body=${JSON.stringify(json).slice(0, 800)}`)
    throw new Error("Anthropic sin contenido")
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

  const parsed = JSON.parse(limpio) as ReciboExtraido
  if (!parsed || !Array.isArray(parsed.lineas)) throw new Error("JSON de la IA sin forma esperada")
  return parsed
}

// Aplica el resultado de la IA a una factura ya creada: actualiza la
// cabecera y agrega las líneas (sin actividad asignada -- eso lo hace el
// usuario a mano, la IA no puede saberlo). Se usa tanto desde el análisis
// en segundo plano como desde el reintento manual.
async function aplicarAnalisisAFactura(
  supabase: Awaited<ReturnType<typeof createClient>>,
  facturaId: string,
  proyectoId: string,
  fechaOriginal: string,
  base64: string,
  mediaType: string
) {
  try {
    const datos = await llamarAnthropicRecibo(base64, mediaType)

    await supabase
      .from("facturas_gasto")
      .update({
        lugar: datos.lugar?.trim() || "Sin especificar",
        fecha: datos.fecha || fechaOriginal,
        referencia: datos.referencia?.trim() || null,
        estado_analisis: "analizada",
      })
      .eq("id", facturaId)

    if (datos.lineas.length > 0) {
      const subtotal = datos.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0)
      const taxTotal = datos.lineas.reduce((s, l) => s + (l.tax || 0), 0)

      const { error: errLineas } = await supabase.from("costos_reales").insert(
        datos.lineas.map((l) => ({
          proyecto_id: proyectoId,
          actividad_id: null,
          tipo_recurso: "material" as const,
          descripcion: l.descripcion,
          fecha: datos.fecha || fechaOriginal,
          monto: l.cantidad * l.precioUnitario + (l.tax || 0),
          unidad: l.unidad || null,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          tax: l.tax || 0,
          factura_id: facturaId,
          aprobado: true,
        }))
      )

      if (errLineas) {
        console.error("aplicarAnalisisAFactura - lineas:", errLineas)
        await supabase.from("facturas_gasto").update({ estado_analisis: "error" }).eq("id", facturaId)
        return
      }

      await supabase
        .from("facturas_gasto")
        .update({ subtotal, tax_total: taxTotal, total: subtotal + taxTotal })
        .eq("id", facturaId)
    }
  } catch (err) {
    console.error("aplicarAnalisisAFactura:", err)
    await supabase.from("facturas_gasto").update({ estado_analisis: "error" }).eq("id", facturaId)
  }
}

// Sube la foto y crea la factura de inmediato (rápido -- solo la subida),
// y programa el análisis de IA para que corra después de responder, sin
// que el usuario tenga que esperar ni mantener la app abierta.
export async function crearFacturaBorradorConFoto(
  proyectoId: string,
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

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
    console.error("crearFacturaBorradorConFoto - lectura imagen:", err)
    return { error: "No se pudo leer la imagen." }
  }

  const mediaType = file.type
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
  const ruta = `${proyectoId}/${crypto.randomUUID()}.${ext}`

  const { error: errSubida } = await supabase.storage.from("recibos").upload(ruta, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  })
  if (errSubida) {
    console.error("crearFacturaBorradorConFoto - subida a storage:", errSubida)
    return { error: "No se pudo subir la foto." }
  }

  const fechaHoy = new Date().toISOString().slice(0, 10)

  const { data: factura, error: errFactura } = await supabase
    .from("facturas_gasto")
    .insert({
      proyecto_id: proyectoId,
      fecha: fechaHoy,
      lugar: "Analizando recibo…",
      foto_referencia: ruta,
      subtotal: 0,
      tax_total: 0,
      total: 0,
      estado_analisis: "pendiente",
      creado_por: acceso.userId,
    })
    .select("id")
    .single()

  if (errFactura || !factura) {
    console.error("crearFacturaBorradorConFoto - factura:", errFactura)
    await supabase.storage.from("recibos").remove([ruta])
    return { error: "No se pudo guardar la factura." }
  }

  // after() sigue corriendo en el servidor una vez que ya respondimos --
  // el usuario no tiene que esperar ni mantener la conexión abierta.
  after(() => aplicarAnalisisAFactura(supabase, factura.id, proyectoId, fechaHoy, base64, mediaType))

  revalidarTodo()
  return { id: factura.id }
}

// Reintenta el análisis de una factura que quedó en 'pendiente' (el
// servidor se detuvo antes de terminar) o 'error' (la IA falló). Vuelve a
// descargar la foto ya archivada -- no hace falta que el usuario la suba
// de nuevo.
export async function reintentarAnalisisFactura(facturaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const acceso = await verificarAcceso(supabase)
  if (!acceso.ok) return { error: acceso.error }

  const { data: factura, error: errFactura } = await supabase
    .from("facturas_gasto")
    .select("proyecto_id, fecha, foto_referencia")
    .eq("id", facturaId)
    .single()

  if (errFactura || !factura) {
    console.error("reintentarAnalisisFactura - factura:", errFactura)
    return { error: "No se encontró la factura." }
  }
  if (!factura.foto_referencia) {
    return { error: "Esta factura no tiene una foto archivada para analizar." }
  }

  const { data: descarga, error: errDescarga } = await supabase.storage
    .from("recibos")
    .download(factura.foto_referencia)

  if (errDescarga || !descarga) {
    console.error("reintentarAnalisisFactura - descarga:", errDescarga)
    return { error: "No se pudo recuperar la foto archivada." }
  }

  const arrayBuffer = await descarga.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  const mediaType = descarga.type || "image/jpeg"

  await supabase.from("facturas_gasto").update({ estado_analisis: "pendiente" }).eq("id", facturaId)

  after(() => aplicarAnalisisAFactura(supabase, facturaId, factura.proyecto_id, factura.fecha, base64, mediaType))

  revalidarTodo()
  return {}
}
