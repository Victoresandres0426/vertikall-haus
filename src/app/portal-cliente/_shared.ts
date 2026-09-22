import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

// Todo lo que antes vivía duplicado dentro de un solo page.tsx enorme
// (tipos, textos ES/EN, formateadores, y el chequeo de sesión) ahora se
// comparte desde aquí -- el portal se partió en 5 páginas (inicio +
// cronograma + fotos + reportes + facturas, una por cada botón que
// pidió el dueño) y cada una necesita esto mismo.

export type Proyecto = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  ubicacion: string | null
  estado: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  fecha_inicio_real: string | null
  fecha_fin_forecast: string | null
  presupuesto_venta: number | null
  idioma_cliente: string | null
  empresa_nombre: string | null
  empresa_logo_url: string | null
}

export type Actividad = {
  proceso_id: string
  proceso: string
  proceso_en?: string | null
  proceso_orden: number
  actividad_id: string
  codigo: string
  nombre: string
  nombre_en?: string | null
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  avance_porcentaje: number
  estado: string
  es_critica: boolean
}

export type Foto = {
  id: string
  nombre_archivo: string
  storage_path: string
  created_at: string
  url?: string
}

export type FotoActividadReporte = {
  actividad_id: string
  codigo: string | null
  nombre: string
  nombre_en: string | null
  fotos: { storage_path?: string; url?: string; descripcion?: string }[]
}

export type AvancePorActividad = {
  actividad_id: string
  codigo: string | null
  nombre: string
  nombre_en: string | null
  avance_dia_pct: number | null
}

export type Reporte = {
  id?: string
  fecha: string
  clima: string | null
  clima_en?: string | null
  observaciones_generales: string | null
  observaciones_generales_en?: string | null
  avance_por_actividad?: AvancePorActividad[]
  fotos_por_actividad?: FotoActividadReporte[]
}

export type DesglosePeriodo = {
  periodo_inicio: string
  periodo_fin: string
  avance_pct: number
  monto_bruto: number
}

export type ActividadDelGrupo = {
  actividad_id: string
  codigo: string | null
  nombre: string
  nombre_en?: string | null
  avance_actual_pct: number
}

export type DesgloseActividad = {
  actividad_id: string
  actividad_codigo: string | null
  actividad_nombre: string
  actividad_nombre_en?: string | null
  avance_pct: number
  monto_bruto: number
  monto_amortizado?: number
  monto_neto?: number
  disciplina?: string
  disciplina_en?: string
  actividades?: ActividadDelGrupo[]
  avance_desde_pct?: number
  avance_hasta_pct?: number
}

export type Factura = {
  id: string
  numero: string | null
  descripcion: string | null
  hito_asociado: string | null
  monto: number
  retencion: number
  amortizacion_anticipo: number
  periodo_inicio: string | null
  periodo_fin: string | null
  desglose_periodos: DesglosePeriodo[] | null
  desglose_actividades: DesgloseActividad[] | null
  avance_delta_pct?: number | null
  avance_acumulado_pct?: number | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  estado: string
  monto_cobrado: number
}

export const estadoProyectoLabel: Record<string, string> = {
  activo: "En ejecución",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
}

export const estadoProyectoLabelEn: Record<string, string> = {
  activo: "In progress",
  pausado: "Paused",
  completado: "Completed",
  cancelado: "Cancelled",
}

export const estadoActividadLabel: Record<string, string> = {
  no_iniciada: "No iniciada",
  en_progreso: "En progreso",
  completada: "Completada",
  bloqueada: "Bloqueada",
  cancelada: "Cancelada",
}

export const estadoActividadLabelEn: Record<string, string> = {
  no_iniciada: "Not started",
  en_progreso: "In progress",
  completada: "Completed",
  bloqueada: "Blocked",
  cancelada: "Cancelled",
}

export const estadoFacturaLabel: Record<string, string> = {
  enviada: "Enviada",
  parcialmente_pagada: "Pago parcial",
  pagada: "Pagada",
  vencida: "Vencida",
  en_disputa: "En disputa",
}

export const estadoFacturaLabelEn: Record<string, string> = {
  enviada: "Sent",
  parcialmente_pagada: "Partially paid",
  pagada: "Paid",
  vencida: "Overdue",
  en_disputa: "In dispute",
}

