import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Image from "next/image"
import { CalendarDays, MapPin, Camera, Receipt, ListChecks } from "lucide-react"
import { CerrarSesionBoton } from "./cerrar-sesion-boton"

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

const estadoActividadLabel: Record<string, string> = {
  no_iniciada: "No iniciada",
  en_progreso: "En progreso",
  completada: "Completada",
  bloqueada: "Bloqueada",
  cancelada: "Cancelada",
}

const estadoFacturaLabel: Record<string, string> = {
  enviada: "Enviada",
  parcialmente_pagada: "Pago parcial",
  pagada: "Pagada",
  vencida: "Vencida",
  en_disputa: "En disputa",
}

// Traducciones para la sección "Facturas" del portal (correo + factura,
// ver migración 092). El resto del portal (cronograma, reportes) sigue
// en español -- ver alcance en el comentario de esa migración.
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
    avanceReconocido: "Avance reconocido este período",
    amortizacionAplicada: "Amortización de anticipo aplicada",
    retencion: "Retención",
    totalAPagar: "Total a pagar",
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
    avanceReconocido: "Progress recognized this period",
    amortizacionAplicada: "Deposit amortization applied",
    retencion: "Retention",
    totalAPagar: "Total due",
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

  const [proyectoRes, avanceRes, reportesRes, facturasRes] = await Promise.all([
    supabase.rpc("cliente_ver_proyecto"),
    supabase.rpc("cliente_ver_avance"),
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

  const avancePromedio = avance.length > 0
    ? Math.round(avance.reduce((sum, a) => sum + (a.avance_porcentaje ?? 0), 0) / avance.length)
    : 0

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

  // Alcance inicial (ver migración 092): solo la sección "Facturas" de
  // este portal respeta el idioma del cliente -- el resto de la página
  // (cronograma, reportes) sigue en español por ahora.
  const facturaEnIngles = proyecto.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo/mark.png" alt="Vertikall Haus" width={36} height={54} className="h-9 w-auto" />
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-[#3B72D8] uppercase">Portal del cliente</p>
              <h1 className="text-lg font-bold text-[#0F2040]">{proyecto.nombre}</h1>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-700">{perfil.nombre_completo}</p>
            <CerrarSesionBoton />
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
              {estadoProyectoLabel[proyecto.estado] ?? proyecto.estado}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Inicio</p>
              <p className="text-sm font-semibold text-slate-800">{formatoFecha(proyecto.fecha_inicio_real ?? proyecto.fecha_inicio_plan)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Entrega estimada</p>
              <p className="text-sm font-semibold text-slate-800">{formatoFecha(proyecto.fecha_fin_forecast ?? proyecto.fecha_fin_plan)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Avance general</p>
              <p className="text-sm font-semibold text-slate-800">{avancePromedio}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Monto contratado</p>
              <p className="text-sm font-semibold text-slate-800">{formatoMoneda(proyecto.presupuesto_venta)}</p>
            </div>
          </div>

          <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-[#3B72D8] transition-all" style={{ width: `${avancePromedio}%` }} />
          </div>
        </section>

        {/* Cronograma / avance */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <ListChecks className="h-4 w-4 text-slate-400" /> Cronograma y avance
          </h3>
          {procesos.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">Aún no hay actividades cargadas.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
              {procesos.map((proc) => (
                <div key={proc.id} className="p-4">
                  <p className="text-sm font-semibold text-slate-800 mb-3">{proc.nombre}</p>
                  <div className="space-y-3">
                    {proc.actividades.map((a) => (
                      <div key={a.actividad_id}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm text-slate-700 truncate">{a.nombre}</span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {estadoActividadLabel[a.estado] ?? a.estado} · {Math.round(a.avance_porcentaje ?? 0)}%
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
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reportes y fotos */}
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Camera className="h-4 w-4 text-slate-400" /> Fotos y reportes de obra
          </h3>
          {reportes.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">Todavía no hay reportes publicados.</p>
          ) : (
            <div className="space-y-4">
              {reportes.map((r, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-800">{formatoFecha(r.fecha)}</p>
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
