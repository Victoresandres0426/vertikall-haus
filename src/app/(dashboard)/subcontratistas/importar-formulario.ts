import type { SubcontratistaInput } from "./actions"

// Lee el "Formulario_Subcontratista.xlsx" que llenan los subcontratistas.
// La hoja "Formulario" trae en la columna A (oculta) la clave de cada campo y
// en la columna C la respuesta.

export type FormularioLeido = {
  archivo: string
  datos: SubcontratistaInput | null
  error?: string
}

const CAMPOS_TEXTO = [
  "nombre_compania", "contacto_nombre", "especialidad", "telefono", "email", "direccion", "sitio_web",
  "ein", "licencia_numero", "seguro_aseguradora", "seguro_poliza", "metodo_pago", "datos_pago",
] as const

function textoOpcional(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

function siNo(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase()
  return s.startsWith("s") || s.startsWith("y") // Sí / Yes
}

// Acepta mm/dd/yyyy, yyyy-mm-dd o una fecha de Excel ya formateada
function fechaIso(v: unknown): string | null {
  const s = textoOpcional(v)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${anio}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`
}

export async function leerFormulario(archivo: File): Promise<FormularioLeido> {
  try {
    const XLSX = await import("xlsx")
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" })
    const hoja = libro.Sheets["Formulario"] ?? libro.Sheets[libro.SheetNames[0]]
    if (!hoja) return { archivo: archivo.name, datos: null, error: "El archivo no tiene hojas." }

    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: false, defval: "" })
    const mapa = new Map<string, unknown>()
    for (const fila of filas) {
      const clave = String(fila[0] ?? "").trim()
      if (clave && clave !== "campo") mapa.set(clave, fila[2])
    }
    if (!mapa.has("nombre_compania")) {
      return { archivo: archivo.name, datos: null, error: "No parece el formulario de subcontratista (falta la estructura original)." }
    }

    const nombre = textoOpcional(mapa.get("nombre_compania"))
    if (!nombre) return { archivo: archivo.name, datos: null, error: "Falta el nombre de la compañía." }

    const datos: SubcontratistaInput = {
      nombre_compania: nombre,
      contacto_nombre: null, telefono: null, email: null, direccion: null, sitio_web: null,
      especialidad: null, ein: null, licencia_numero: null, seguro_aseguradora: null,
      seguro_poliza: null, metodo_pago: null, datos_pago: null,
      w9_recibido: siNo(mapa.get("w9_recibido")),
      workers_comp: siNo(mapa.get("workers_comp")),
      licencia_vence: fechaIso(mapa.get("licencia_vence")),
      seguro_vence: fechaIso(mapa.get("seguro_vence")),
      calificacion: null,
      activo: true,
      notas: null,
    }
    for (const k of CAMPOS_TEXTO) {
      if (k === "nombre_compania") continue
      datos[k] = textoOpcional(mapa.get(k))
    }
    return { archivo: archivo.name, datos }
  } catch (err) {
    console.error("leerFormulario:", err)
    return { archivo: archivo.name, datos: null, error: "No se pudo leer el archivo (¿es un .xlsx válido?)." }
  }
}
