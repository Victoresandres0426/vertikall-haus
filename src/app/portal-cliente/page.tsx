import { Fragment } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Image from "next/image"
import { CalendarDays, MapPin, Camera, Receipt, ListChecks, ChevronDown } from "lucide-react"
import { CerrarSesionBoton } from "./cerrar-sesion-boton"
import { IdiomaToggle } from "./idioma-toggle"

type Proyecto = {
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

type Actividad = {
  proceso_id: string
  proceso: string
  proceso_orden: number
  actividad_id: string
  codigo: string
  nombre: string
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  avance_porcentaje: number
  estado: string
  es_critica: boolean
}

type Reporte = {
  fecha: string
  clima: string | null
  observaciones_generales: string | null
  fotos: { url?: string; descripcion?: string }[]
}

type DesglosePeriodo = {
  periodo_inicio: string
  periodo_fin: string
  avance_pct: number
  monto_bruto: number
}

// Actividad individual dentro de un grupo de disciplina (migración 094)
// -- solo trae su avance ACUMULADO actual, sin montos en dinero.
type ActividadDelGrupo = {
  actividad_id: string
  codigo: string | null
  nombre: string
  nombre_en?: string | null
  avance_actual_pct: number
}

// Un renglón del desglose puede venir en dos formatos:
// - Plano (como siempre, por actividad individual) -- proyectos sin
//   disciplina_presupuesto cargada.
// - Agrupado por disciplina (migración 094, trae "actividades") --
//   cuando el proyecto sí tiene esa clasificación.
type DesgloseActividad = {
  actividad_id: string
  actividad_codigo: string | null
  actividad_nombre: string
  // Ausente en facturas generadas antes de la migración 092, o cuando
  // la actividad todavía no tiene nombre en inglés cargado.
  actividad_nombre_en?: string | null
  avance_pct: number
  monto_bruto: number
  // Ausentes en facturas generadas antes de esta migración -- por eso
  // son opcionales.
  monto_amortizado?: number
  monto_neto?: number
  // Presentes solo en el formato agrupado por disciplina.
  disciplina?: string
  disciplina_en?: string
  actividades?: ActividadDelGrupo[]
  // Rango de avance del período (migración 095). Ausente en facturas
  // ya enviadas con el formato de la migración 094 -- esas traen solo
  // "avance_pct" (un único número), que se sigue usando como fallback.
  avance_desde_pct?: number
  avance_hasta_pct?: number
}

type Factura = {
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
  // Ausentes en facturas generadas antes de la migración 092.
  avance_delta_pct?: number | null
  avance_acumulado_pct?: number | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  estado: string
  monto_cobrado: number
}

const estadoProyectoLabel: Record<string, string> = {
  activo: "En ejecución",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
}

const estadoProyectoLabelEn: Record<string, string> = {
  activo: "In progress",
  pausado: "Paused",
  completado: "Completed",
  cancelado: "Cancelled",
}

const estadoActividadLabel: Record<string, string> = {
  no_iniciada: "No iniciada",
  en_progreso: "En progreso",
  completada: "Completada",
  bloqueada: "Bloqueada",
  cancelada: "Cancelada",
}

const estadoActividadLabelEn: Record<string, string> = {
  no_iniciada: "Not started",
  en_progreso: "In progress",
  completada: "Completed",
  bloqueada: "Blocked",
  cancelada: "Cancelled",
}

const estadoFacturaLabel: Record<string, string> = {
  enviada: "Enviada",
  parcialmente_pagada: "Pago parcial",
  pagada: "Pagada",
  vencida: "Vencida",
  en_disputa: "En disputa",
}

// Traducciones de todo el portal según idioma_cliente (migración 096
// extiende el alcance original de la migración 092, que solo cubría
// la sección "Facturas", a las demás secciones: resumen, cronograma,
// reportes).
const estadoFacturaLabelEn: Record<string, string> = {
  enviada: "Sent",
  parcialmente_pagada: "Partially paid",
  pagada: "Paid",
  vencida: "Overdue",
  en_disputa: "In dispute",
}

const t = {
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
    fotosYReportes: "Fotos y reportes de obra",
    sinReportes: "Todavía no hay reportes publicados.",
    cuentaSinProyecto: "Tu cuenta todavía no tiene un proyecto asignado.",
    contactaContacto: "Contacta a tu contacto en Vertikall Haus.",
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
    fotosYReportes: "Site photos and reports",
    sinReportes: "No reports published yet.",
    cuentaSinProyecto: "Your account doesn't have a project assigned yet.",
    contactaContacto: "Contact your Vertikall Haus representative.",
  },
} as const

