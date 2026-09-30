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

export type FotoBitacora = { storage_path: string; nombre_archivo: string; url?: string }

export type EntradaBitacora = {
  id: string
  autor_nombre: string | null
  autor_rol: string | null
  autor_titulo: string | null
  nota: string | null
  idioma_detectado?: "es" | "en" | null
  nota_traducida?: string | null
  fotos: FotoBitacora[]
  created_at: string
}

export type ArchivoProyecto = {
  id: string
  categoria: "planos" | "documentos_colaborador"
  nombre_archivo: string
  storage_path: string
  tamano_bytes: number | null
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

export type ChangeOrder = {
  id: string
  numero: string | null
  titulo: string
  descripcion: string | null
  solicitado_por: string | null
  estado: string
  costo_directo: number | null
  margen_pct_aplicado: number | null
  costo_margen: number | null
  impacto_costo: number
  impacto_dias: number
  motivo_rechazo: string | null
  enviado_at: string | null
  decidido_at: string | null
  created_at: string
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
    archivos: "Archivos y planos",
    verArchivos: "Ver planos y documentos del proyecto",
    sinArchivos: "Todavía no hay archivos publicados.",
    subirArchivo: "Subir archivo",
    subiendo: "Subiendo...",
    categoriaPlanos: "Planos",
    categoriaOtros: "Otros documentos",
    elegirArchivo: "Elegir archivo",
    tipoDeArchivo: "Tipo de archivo",
    planos: "Planos",
    verPlanos: "Ver los planos del proyecto",
    planCorto: "Plan",
    realCorto: "Real",
    enCurso: "en curso",
    atrasada: "atrasada",
    atrasadas: "atrasadas",
    bitacora: "Bitácora de obra",
    verBitacora: "Ver notas y decisiones del proyecto",
    sinNotasBitacora: "Todavía no hay entradas en la bitácora.",
    nuevaEntradaBitacora: "Nueva entrada",
    escribirNotaBitacora: "Describe el suceso o la decisión tomada...",
    publicarBitacora: "Publicar",
    publicandoBitacora: "Publicando...",
    changeOrders: "Change Orders",
    verChangeOrders: "Ver y aprobar órdenes de cambio",
    sinChangeOrders: "Todavía no hay change orders enviados para tu revisión.",
    costoDirecto: "Costo directo (material + mano de obra)",
    indirectosContingenciaMargen: "Indirectos + Contingencia + Margen",
    impactoTotalCosto: "Impacto total en costo",
    impactoEnDias: "Impacto en días",
    aprobarCO: "Aprobar",
    rechazarCO: "Rechazar",
    aprobando: "Aprobando...",
    rechazando: "Rechazando...",
    motivoRechazoLabel: "Motivo del rechazo (opcional)",
    motivoRechazoPlaceholder: "Explica por qué se rechaza este cambio...",
    confirmarRechazo: "Confirmar rechazo",
    cancelar: "Cancelar",
    estadoCOAprobado: "Aprobado",
    estadoCORechazado: "Rechazado",
    estadoCOEsperando: "Esperando tu decisión",
    coAprobadoNota: "Aprobaste este cambio — ya se agregó al presupuesto y al cronograma del proyecto.",
    coRechazadoNota: "Rechazaste este cambio.",
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
    archivos: "Files and plans",
    verArchivos: "See project plans and documents",
    sinArchivos: "No files published yet.",
    subirArchivo: "Upload file",
    subiendo: "Uploading...",
    categoriaPlanos: "Plans",
    categoriaOtros: "Other documents",
    elegirArchivo: "Choose file",
    tipoDeArchivo: "File type",
    planos: "Plans",
    verPlanos: "See the project's plans",
    planCorto: "Plan",
    realCorto: "Actual",
    enCurso: "in progress",
    atrasada: "behind",
    atrasadas: "behind",
    bitacora: "Site log",
    verBitacora: "See project notes and decisions",
    sinNotasBitacora: "No log entries yet.",
    nuevaEntradaBitacora: "New entry",
    escribirNotaBitacora: "Describe the event or decision made...",
    publicarBitacora: "Post",
    publicandoBitacora: "Posting...",
    changeOrders: "Change Orders",
    verChangeOrders: "Review and approve change orders",
    sinChangeOrders: "No change orders have been sent to you for review yet.",
    costoDirecto: "Direct cost (material + labor)",
    indirectosContingenciaMargen: "Indirect + Contingency + Margin",
    impactoTotalCosto: "Total cost impact",
    impactoEnDias: "Schedule impact",
    aprobarCO: "Approve",
    rechazarCO: "Reject",
    aprobando: "Approving...",
    rechazando: "Rejecting...",
    motivoRechazoLabel: "Reason for rejection (optional)",
    motivoRechazoPlaceholder: "Explain why this change is being rejected...",
    confirmarRechazo: "Confirm rejection",
    cancelar: "Cancel",
    estadoCOAprobado: "Approved",
    estadoCORechazado: "Rejected",
    estadoCOEsperando: "Awaiting your decision",
    coAprobadoNota: "You approved this change — it has been added to the project's budget and schedule.",
    coRechazadoNota: "You rejected this change.",
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
    .select("rol, nombre_completo, titulo_colaborador")
    .eq("id", user.id)
    .single()

  if (!perfil) redirect("/login")
  const ROLES_PORTAL = ["cliente", "colaborador_externo", "subcontratista"]
  if (!ROLES_PORTAL.includes(perfil.rol)) redirect("/dashboard")

  return {
    supabase,
    perfil,
    esColaborador: perfil.rol === "colaborador_externo",
    esSubcontratista: perfil.rol === "subcontratista",
  }
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
