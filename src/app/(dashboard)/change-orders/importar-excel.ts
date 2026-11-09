// Lee las actividades de un presupuesto en Excel (ej. "PRESUPUESTO MAESTRO") para
// cargarlas de una vez como renglones de un Change Order.
//
// Reglas: se busca la fila de encabezados (la que tiene una columna "MATERIAL..."
// y otra "MANO DE OBRA..."); las filas siguientes son actividades hasta la primera
// fila que empiece con "SUBTOTAL" o "TOTAL". La primera columna con texto
// ("16.1  Desinstalación completa…") trae código y nombre. Equipo, si existe,
// se suma al material.

export type FilaExcelCO = {
  codigo: string | null
  nombre: string
  costo_material: number
  costo_mano_obra: number
  duracion_dias: number | null
  equipo_sumado: boolean
}

export type HojaLeida = {
  nombre: string
  filas: FilaExcelCO[]
}

export type LecturaExcelCO = {
  hojas: HojaLeida[]
  hojaSugerida: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

function aNumero(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,\s]/g, ""))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

const texto = (v: unknown) => String(v ?? "").trim()
const mayus = (v: unknown) => texto(v).toUpperCase()

function leerHoja(filas: unknown[][]): FilaExcelCO[] {
  let header = -1
  let cMat = -1, cMo = -1, cEq = -1, cDias = -1, cNombre = -1

  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const f = filas[i] ?? []
    const iMat = f.findIndex((c) => mayus(c).startsWith("MATERIAL"))
    const iMo = f.findIndex((c) => mayus(c).includes("MANO DE OBRA"))
    if (iMat >= 0 && iMo >= 0) {
      header = i
      cMat = iMat
      cMo = iMo
      cEq = f.findIndex((c) => mayus(c).startsWith("EQUIPO"))
      cDias = f.findIndex((c) => /^D[IÍ]AS/.test(mayus(c)))
      cNombre = f.findIndex((c) => /ACTIVIDAD/.test(mayus(c)))
      break
    }
  }
  if (header < 0) return []
  if (cNombre < 0) cNombre = 0

  const salida: FilaExcelCO[] = []
  for (let i = header + 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const etiqueta = texto(f[cNombre])
    if (!etiqueta) {
      if (salida.length > 0 && f.every((c) => c === null || c === undefined || c === "")) break
      continue
    }
    const up = etiqueta.toUpperCase()
    if (up.startsWith("SUBTOTAL") || up.startsWith("TOTAL")) break

    const mat = aNumero(f[cMat])
    const mo = aNumero(f[cMo])
    const eq = cEq >= 0 ? aNumero(f[cEq]) : 0
    if (mat + mo + eq <= 0) continue

    const m = etiqueta.match(/^(\d+(?:\.\d+)*[a-zA-Z]?)[\s.\-–—:]+(.*)$/)
    const dias = cDias >= 0 ? aNumero(f[cDias]) : 0
    salida.push({
      codigo: m ? m[1] : null,
      nombre: (m ? m[2] : etiqueta).replace(/\s+/g, " ").trim(),
      costo_material: r2(mat + eq),
      costo_mano_obra: r2(mo),
      duracion_dias: dias > 0 ? dias : null,
      equipo_sumado: eq > 0,
    })
  }
  return salida
}

export async function leerExcelCO(archivo: File): Promise<LecturaExcelCO> {
  const XLSX = await import("xlsx")
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" })
  const hojas: HojaLeida[] = []
  for (const nombre of libro.SheetNames) {
    const ws = libro.Sheets[nombre]
    if (!ws) continue
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
    const leidas = leerHoja(filas)
    if (leidas.length > 0) hojas.push({ nombre, filas: leidas })
  }
  const sugerida =
    hojas.find((h) => /MAESTRO/i.test(h.nombre))?.nombre ??
    hojas.find((h) => /INTERNO|DESGLOSE/i.test(h.nombre))?.nombre ??
    hojas[0]?.nombre ??
    null
  return { hojas, hojaSugerida: sugerida }
}
