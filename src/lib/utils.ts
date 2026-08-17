import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formateo de fechas en español
export function formatFecha(fecha: string | Date, formato = 'dd/MM/yyyy'): string {
  const date = typeof fecha === 'string' ? parseISO(fecha) : fecha
  return format(date, formato, { locale: es })
}

export function formatFechaRelativa(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? parseISO(fecha) : fecha
  return formatDistanceToNow(date, { addSuffix: true, locale: es })
}

// Formateo de moneda
export function formatMoneda(monto: number, moneda = 'USD'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(monto)
}

// Formateo de porcentajes
export function formatPorcentaje(valor: number, decimales = 1): string {
  return `${valor.toFixed(decimales)}%`
}

// Calcular variación porcentual
export function calcularVariacion(real: number, plan: number): number {
  if (plan === 0) return 0
  return ((real - plan) / plan) * 100
}

// Obtener color de semáforo según porcentaje de desviación
export function getNivelAlerta(desviacionPct: number, umbrales = { amarillo: 5, rojo: 10 }): 'verde' | 'amarillo' | 'rojo' {
  const abs = Math.abs(desviacionPct)
  if (abs >= umbrales.rojo) return 'rojo'
  if (abs >= umbrales.amarillo) return 'amarillo'
  return 'verde'
}

// Calcular días entre dos fechas
export function calcularDias(inicio: string, fin: string): number {
  const diff = new Date(fin).getTime() - new Date(inicio).getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// Calcular IIDP a partir de componentes y pesos
export function calcularIIDP(scores: {
  cronograma: number;
  finanzas: number;
  productividad: number;
  calidad: number;
  logistica: number;
  gestion: number;
}, pesos = {
  cronograma: 0.25,
  finanzas: 0.25,
  productividad: 0.20,
  calidad: 0.15,
  logistica: 0.10,
  gestion: 0.05,
}): number {
  return (
    scores.cronograma * pesos.cronograma +
    scores.finanzas * pesos.finanzas +
    scores.productividad * pesos.productividad +
    scores.calidad * pesos.calidad +
    scores.logistica * pesos.logistica +
    scores.gestion * pesos.gestion
  )
}

// Color del score IIDP
export function getColorIIDP(score: number): { color: string; label: string } {
  if (score >= 80) return { color: 'text-emerald-600', label: 'Excelente' }
  if (score >= 65) return { color: 'text-blue-600', label: 'Bueno' }
  if (score >= 50) return { color: 'text-amber-600', label: 'Regular' }
  return { color: 'text-red-600', label: 'Crítico' }
}

// Truncar texto
export function truncar(texto: string, longitud: number): string {
  if (texto.length <= longitud) return texto
  return texto.substring(0, longitud) + '...'
}
