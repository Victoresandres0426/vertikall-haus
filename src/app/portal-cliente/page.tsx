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

type Factura = {
  id: string
  numero: string | null
  descripcion: string | null
  hito_asociado: string | null
  monto: number
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

const estadoFacturaColor: Record<string, string> = {
  enviada: "bg-blue-100 text-blue-700",
  parcialmente_pagada: "bg-amber-100 text-amber-700",
  pagada: "bg-emerald-100 text-emerald-700",
  vencida: "bg-red-100 text-red-700",
  en_disputa: "bg-red-100 text-red-700",
}

function formatoFecha(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
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
            <Receipt className="h-4 w-4 text-slate-400" /> Facturas
          </h3>
          {facturas.length === 0 ? (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">Aún no hay facturas emitidas.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
                <div>
                  <p className="text-xs text-slate-400">Total facturado</p>
                  <p className="text-sm font-semibold text-slate-800">{formatoMoneda(totalFacturado)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Total pagado</p>
                  <p className="text-sm font-semibold text-emerald-600">{formatoMoneda(totalCobrado)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Saldo pendiente</p>
                  <p className="text-sm font-semibold text-amber-600">{formatoMoneda(totalFacturado - totalCobrado)}</p>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {facturas.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{f.numero ?? "Sin número"} {f.hito_asociado ? `· ${f.hito_asociado}` : ""}</p>
                      <p className="text-xs text-slate-400">{f.descripcion ?? ""} · Vence {formatoFecha(f.fecha_vencimiento)}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 shrink-0">{formatoMoneda(f.monto)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${estadoFacturaColor[f.estado] ?? "bg-slate-100 text-slate-600"}`}>
                      {estadoFacturaLabel[f.estado] ?? f.estado}
                    </span>
                  </div>
                ))}
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