export const estadoFacturaColor: Record<string, string> = {
  enviada: "bg-blue-100 text-blue-700",
  parcialmente_pagada: "bg-amber-100 text-amber-700",
  pagada: "bg-emerald-100 text-emerald-700",
  vencida: "bg-red-100 text-red-700",
  en_disputa: "bg-red-100 text-red-700",
}

export const t = {
  es: {
    facturas: "Facturas",
    sinFacturas: "Aún no hay facturas emitidas.",
    anticipo: "Anticipo",
    avanceObra: "Avance de obra",
    totalPagado: "Total pagado",
    saldoPendiente: "Saldo pendiente del contrato",
    pagado: "pagado",
    deFacturado: "de",
    facturado: "facturado",
    deContratado: "de",
    contratado: "contratado",
    sinNumero: "Sin número",
    vence: "Vence",
    periodo: "Período",
    al: "al",
    cubreMasDeUnPeriodo: "Esta estimación cubre más de un período:",
    avanceLabel: "avance",
    detallePorActividad: "Detalle por actividad:",
    renglon: "Renglón",
    pctAvance: "% avance",
    ejecutado: "Ejecutado",
    amortAnticipo: "Amort. anticipo",
    aCobrar: "A cobrar",
    avanceActual: "avance actual",
    avanceReconocido: "Avance reconocido este período",
    amortizacionAplicada: "Amortización de anticipo aplicada",
    retencion: "Retención",
    totalAPagar: "Total a pagar",
    portalCliente: "Portal del cliente",
    inicio: "Inicio",
    entregaEstimada: "Entrega estimada",
    avanceGeneral: "Avance general",
    montoContratado: "Monto contratado",
    avanceRealLabel: "Avance real",
    avanceSegunPlan: "Avance según plan (a hoy)",
    adelantadoPlan: "Adelantado al plan por",
    enLineaConPlan: "En línea con el plan",
    detrasDelPlan: "detrás del plan",
    cronogramaYAvance: "Cronograma y avance",
    sinActividades: "Aún no hay actividades cargadas.",
    actividad: "actividad",
    actividades: "actividades",
    fotosYReportes: "Reportes de obra",
    sinReportes: "Todavía no hay reportes publicados.",
    fotosDelProyecto: "Fotos del proyecto",
    sinFotos: "Todavía no hay fotos publicadas.",
    volver: "Volver",
    avanceDelDia: "Avance del día",
    cuentaSinProyecto: "Tu cuenta todavía no tiene un proyecto asignado.",
    contactaContacto: "Contacta a tu contacto en Vertikall Haus.",
    verCronograma: "Ver el avance por actividad y proceso",
    verFotos: "Ver la galería de fotos del proyecto",
    verReportes: "Ver los reportes diarios de obra",
    verFacturas: "Ver facturas, pagos y saldo pendiente",
  },
  en: {
    facturas: "Invoices",
    sinFacturas: "No invoices issued yet.",
    anticipo: "Deposit",
    avanceObra: "Work progress",
    totalPagado: "Total paid",
    saldoPendiente: "Contract balance due",
    pagado: "paid",
    deFacturado: "of",
    facturado: "invoiced",
    deContratado: "of",
    contratado: "contracted",
    sinNumero: "No number",
    vence: "Due",
    periodo: "Period",
    al: "to",
    cubreMasDeUnPeriodo: "This estimate covers more than one period:",
    avanceLabel: "progress",
    detallePorActividad: "Detail by item:",
    renglon: "Item",
    pctAvance: "% progress",
    ejecutado: "Amount",
    amortAnticipo: "Deposit amort.",
    aCobrar: "Due",
    avanceActual: "current progress",
    avanceReconocido: "Progress recognized this period",
    amortizacionAplicada: "Deposit amortization applied",
    retencion: "Retention",
    totalAPagar: "Total due",
    portalCliente: "Client portal",
    inicio: "Start",
    entregaEstimada: "Estimated delivery",
    avanceGeneral: "Overall progress",
    montoContratado: "Contracted amount",
    avanceRealLabel: "Actual progress",
    avanceSegunPlan: "Planned progress (as of today)",
    adelantadoPlan: "Ahead of plan by",
    enLineaConPlan: "On track with plan",
    detrasDelPlan: "behind plan",
    cronogramaYAvance: "Schedule and progress",
    sinActividades: "No activities loaded yet.",
    actividad: "activity",
    actividades: "activities",
    fotosYReportes: "Site reports",
    sinReportes: "No reports published yet.",
    fotosDelProyecto: "Project photos",
    sinFotos: "No photos published yet.",
    volver: "Back",
    avanceDelDia: "Progress that day",
    cuentaSinProyecto: "Your account doesn't have a project assigned yet.",
    contactaContacto: "Contact your Vertikall Haus representative.",
    verCronograma: "See progress by activity and process",
    verFotos: "See the project photo gallery",
    verReportes: "See daily site reports",
    verFacturas: "See invoices, payments and balance due",
  },
} as const

