// Lógica pura (sin acceso a la base de datos) para comparar el presupuesto de
// materiales (hoja S2) contra lo comprado, y para calcular cuándo comprar.

export type MaterialPresupuestado = {
  id: string
  proceso_id: string | null
  seccion: string | null
  codigo: string | null
  descripcion: string
  unidad: string | null
  cantidad_neta: number
  desperdicio_pct: number
  cantidad_total: number
  precio_unitario: number
  costo_total: number
  estado_plano: string | null
  proveedor: string | null
  dias_anticipacion: number
  orden: number
}

// Línea de gasto (costos_reales) ya ligada y confirmada a un material
export type LineaCompra = {
  material_presupuestado_id: string
  cantidad: number | null
  monto: number
  unidad: string | null
}

export type EstadoConsumo = "sin_compra" | "normal" | "aviso" | "sobreconsumo"

export type ComparativoMaterial = MaterialPresupuestado & {
  comprado_cantidad: number
  comprado_monto: number
  lineas: number
  // null cuando alguna línea viene en otra unidad (no comparable)
  pct_cantidad: number | null
  pct_costo: number
  pct: number
  estado: EstadoConsumo
  unidades_distintas: boolean
}

export const UMBRAL_AVISO = 0.9
export const UMBRAL_SOBRECONSUMO = 1.0

const norm = (u: string | null | undefined) => (u ?? "").trim().toLowerCase()

export function construirComparativo(
  materiales: MaterialPresupuestado[],
  lineas: LineaCompra[]
): ComparativoMaterial[] {
  const porMaterial = new Map<string, LineaCompra[]>()
  for (const l of lineas) {
    const arr = porMaterial.get(l.material_presupuestado_id) ?? []
    arr.push(l)
    porMaterial.set(l.material_presupuestado_id, arr)
  }

  return materiales.map((m) => {
    const ls = porMaterial.get(m.id) ?? []
    const monto = ls.reduce((s, l) => s + (l.monto ?? 0), 0)
    let cantidad = 0
    let unidadesDistintas = false
    for (const l of ls) {
      const unidadLinea = norm(l.unidad)
      if (unidadLinea && norm(m.unidad) && unidadLinea !== norm(m.unidad)) {
        unidadesDistintas = true
      } else {
        cantidad += l.cantidad ?? 0
      }
    }

    const pctCosto = m.costo_total > 0 ? monto / m.costo_total : monto > 0 ? 9.99 : 0
    const pctCantidad =
      unidadesDistintas || m.cantidad_total <= 0 ? null : cantidad / m.cantidad_total
    const pct = Math.max(pctCosto, pctCantidad ?? 0)

    let estado: EstadoConsumo = "sin_compra"
    if (ls.length > 0) {
      estado = "normal"
      if (pct > UMBRAL_SOBRECONSUMO + 0.0001) estado = "sobreconsumo"
      else if (pct >= UMBRAL_AVISO) estado = "aviso"
    }

    return {
      ...m,
      comprado_cantidad: cantidad,
      comprado_monto: monto,
      lineas: ls.length,
      pct_cantidad: pctCantidad,
      pct_costo: pctCosto,
      pct,
      estado,
      unidades_distintas: unidadesDistintas,
    }
  })
}

// ── Cuándo comprar ──────────────────────────────────────────────

export type EstadoCompra = "comprado" | "vencida" | "comprar_ya" | "proxima" | "futura" | "sin_fecha"

export type CompraMaterial = ComparativoMaterial & {
  fecha_inicio: string | null // inicio de la división en el cronograma
  fecha_compra: string | null // inicio - días de anticipación
  dias_para_comprar: number | null // negativo = ya debió comprarse
  estado_compra: EstadoCompra
}

const MS_DIA = 24 * 60 * 60 * 1000

export function restarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z")
  return new Date(d.getTime() - dias * MS_DIA).toISOString().slice(0, 10)
}

export function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = new Date(desdeIso + "T00:00:00Z").getTime()
  const b = new Date(hastaIso + "T00:00:00Z").getTime()
  return Math.round((b - a) / MS_DIA)
}

// "Comprado" = ya se registró al menos el 90% del presupuesto del material
export const UMBRAL_COMPRADO = UMBRAL_AVISO
export const DIAS_PROXIMA = 14

export function construirCompras(
  comparativo: ComparativoMaterial[],
  inicioPorProceso: Map<string, string>,
  hoy: string
): CompraMaterial[] {
  return comparativo.map((m) => {
    const inicio = m.proceso_id ? inicioPorProceso.get(m.proceso_id) ?? null : null
    const fechaCompra = inicio ? restarDias(inicio, m.dias_anticipacion) : null
    const dias = fechaCompra ? diasEntre(hoy, fechaCompra) : null

    let estado: EstadoCompra
    if (m.pct >= UMBRAL_COMPRADO) estado = "comprado"
    else if (!inicio || dias === null) estado = "sin_fecha"
    else if (hoy > inicio) estado = "vencida"
    else if (dias <= 0) estado = "comprar_ya"
    else if (dias <= DIAS_PROXIMA) estado = "proxima"
    else estado = "futura"

    return { ...m, fecha_inicio: inicio, fecha_compra: fechaCompra, dias_para_comprar: dias, estado_compra: estado }
  })
}

export function formatoPct(p: number): string {
  return `${Math.round(p * 100)}%`
}
