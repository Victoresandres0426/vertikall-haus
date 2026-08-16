// ============================================================
// Motor de reglas — Flujo de caja predictivo (spec §11.3)
// ============================================================
// Funciones puras (sin I/O) que agrupan facturas por cobrar/pagar y
// nómina en cubetas semanales, y calculan un saldo ACUMULADO semana
// a semana (no solo el neto de cada semana individual). La I/O con
// Supabase vive en flujo-caja/actions.ts.

export type FacturaClienteFlujo = {
  proyecto_id: string
  monto: number
  monto_cobrado: number
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_cobro: string | null
  estado: string
}

export type FacturaProveedorFlujo = {
  proyecto_id: string
  monto: number
  monto_pagado: number
  fecha_recepcion: string | null
  fecha_vencimiento: string | null
  fecha_pago: string | null
  estado: string
}

export type NominaFlujo = {
  proyecto_id: string
  monto: number
  fecha_referencia: string | null // fecha_fin del periodo de nómina
  pagado: boolean
}

export type SemanaProyeccion = {
  semana: string // fecha ISO (lunes de la semana)
  ingresos_plan: number
  ingresos_real: number
  egresos_plan: number
  egresos_real: number
  saldo_proyectado: number
  alerta_liquidez: boolean
}

const MS_DIA = 86400000

/** Devuelve la fecha (ISO, YYYY-MM-DD) del lunes de la semana que contiene `iso`. */
export function lunesDeLaSemana(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const diaSemana = d.getUTCDay() // 0=domingo … 6=sábado
  const offsetALunes = diaSemana === 0 ? -6 : 1 - diaSemana
  const lunes = new Date(d.getTime() + offsetALunes * MS_DIA)
  return lunes.toISOString().slice(0, 10)
}

/**
 * Agrupa facturas de cliente/proveedor y nómina en cubetas semanales
 * y calcula el saldo proyectado ACUMULADO (no solo el neto semanal).
 *
 * - ingresos_plan: facturas de cliente por su fecha de vencimiento (o emisión si falta).
 * - ingresos_real: facturas de cliente ya cobradas, por su fecha de cobro.
 * - egresos_plan: facturas de proveedor por su fecha de vencimiento (o recepción) + nómina plan.
 * - egresos_real: facturas de proveedor ya pagadas, por su fecha de pago + nómina pagada.
 */
export function calcularProyeccionesFlujoCaja(
  facturasCliente: FacturaClienteFlujo[],
  facturasProveedor: FacturaProveedorFlujo[],
  nomina: NominaFlujo[],
  saldoInicial = 0
): SemanaProyeccion[] {
  const cubetas = new Map<string, { ip: number; ir: number; ep: number; er: number }>()

  function cubeta(semana: string) {
    if (!cubetas.has(semana)) cubetas.set(semana, { ip: 0, ir: 0, ep: 0, er: 0 })
    return cubetas.get(semana)!
  }

  for (const f of facturasCliente) {
    if (f.estado === "borrador") continue // aún no confirmada, no cuenta como compromiso real
    const fechaPlan = f.fecha_vencimiento ?? f.fecha_emision
    if (fechaPlan) cubeta(lunesDeLaSemana(fechaPlan)).ip += f.monto
    if (f.fecha_cobro && f.monto_cobrado > 0) {
      cubeta(lunesDeLaSemana(f.fecha_cobro)).ir += f.monto_cobrado
    }
  }

  for (const f of facturasProveedor) {
    if (f.estado === "borrador") continue // aún no confirmada, no cuenta como compromiso real
    const fechaPlan = f.fecha_vencimiento ?? f.fecha_recepcion
    if (fechaPlan) cubeta(lunesDeLaSemana(fechaPlan)).ep += f.monto
    if (f.fecha_pago && f.monto_pagado > 0) {
      cubeta(lunesDeLaSemana(f.fecha_pago)).er += f.monto_pagado
    }
  }

  for (const n of nomina) {
    if (!n.fecha_referencia || n.monto <= 0) continue
    const c = cubeta(lunesDeLaSemana(n.fecha_referencia))
    c.ep += n.monto
    if (n.pagado) c.er += n.monto
  }

  const semanas = Array.from(cubetas.keys()).sort()
  const resultado: SemanaProyeccion[] = []
  let saldoAcumulado = saldoInicial

  for (const semana of semanas) {
    const c = cubetas.get(semana)!
    const netoSemana = (c.ir || c.ip) - (c.er || c.ep)
    saldoAcumulado += netoSemana
    resultado.push({
      semana,
      ingresos_plan: Math.round(c.ip * 100) / 100,
      ingresos_real: Math.round(c.ir * 100) / 100,
      egresos_plan: Math.round(c.ep * 100) / 100,
      egresos_real: Math.round(c.er * 100) / 100,
      saldo_proyectado: Math.round(saldoAcumulado * 100) / 100,
      alerta_liquidez: saldoAcumulado < 0,
    })
  }

  return resultado
}
