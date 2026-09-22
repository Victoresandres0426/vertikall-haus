import Link from "next/link"
import { CalendarDays, MapPin, Camera, Receipt, ListChecks, ClipboardList, ChevronRight } from "lucide-react"
import { PortalHeader } from "./portal-header"
import { SinProyecto } from "./sin-proyecto"
import { CerrarSesionBoton } from "./cerrar-sesion-boton"
import {
  cargarSesionCliente,
  obtenerProyectoCliente,
  estadoProyectoLabel,
  estadoProyectoLabelEn,
  formatoFecha,
  formatoMoneda,
  t,
} from "./_shared"

// Antes esta página tenía TODO el portal apilado en un solo scroll
// (resumen + cronograma + fotos + reportes + facturas) -- el dueño
// pidió partirlo en pantallas separadas para que sea más fácil de usar
// en tablet. Esta quedó como "inicio": resumen del proyecto + 4
// botones grandes, uno por sección, cada uno navega a su propia
// página (con su propio botón de volver).
export default async function PortalClientePage() {
  const { supabase, perfil } = await cargarSesionCliente()
  const proyecto = await obtenerProyectoCliente(supabase)

  const facturaEnIngles = proyecto?.idioma_cliente === "en"
  const tf = t[facturaEnIngles ? "en" : "es"]

  if (!proyecto) {
    return <SinProyecto mensaje={tf.cuentaSinProyecto} contacto={tf.contactaContacto} />
  }

  const [avanceGeneralRes, avanceRes] = await Promise.all([
    supabase.rpc("cliente_ver_avance_general"),
    supabase.rpc("cliente_ver_avance"),
  ])

  const avanceGeneralData = avanceGeneralRes.data as { avance_real_pct?: number; avance_plan_pct?: number } | null
  const avance = (avanceRes.data ?? []) as { avance_porcentaje: number }[]
  const avancePromedioSimple = avance.length > 0
    ? Math.round(avance.reduce((sum, a) => sum + (a.avance_porcentaje ?? 0), 0) / avance.length)
    : 0
  const avanceReal = avanceGeneralData?.avance_real_pct != null ? Math.round(avanceGeneralData.avance_real_pct) : avancePromedioSimple
  const avancePlan = avanceGeneralData?.avance_plan_pct != null ? Math.round(avanceGeneralData.avance_plan_pct) : null
  const diferenciaPlan = avancePlan != null ? avanceReal - avancePlan : null

  const estadoProyectoLabelActivo = facturaEnIngles ? estadoProyectoLabelEn : estadoProyectoLabel

  const secciones = [
    { href: "/portal-cliente/cronograma", icono: ListChecks, titulo: tf.cronogramaYAvance, sub: tf.verCronograma },
    { href: "/portal-cliente/fotos", icono: Camera, titulo: tf.fotosDelProyecto, sub: tf.verFotos },
    { href: "/portal-cliente/reportes", icono: ClipboardList, titulo: tf.fotosYReportes, sub: tf.verReportes },
    { href: "/portal-cliente/facturas", icono: Receipt, titulo: tf.facturas, sub: tf.verFacturas },
  ]

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <PortalHeader
        proyectoNombre={proyecto.nombre}
        idioma={facturaEnIngles ? "en" : "es"}
        nombreCompleto={perfil.nombre_completo}
      />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
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

        {/* Los 4 botones -- uno por sección, cada uno abre su propia pantalla */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {secciones.map((s) => {
            const Icono = s.icono
            return (
              <Link
                key={s.href}
                href={s.href}
                className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-5 hover:border-[#3B72D8]/40 hover:bg-[#3B72D8]/[0.03] transition-colors"
              >
                <div className="h-11 w-11 rounded-xl bg-[#3B72D8]/10 flex items-center justify-center shrink-0">
                  <Icono className="h-5 w-5 text-[#3B72D8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{s.titulo}</p>
                  <p className="text-xs text-slate-400 truncate">{s.sub}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </Link>
            )
          })}
        </section>

        <div className="sm:hidden flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-sm text-slate-600">{perfil.nombre_completo}</span>
          <CerrarSesionBoton />
        </div>
      </main>
    </div>
  )
}