// Frase equivalente a la que arma generar_facturas_semanales() en
// descripcion (español) -- se reconstruye en el idioma del cliente a
// partir de avance_delta_pct/avance_acumulado_pct (migración 092) en
// vez de traducir ese texto. Si una factura es de antes de esa
// migración y no tiene esos números, cae de vuelta a mostrar la
// descripción tal cual (en español).
function descripcionFactura(f: Factura, en: boolean): string {
  if (!en) return f.descripcion ?? ""
  if (f.avance_delta_pct == null) return f.descripcion ?? ""
  const acumulado = f.avance_acumulado_pct != null ? ` (${f.avance_acumulado_pct}% accumulated)` : ""
  return `Automatic progress estimate — ${f.avance_delta_pct}% additional progress${acumulado}`
}

const estadoFacturaColor: Record<string, string> = {
  enviada: "bg-blue-100 text-blue-700",
  parcialmente_pagada: "bg-amber-100 text-amber-700",
  pagada: "bg-emerald-100 text-emerald-700",
  vencida: "bg-red-100 text-red-700",
  en_disputa: "bg-red-100 text-red-700",
}

function formatoFecha(iso: string | null, en: boolean = false) {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

function formatoMoneda(n: number | null) {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
}

export default async function PortalClientePage() {
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

  const [proyectoRes, avanceRes, avanceGeneralRes, reportesRes, facturasRes] = await Promise.all([
    supabase.rpc("cliente_ver_proyecto"),
    supabase.rpc("cliente_ver_avance"),
    supabase.rpc("cliente_ver_avance_general"),
    supabase.rpc("cliente_ver_reportes"),
    supabase.rpc("cliente_ver_facturas"),
  ])

  const proyecto = proyectoRes.data as Proyecto | null
  const avance = (avanceRes.data ?? []) as Actividad[]
  const reportes = (reportesRes.data ?? []) as Reporte[]
  const facturas = (facturasRes.data ?? []) as Factura[]

  if (!proyecto) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-8 text-center">
        <div>
          <p className="text-slate-600">Tu cuenta todavía no tiene un proyecto asignado.</p>
          <p className="text-sm text-slate-400 mt-1">Contacta a tu contacto en Vertikall Haus.</p>
          <div className="mt-4"><CerrarSesionBoton /></div>
        </div>
      </div>
    )
  }

  // Agrupar avance por proceso, en el orden en que ya vienen ordenadas
  const procesos: { id: string; nombre: string; actividades: Actividad[] }[] = []
  for (const a of avance) {
    let grupo = procesos.find((p) => p.id === a.proceso_id)
    if (!grupo) {
      grupo = { id: a.proceso_id, nombre: a.proceso, actividades: [] }
      procesos.push(grupo)
    }
    grupo.actividades.push(a)
  }

  // Avance general: ponderado por costo de cada actividad (mismo
  // criterio que el dashboard interno y la facturación automática --
  // ver migración 093). Si la función todavía no existe en este
  // ambiente, cae de vuelta al promedio simple para no romper la
  // página.
  const avanceGeneralData = avanceGeneralRes.data as { avance_real_pct?: number; avance_plan_pct?: number } | null
  const avancePromedioSimple = avance.length > 0
    ? Math.round(avance.reduce((sum, a) => sum + (a.avance_porcentaje ?? 0), 0) / avance.length)
    : 0
  const avanceReal = avanceGeneralData?.avance_real_pct != null ? Math.round(avanceGeneralData.avance_real_pct) : avancePromedioSimple
  const avancePlan = avanceGeneralData?.avance_plan_pct != null ? Math.round(avanceGeneralData.avance_plan_pct) : null
  const diferenciaPlan = avancePlan != null ? avanceReal - avancePlan : null

  const totalFacturado = facturas.reduce((sum, f) => sum + Number(f.monto ?? 0), 0)
  const totalCobrado = facturas.reduce((sum, f) => sum + Number(f.monto_cobrado ?? 0), 0)

  // Resumen claro para el cliente: cuánto es anticipo vs. avance de
  // obra, cuánto de cada uno ya se pagó, y cuánto falta contra el
  // contrato completo.
  const facturasAnticipo = facturas.filter((f) => f.numero?.startsWith("ANT-"))
  const facturasAvance = facturas.filter((f) => f.numero?.startsWith("EST-"))
  const anticipoFacturado = facturasAnticipo.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  const anticipoPagado = facturasAnticipo.reduce((s, f) => s + Number(f.monto_cobrado ?? 0), 0)
  const avanceFacturado = facturasAvance.reduce((s, f) => s + Number(f.monto ?? 0), 0)
  const avancePagado = facturasAvance.reduce((s, f) => s + Number(f.monto_cobrado ?? 0), 0)
  const saldoPendienteContrato = Math.max((proyecto.presupuesto_venta ?? 0) - totalCobrado, 0)

  // Idioma del cliente aplicado a todo el portal (migración 096 amplía
  // el alcance original de la migración 092, que solo cubría la
  // sección "Facturas").
  const facturaEnIngles = proyecto.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]
  const estadoProyectoLabelActivo = facturaEnIngles ? estadoProyectoLabelEn : estadoProyectoLabel
  const estadoActividadLabelActivo = facturaEnIngles ? estadoActividadLabelEn : estadoActividadLabel

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo/mark.png" alt="Vertikall Haus" width={36} height={54} className="h-9 w-auto" />
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-[#3B72D8] uppercase">{tf.portalCliente}</p>
              <h1 className="text-lg font-bold text-[#0F2040]">{proyecto.nombre}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <IdiomaToggle idiomaInicial={facturaEnIngles ? "en" : "es"} />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-700">{perfil.nombre_completo}</p>
              <CerrarSesionBoton />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Resumen del proyecto */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400 font-mono">{proyecto.codigo}</p>
              <h2 className="text-xl font-bold text-slate-900">{proyecto.nombre}</h2>
              {proyecto.ubicacion && (
                <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                  <MapPin className="h-3.5 w-3.5" /> {proyecto.ubicacion}
                </p>
              )}
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#3B72D8]/10 text-[#3B72D8]">
              {estadoProyectoLabelActivo[proyecto.estado] ?? proyecto.estado}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {tf.inicio}</p>
              <p className="text-sm font-semibold text-slate-800">{formatoFecha(proyecto.fecha_inicio_real ?? proyecto.fecha_inicio_plan, facturaEnIngles)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {tf.entregaEstimada}</p>
              <p className="text-sm font-semibold text-slate-800">{formatoFecha(proyecto.fecha_fin_forecast ?? proyecto.fecha_fin_plan, facturaEnIngles)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{tf.avanceGeneral}</p>
              <p className="text-sm font-semibold text-slate-800">
                {avanceReal}%
                {avancePlan != null && <span className="text-xs font-normal text-slate-400"> · plan {avancePlan}%</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{tf.montoContratado}</p>
              <p className="text-sm font-semibold text-slate-800">{formatoMoneda(proyecto.presupuesto_venta)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>{tf.avanceRealLabel}</span><span>{avanceReal}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[#3B72D8] transition-all" style={{ width: `${Math.min(100, Math.max(0, avanceReal))}%` }} />
              </div>
            </div>
            {avancePlan != null && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>{tf.avanceSegunPlan}</span><span>{avancePlan}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, avancePlan))}%` }} />
                </div>
              </div>
            )}
            {diferenciaPlan != null && (
              <p className={`text-xs font-medium ${diferenciaPlan >= -3 ? "text-emerald-600" : "text-amber-600"}`}>
                {diferenciaPlan >= 3
                  ? `${tf.adelantadoPlan} ${Math.round(diferenciaPlan)}%`
                  : diferenciaPlan >= -3
                    ? tf.enLineaConPlan
                    : `${Math.abs(Math.round(diferenciaPlan))}% ${tf.detrasDelPlan}`}
              </p>
            )}
          </div>
        </section>

        {/* Cronograma / avance */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <ListChecks className="h-4 w-4 text-slate-400" /> {tf.cronogramaYAvance}
          </h3>
          {procesos.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinActividades}</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
              {procesos.map((proc) => {
                const avanceProc = proc.actividades.length > 0
                  ? Math.round(proc.actividades.reduce((s, a) => s + (a.avance_porcentaje ?? 0), 0) / proc.actividades.length)
                  : 0
                return (
                  <details key={proc.id} className="group p-4">
                    <summary className="flex items-center justify-between gap-2 cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                      <span className="text-sm font-semibold text-slate-800">{proc.nombre}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                        {avanceProc}% · {proc.actividades.length} {proc.actividades.length !== 1 ? tf.actividades : tf.actividad}
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="space-y-3 mt-4">
                      {proc.actividades.map((a) => (
                        <div key={a.actividad_id}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm text-slate-700 truncate">{a.nombre}</span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {estadoActividadLabelActivo[a.estado] ?? a.estado} · {Math.round(a.avance_porcentaje ?? 0)}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${a.estado === "completada" ? "bg-emerald-500" : "bg-[#3B72D8]"}`}
                              style={{ width: `${Math.min(100, Math.max(0, a.avance_porcentaje ?? 0))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          )}
        </section>

        {/* Reportes y fotos */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Camera className="h-4 w-4 text-slate-400" /> {tf.fotosYReportes}
          </h3>
          {reportes.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinReportes}</p>
          ) : (
            <div className="space-y-4">
              {reportes.map((r, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-800">{formatoFecha(r.fecha, facturaEnIngles)}</p>
                    {r.clima && <span className="text-xs text-slate-400">{r.clima}</span>}
                  </div>
                  {r.observaciones_generales && (
                    <p className="text-sm text-slate-600 mb-3">{r.observaciones_generales}</p>
                  )}
                  {r.fotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {r.fotos.map((foto, fi) => (
                        foto?.url ? (
                          <a key={fi} href={foto.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={foto.url} alt={foto.descripcion ?? ""} className="w-full h-28 object-cover" />
                          </a>
                        ) : null
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Facturas */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Receipt className="h-4 w-4 text-slate-400" /> {tf.facturas}
          </h3>
          {facturas.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">{tf.sinFacturas}</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50">
                <div>
                  <p className="text-xs text-slate-400">{tf.anticipo}</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatoMoneda(anticipoPagado)}
                    <span className="text-xs font-normal text-slate-400"> {tf.pagado}</span>
                  </p>
                  {anticipoFacturado > anticipoPagado && (
                    <p className="text-[11px] text-amber-600">{tf.deFacturado} {formatoMoneda(anticipoFacturado)} {tf.facturado}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400">{tf.avanceObra}</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatoMoneda(avancePagado)}
                    <span className="text-xs font-normal text-slate-400"> {tf.pagado}</span>
                  </p>
                  {avanceFacturado > avancePagado && (
                    <p className="text-[11px] text-amber-600">{tf.deFacturado} {formatoMoneda(avanceFacturado)} {tf.facturado}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400">{tf.totalPagado}</p>
                  <p className="text-sm font-semibold text-emerald-600">{formatoMoneda(totalCobrado)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">{tf.saldoPendiente}</p>
                  <p className="text-sm font-semibold text-amber-600">{formatoMoneda(saldoPendienteContrato)}</p>
                  <p className="text-[11px] text-slate-400">{tf.deContratado} {formatoMoneda(proyecto.presupuesto_venta)} {tf.contratado}</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {facturas.map((f) => {
                  const bruto = f.monto + (f.amortizacion_anticipo ?? 0) + (f.retencion ?? 0)
                  const tieneDesglose = (f.desglose_periodos?.length ?? 0) > 1
                  const tieneDesgloseActividades = (f.desglose_actividades?.length ?? 0) > 0
                  return (
                    <div key={f.id} className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{f.numero ?? tf.sinNumero} {f.hito_asociado ? `· ${f.hito_asociado}` : ""}</p>
                          <p className="text-xs text-slate-400">
                            {descripcionFactura(f, facturaEnIngles)} · {tf.vence} {formatoFecha(f.fecha_vencimiento, facturaEnIngles)}
                            {f.periodo_inicio && f.periodo_fin ? ` · ${tf.periodo} ${formatoFecha(f.periodo_inicio, facturaEnIngles)} ${tf.al} ${formatoFecha(f.periodo_fin, facturaEnIngles)}` : ""}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-800 shrink-0">{formatoMoneda(f.monto)}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${estadoFacturaColor[f.estado] ?? "bg-slate-100 text-slate-600"}`}>
                          {(facturaEnIngles ? estadoFacturaLabelEn : estadoFacturaLabel)[f.estado] ?? f.estado}
                        </span>
                      </div>

                      {(f.amortizacion_anticipo > 0 || f.retencion > 0 || tieneDesglose || tieneDesgloseActividades) && (
                        <div className="mt-2 ml-0 bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-1.5">
                          {tieneDesglose && (
                            <div className="space-y-1 mb-2">
                              <p className="text-[11px] font-medium text-slate-500">{tf.cubreMasDeUnPeriodo}</p>
                              {f.desglose_periodos!.map((d, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-slate-500">
                                  <span>{formatoFecha(d.periodo_inicio, facturaEnIngles)} {tf.al} {formatoFecha(d.periodo_fin, facturaEnIngles)} · {d.avance_pct}% {tf.avanceLabel}</span>
                                  <span>{formatoMoneda(d.monto_bruto)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {tieneDesgloseActividades && (
                            <div className="mb-2 rounded-lg overflow-hidden border border-slate-100">
                              <p className="text-[11px] font-medium text-slate-500 px-2 pt-2 pb-1 bg-white">{tf.detallePorActividad}</p>
                              <table className="w-full text-xs">
                                <thead className="bg-slate-100">
                                  <tr className="text-slate-400">
                                    <th className="text-left font-medium px-2 py-1">{tf.renglon}</th>
                                    <th className="text-right font-medium px-2 py-1">{tf.pctAvance}</th>
                                    <th className="text-right font-medium px-2 py-1">{tf.ejecutado}</th>
                                    <th className="text-right font-medium px-2 py-1">{tf.amortAnticipo}</th>
                                    <th className="text-right font-medium px-2 py-1">{tf.aCobrar}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {f.desglose_actividades!.map((d) => {
                                    const tieneAmortizacion = d.monto_amortizado !== undefined && d.monto_neto !== undefined
                                    // Formato agrupado por disciplina (migración 094): fila con $
                                    // + sub-filas de actividades solo con su avance actual, sin $.
                                    if (d.actividades) {
                                      const nombreDisciplina = facturaEnIngles ? (d.disciplina_en || d.disciplina) : d.disciplina
                                      return (
                                        <Fragment key={`grupo-${nombreDisciplina}`}>
                                          <tr className="text-slate-800 bg-slate-50/70">
                                            <td className="px-2 py-1 font-semibold">{nombreDisciplina}</td>
                                            <td className="text-right px-2 py-1 font-semibold">
                                              {d.avance_desde_pct !== undefined ? `${d.avance_desde_pct}%-${d.avance_hasta_pct}%` : `${d.avance_pct}%`}
                                            </td>
                                            <td className="text-right px-2 py-1 font-semibold">{formatoMoneda(d.monto_bruto)}</td>
                                            <td className="text-right px-2 py-1 font-semibold text-amber-600">
                                              {tieneAmortizacion && d.monto_amortizado! > 0 ? `−${formatoMoneda(d.monto_amortizado!)}` : "—"}
                                            </td>
                                            <td className="text-right px-2 py-1 font-semibold text-slate-700">
                                              {formatoMoneda(tieneAmortizacion ? d.monto_neto! : d.monto_bruto)}
                                            </td>
                                          </tr>
                                          {d.actividades.map((sub) => {
                                            const nombreSub = facturaEnIngles ? (sub.nombre_en || sub.nombre) : sub.nombre
                                            return (
                                              <tr key={sub.actividad_id} className="text-slate-400">
                                                <td className="pl-5 pr-2 py-1">{sub.codigo ? `${sub.codigo} — ` : ""}{nombreSub}</td>
                                                <td className="text-right px-2 py-1" colSpan={4}>{sub.avance_actual_pct}% {tf.avanceActual}</td>
                                              </tr>
                                            )
                                          })}
                                        </Fragment>
                                      )
                                    }
                                    // Formato plano (proyectos sin disciplina_presupuesto).
                                    const nombreMostrado = facturaEnIngles ? (d.actividad_nombre_en || d.actividad_nombre) : d.actividad_nombre
                                    return (
                                      <tr key={d.actividad_id} className="text-slate-500">
                                        <td className="px-2 py-1">{d.actividad_codigo ? `${d.actividad_codigo} — ` : ""}{nombreMostrado}</td>
                                        <td className="text-right px-2 py-1 text-slate-400">{d.avance_pct}%</td>
                                        <td className="text-right px-2 py-1">{formatoMoneda(d.monto_bruto)}</td>
                                        <td className="text-right px-2 py-1 text-amber-600">
                                          {tieneAmortizacion && d.monto_amortizado! > 0 ? `−${formatoMoneda(d.monto_amortizado!)}` : "—"}
                                        </td>
                                        <td className="text-right px-2 py-1 font-medium text-slate-700">
                                          {formatoMoneda(tieneAmortizacion ? d.monto_neto! : d.monto_bruto)}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{tf.avanceReconocido}</span>
                            <span>{formatoMoneda(bruto)}</span>
                          </div>
                          {f.amortizacion_anticipo > 0 && (
                            <div className="flex items-center justify-between text-xs text-amber-600">
                              <span>{tf.amortizacionAplicada}</span>
                              <span>−{formatoMoneda(f.amortizacion_anticipo)}</span>
                            </div>
                          )}
                          {f.retencion > 0 && (
                            <div className="flex items-center justify-between text-xs text-amber-600">
                              <span>{tf.retencion}</span>
                              <span>−{formatoMoneda(f.retencion)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pt-1 border-t border-slate-200">
                            <span>{tf.totalAPagar}</span>
                            <span>{formatoMoneda(f.monto)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <div className="sm:hidden flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-sm text-slate-600">{perfil.nombre_completo}</span>
          <CerrarSesionBoton />
        </div>
      </main>
    </div>
  )
}
