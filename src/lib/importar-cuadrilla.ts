// ============================================================
// Extraer "Composición de cuadrilla" / "Productividad" desde el
// Excel original de estimación, para actividades YA existentes.
// ============================================================
// El importador de proyectos (proyectos/importar/actions.ts) usa IA
// para leer el Excel completo y crear un proyecto desde cero. Esto es
// distinto y deliberadamente NO usa IA: el Excel de estimación trae una
// tabla de columnas fijas y predecibles (mismo archivo, mismas
// cabeceras), así que un parseo determinista es más confiable, más
// rápido y no tiene costo de API -- y como solo ACTUALIZA actividades
// que ya existen (emparejando por código), un error de parseo en una
// fila como mucho la deja sin emparejar, nunca crea o corrompe datos.
//
// Ver migración 072 (composicion_cuadrilla, productividad_plan_texto)
// y actividades/actualizar-cuadrilla-actions.ts (server actions que
// usan estas funciones).

import * as XLSX from "xlsx"

export type FilaCuadrilla = {
  codigo: string
  nombreReferencia: string
  composicionCuadrilla: string | null
  personalPlaneado: number | null
  productividadTexto: string | null
}

function normalizarEncabezado(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
}

// "2 Peones" -> 2, "Carpintero" -> 1, "Carpintero + Peón" -> 2,
// "Instalador de tile (2)" -> 2 (el número entre paréntesis manda,
// describe cuántas personas de ese rol especializado).
export function parseHeadcountFromCuadrilla(texto: string | null | undefined): number | null {
  if (!texto) return null
  const limpio = texto.trim()
  if (!limpio) return null

  const matchParentesis = limpio.match(/\((\d+)\)\s*$/)
  if (matchParentesis) return parseInt(matchParentesis[1], 10)

  const segmentos = limpio.split("+").map((s) => s.trim()).filter(Boolean)
  if (segmentos.length === 0) return null

  let total = 0
  for (const seg of segmentos) {
    const matchNumero = seg.match(/^(\d+)\b/)
    total += matchNumero ? parseInt(matchNumero[1], 10) : 1
  }
  return total > 0 ? total : null
}

// Distingue una fila de ACTIVIDAD individual (código con subactividad,
// ej. 8.02 o "00.01") de una fila de ENCABEZADO DE DIVISIÓN (código
// entero puro, ej. 0, 1, 8 -- estas agrupan actividades pero no son
// una actividad en sí, y nunca deben confundirse con una).
function esCodigoDeActividadCrudo(valor: unknown): boolean {
  if (typeof valor === "number") return !Number.isInteger(valor)
  if (typeof valor === "string") return /\d+\.\d+/.test(valor)
  return false
}

// Normaliza un código de actividad al formato "DD.SS" (división y
// subactividad a 2 dígitos cada una) -- el mismo que ya usa toda la
// base de datos (00.01, 01.01, ...). Necesario porque Excel a veces
// guarda estos códigos como TEXTO (cuando la división necesita cero a
// la izquierda, ej. "00.01") y a veces como NÚMERO real (cuando no lo
// necesita, ej. 8.02), y hay que hacerlos coincidir con lo ya guardado.
export function normalizarCodigoActividad(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null

  if (typeof valor === "number") {
    if (!isFinite(valor)) return null
    const [entero, decimal = "0"] = valor.toFixed(2).split(".")
    return `${entero.padStart(2, "0")}.${decimal.padStart(2, "0")}`
  }

  const texto = String(valor).trim()
  if (!texto) return null

  const match = texto.match(/^(\d+)\.(\d+)$/)
  if (match) {
    return `${match[1].padStart(2, "0")}.${match[2].padStart(2, "0")}`
  }
  return texto
}

export type ExtraccionCuadrillaResultado = {
  filas: FilaCuadrilla[]
  error?: string
}

// Busca, en cualquier hoja del archivo, la tabla que tenga una columna
// "Composición de cuadrilla" (con o sin acentos/mayúsculas) y extrae de
// ahí las filas de actividad real (código con formato "NN.NN" -- las
// filas de encabezado de división, con código entero como 0, 1, 2..., o
// sub-agrupaciones sin código, se ignoran porque no se pueden emparejar
// de forma inequívoca con una sola actividad).
export function extraerFilasCuadrillaDeExcel(buffer: ArrayBuffer): ExtraccionCuadrillaResultado {
  const wb = XLSX.read(buffer, { type: "array" })

  for (const nombreHoja of wb.SheetNames) {
    const hoja = wb.Sheets[nombreHoja]
    const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, raw: true })

    let filaEncabezado = -1
    let colCuadrilla = -1
    let colProductividad = -1
    let colCodigo = 0
    let colNombre = 1

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i] ?? []
      const idxCuadrilla = fila.findIndex((c) => normalizarEncabezado(c).includes("composicion de cuadrilla"))
      if (idxCuadrilla < 0) continue

      filaEncabezado = i
      colCuadrilla = idxCuadrilla
      colProductividad = fila.findIndex((c) => normalizarEncabezado(c) === "productividad")
      const idxDiv = fila.findIndex((c) => normalizarEncabezado(c).startsWith("div"))
      const idxNombre = fila.findIndex((c) => {
        const n = normalizarEncabezado(c)
        return n.includes("subactividad") || n.includes("proceso")
      })
      if (idxDiv >= 0) colCodigo = idxDiv
      if (idxNombre >= 0) colNombre = idxNombre
      break
    }

    if (filaEncabezado === -1) continue // esta hoja no tiene la tabla que buscamos

    const filasResultado: FilaCuadrilla[] = []
    for (let i = filaEncabezado + 1; i < filas.length; i++) {
      const fila = filas[i]
      if (!fila || fila.every((c) => c === null || c === "")) continue

      // Las filas de encabezado de división (código entero: 0, 1, 2...)
      // NO son actividades individuales -- se descartan ANTES de
      // normalizar, porque un entero como 8 se formatearía como "08.00"
      // y calzaría por error con el patrón "NN.NN" de una actividad real.
      const crudoCodigo = fila[colCodigo]
      if (!esCodigoDeActividadCrudo(crudoCodigo)) continue

      const codigo = normalizarCodigoActividad(crudoCodigo)
      if (!codigo || !/^\d{2}\.\d{2}$/.test(codigo)) continue

      const composicionRaw = fila[colCuadrilla]
      const composicion = composicionRaw != null && String(composicionRaw).trim() !== ""
        ? String(composicionRaw).trim()
        : null
      const productividadRaw = colProductividad >= 0 ? fila[colProductividad] : null
      const productividad = productividadRaw != null && String(productividadRaw).trim() !== ""
        ? String(productividadRaw).trim()
        : null

      filasResultado.push({
        codigo,
        nombreReferencia: fila[colNombre] != null ? String(fila[colNombre]).trim() : "",
        composicionCuadrilla: composicion,
        personalPlaneado: parseHeadcountFromCuadrilla(composicion),
        productividadTexto: productividad,
      })
    }

    if (filasResultado.length > 0) return { filas: filasResultado }
  }

  return {
    filas: [],
    error: 'No se encontró una tabla con la columna "Composición de cuadrilla" en ninguna hoja del archivo.',
  }
}
