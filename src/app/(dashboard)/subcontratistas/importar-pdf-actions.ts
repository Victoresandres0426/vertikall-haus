"use server"

import { createClient } from "@/lib/supabase/server"
import type { SubcontratistaInput } from "./actions"
import type { FormularioLeido } from "./importar-formulario"

const ROLES_GESTION = ["project_manager", "administrador", "dueno", "superadmin"]
const MAX_BYTES = 4 * 1024 * 1024 // límite práctico de la plataforma (~4.5 MB por petición)

const PROMPT_SISTEMA = `Eres un asistente que lee formularios de información de subcontratistas de construcción (en español o inglés; pueden ser un formulario propio, un W-9, un certificado de seguro, una licencia o una tarjeta de presentación) y extrae los datos.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con estas claves (usa null si el dato no aparece; NO inventes datos):
{
  "nombre_compania": string | null,
  "especialidad": string | null,
  "direccion": string | null,
  "sitio_web": string | null,
  "contacto_nombre": string | null,
  "contacto_cargo": string | null,
  "telefono": string | null,
  "email": string | null,
  "contacto2_nombre": string | null,
  "contacto2_cargo": string | null,
  "contacto2_telefono": string | null,
  "contacto2_email": string | null,
  "ein": string | null,
  "w9_recibido": boolean,
  "licencia_numero": string | null,
  "licencia_vence": "YYYY-MM-DD" | null,
  "seguro_aseguradora": string | null,
  "seguro_poliza": string | null,
  "seguro_vence": "YYYY-MM-DD" | null,
  "workers_comp": boolean,
  "metodo_pago": string | null,
  "datos_pago": string | null
}
Reglas: copia nombres y números tal como están escritos; las fechas en formato YYYY-MM-DD; "w9_recibido" y "workers_comp" son true solo si el documento lo indica claramente; si el documento es un W-9, usa el nombre del negocio (o el nombre de la persona si no hay negocio) como nombre_compania y el EIN/SSN solo si es un EIN.`

type Extraido = Partial<Record<keyof SubcontratistaInput, string | boolean | null>>

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}
const fecha = (v: unknown): string | null => {
  const s = texto(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function leerFormularioConIA(formData: FormData): Promise<FormularioLeido> {
  const archivo = formData.get("archivo")
  const nombreArchivo = archivo instanceof File ? archivo.name : "archivo"

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { archivo: nombreArchivo, datos: null, error: "No autenticado." }
  const { data: perfil } = await supabase.from("perfiles_usuario").select("rol").eq("id", user.id).single()
  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) {
    return { archivo: nombreArchivo, datos: null, error: "No tienes permisos para importar." }
  }

  if (!(archivo instanceof File)) return { archivo: nombreArchivo, datos: null, error: "Archivo inválido." }
  if (archivo.size > MAX_BYTES) {
    return { archivo: nombreArchivo, datos: null, error: "El archivo pasa de 4 MB. Comprímelo o envíame solo las páginas del formulario." }
  }

  const esPdf = archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name)
  const mediaImagen = archivo.type.startsWith("image/") ? archivo.type : /\.png$/i.test(archivo.name) ? "image/png" : "image/jpeg"

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { archivo: nombreArchivo, datos: null, error: "Falta configurar la clave de IA (ANTHROPIC_API_KEY)." }

  try {
    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64")
    const bloqueArchivo = esPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaImagen, data: base64 } }

    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2000,
        system: PROMPT_SISTEMA,
        messages: [
          {
            role: "user",
            content: [bloqueArchivo, { type: "text", text: "Extrae los datos del subcontratista según el formato indicado." }],
          },
        ],
      }),
    })

    if (!respuesta.ok) {
      console.error("leerFormularioConIA:", respuesta.status, (await respuesta.text()).slice(0, 400))
      return { archivo: nombreArchivo, datos: null, error: `La IA no pudo leer el archivo (error ${respuesta.status}).` }
    }

    const json = await respuesta.json()
    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    let salida = bloques.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n").trim()
    if (salida.startsWith("```")) salida = salida.replace(/^```(json)?/i, "").replace(/```$/, "").trim()
    const x = JSON.parse(salida) as Extraido

    const nombre = texto(x.nombre_compania)
    if (!nombre) return { archivo: nombreArchivo, datos: null, error: "No encontré el nombre de la compañía en el archivo." }

    const datos: SubcontratistaInput = {
      nombre_compania: nombre,
      especialidad: texto(x.especialidad),
      direccion: texto(x.direccion),
      sitio_web: texto(x.sitio_web),
      contacto_nombre: texto(x.contacto_nombre),
      contacto_cargo: texto(x.contacto_cargo),
      telefono: texto(x.telefono),
      email: texto(x.email),
      contacto2_nombre: texto(x.contacto2_nombre),
      contacto2_cargo: texto(x.contacto2_cargo),
      contacto2_telefono: texto(x.contacto2_telefono),
      contacto2_email: texto(x.contacto2_email),
      ein: texto(x.ein),
      w9_recibido: x.w9_recibido === true,
      licencia_numero: texto(x.licencia_numero),
      licencia_vence: fecha(x.licencia_vence),
      seguro_aseguradora: texto(x.seguro_aseguradora),
      seguro_poliza: texto(x.seguro_poliza),
      seguro_vence: fecha(x.seguro_vence),
      workers_comp: x.workers_comp === true,
      metodo_pago: texto(x.metodo_pago),
      datos_pago: texto(x.datos_pago),
      calificacion: null,
      activo: true,
      notas: null,
    }
    return { archivo: nombreArchivo, datos }
  } catch (err) {
    console.error("leerFormularioConIA:", err)
    return { archivo: nombreArchivo, datos: null, error: "No se pudo interpretar el archivo." }
  }
}