export function descripcionFactura(f: Factura, en: boolean): string {
  if (!en) return f.descripcion ?? ""
  if (f.avance_delta_pct == null) return f.descripcion ?? ""
  const acumulado = f.avance_acumulado_pct != null ? ` (${f.avance_acumulado_pct}% accumulated)` : ""
  return `Automatic progress estimate — ${f.avance_delta_pct}% additional progress${acumulado}`
}

export function formatoFecha(iso: string | null, en: boolean = false) {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatoMoneda(n: number | null) {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

// Chequeo de sesión + rol, igual en las 5 páginas del portal. Redirige
// si no corresponde -- las páginas que lo llaman no necesitan repetir
// esta lógica.
export async function cargarSesionCliente() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, nombre_completo")
    .eq("id", user.id)
    .single()

  if (!perfil) redirect("/login")
  if (perfil.rol !== "cliente") redirect("/dashboard")

  return { supabase, perfil }
}

export async function obtenerProyectoCliente(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("cliente_ver_proyecto")
  return data as Proyecto | null
}

// Traduce con IA (cacheando el resultado en la base) los reportes que
// todavía no tienen su versión en inglés -- solo se llama cuando el
// cliente está viendo el portal en inglés. Si falla (sin API key, IA
// no responde, etc.) se ignora en silencio y el portal cae de vuelta
// al texto en español para esos reportes -- nunca bloquea la página.
export async function traducirReportesFaltantes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reportes: Reporte[]
): Promise<void> {
  const faltantes = reportes.filter(
    (r) => r.id && ((r.observaciones_generales && !r.observaciones_generales_en) || (r.clima && !r.clima_en))
  )
  if (faltantes.length === 0) return

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return

  try {
    const lista = faltantes.map((r) => ({ id: r.id, clima: r.clima, observaciones: r.observaciones_generales }))
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8192,
        system: `Eres un traductor de reportes diarios de obra de construcción (español -> inglés) para el cliente dueño del proyecto. Recibes un array JSON de objetos {id, clima, observaciones} (clima u observaciones pueden venir null). Devuelve ÚNICAMENTE un JSON válido (sin texto antes ni después, sin markdown), con esta forma exacta: { "traducciones": [ { "id": string, "clima_en": string | null, "observaciones_en": string | null } ] }. Si "clima" o "observaciones" venía null, su traducción también debe ser null. Traduce con el tono profesional y directo que usaría un contratista general en Estados Unidos.`,
        messages: [{ role: "user", content: JSON.stringify(lista) }],
      }),
    })
    if (!respuesta.ok) return

    const json = await respuesta.json()
    const bloques: Array<{ type?: string; text?: string }> = Array.isArray(json?.content) ? json.content : []
    const texto = bloques.find((b) => b.type === "text")?.text ?? ""
    let parsed: { traducciones?: { id: string; clima_en: string | null; observaciones_en: string | null }[] }
    try {
      parsed = JSON.parse(texto)
    } catch {
      const match = texto.match(/\{[\s\S]*\}/)
      if (!match) return
      parsed = JSON.parse(match[0])
    }

    for (const t of parsed.traducciones ?? []) {
      const reporte = faltantes.find((r) => r.id === t.id)
      if (!reporte) continue
      reporte.observaciones_generales_en = t.observaciones_en ?? null
      reporte.clima_en = t.clima_en ?? null
      // Fire-and-forget: cachea la traducción, no bloquea el render de esta visita.
      supabase.rpc("cliente_guardar_traduccion_reporte", {
        p_reporte_id: t.id,
        p_observaciones_en: t.observaciones_en ?? null,
        p_clima_en: t.clima_en ?? null,
      }).then(() => {})
    }
  } catch (e) {
    console.error("traducirReportesFaltantes falló:", e)
  }
}
