// Forma de los datos de pago guardados en empresas.configuracion.datos_pago
export type DatosPago = {
  beneficiario?: string
  banco?: string
  tipo_cuenta?: string
  routing?: string
  cuenta?: string
  swift?: string
  zelle?: string
  direccion_banco?: string
  notas_es?: string
  notas_en?: string
  link_url?: string
  link_etiqueta?: string
}

export function tieneDatosPago(d: DatosPago | null | undefined): boolean {
  if (!d) return false
  return Boolean(d.cuenta || d.routing || d.link_url || d.beneficiario || d.zelle)
}
