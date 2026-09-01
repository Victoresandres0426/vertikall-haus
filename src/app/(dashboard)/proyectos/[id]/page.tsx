import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Header } from "@/components/layout/header"
import Link from "next/link"
import {
  Building2, Calendar, DollarSign, TrendingUp, TrendingDown,
  Minus, CheckCircle, Clock, AlertTriangle, ChevronLeft,
  Users, Activity, GitMerge, Shield, QrCode, LogIn, LogOut
} from "lucide-react"
import { CircularProgress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { EquipoProyecto, type TrabajadorEquipo } from "./equipo-proyecto"
import { ClienteEmail } from "./cliente-email"
import { TelefonoCliente } from "./telefono-cliente"
import { CoordenadasObra } from "./coordenadas-obra"
import { HoraEntrada } from "./hora-entrada"
import { ArchivosProyecto, type ArchivoProyecto } from "./archivos-proyecto"
import { EstadoProyecto } from "./estado-proyecto"

// ── Tipos ────────────────────────────────────────────────────

type Proyecto = {
  id: string; codigo: string; nombre: string; cliente: string | null
  cliente_email: string | null
  cliente_telefono: string | null
  coordenadas: { lat: number; lng: number } | null
  hora_entrada_esperada: string | null
  ubicacion: string | null; estado: string
  fecha_inicio_plan: string; fecha_fin_plan: string
  fecha_inicio_real: string | null; fecha_fin_forecast: string | null
  presupuesto_base: number; presupuesto_venta: number; margen_objetivo: number
}

type RegistroAsistenciaQR = {
  id: string
  tipo: "entrada" | "salida"
  hora: string
  nombre_manual: string | null
  cierre_automatico: boolean
  motivo_cierre: string | null
  llegada_tarde: boolean
  minutos_tarde: number | null
  horas_extra: number | null
  trabajador: { nombre_completo: string } | null
}

type Proceso = {
  id: string; codigo: string; nombre: string; orden: number
  actividades: Actividad[]
}

type Actividad = {
  id: string; codigo: string; nombre: string
  avance_porcentaje: number; estado: string
  costo_presupuesto: number; costo_real: number
  fecha_fin_plan: string | null; fecha_fin_forecast: string | null
  es_critica: boolean; disciplina: string | null
}

type IIDPSnapshot = {
  id: string; fecha: string; score_total: number
  score_cronograma: number; score_finanzas: number
  score_productividad: number; score_calidad: number
  score_logistica: number; score_gestion: number
  tendencia: string | null
}

type Alerta = {
  id: string; titulo: string; nivel: string
  tipo: string; estado: string; created_at: string
}

type ChangeOrder = {
  id: string; numero: string | null; titulo: string
  estado: string; impacto_costo: number; impacto_dias: number
}

type CostoReal = { tipo_recurso: string; monto: number }

// ── Fetch ────────────────────────────────────────────────────

async function getData(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Verificar que el proyecto pertenece a la empresa del usuario
  const { data: proyecto } = await supabase
    .from("proyectos")
    .select(`
      id, codigo, nombre, cliente, cliente_email, cliente_telefono, coordenadas, hora_entrada_esperada, ubicacion, estado,
      fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_forecast,
      presupuesto_base, presupuesto_venta, margen_objetivo
    `)
    .eq("id", id)
    .single()

  if (!proyecto) notFound()

  // "Hoy" en la fecha LOCAL de la obra (México), no en UTC del servidor
  // -- de noche, UTC ya es el día siguiente y esto hacía que "Registros
  // de hoy" nunca encontrara los check-ins recién hechos.
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })

  // Queries paralelas (core — siempre disponibles)
  const [procesosRes, iidpRes, alertasRes, coRes, costosRes] = await Promise.all([
    supabase
      .from("procesos")
      .select(`
        id, codigo, nombre, orden,
        actividades (
          id, codigo, nombre, avance_porcentaje, estado,
          costo_presupuesto, costo_real, fecha_fin_plan, fecha_fin_forecast,
          es_critica, disciplina
        )
      `)
      .eq("proyecto_id", id)
      .order("orden"),

    supabase
      .from("iidp_snapshots")
      .select(`id, fecha, score_total, score_cronograma, score_finanzas,
        score_productividad, score_calidad, score_logistica, score_gestion, tendencia`)
      .eq("proyecto_id", id)
      .order("fecha", { ascending: false })
      .limit(6),

    supabase
      .from("alertas")
      .select("id, titulo, nivel, tipo, estado, created_at")
      .eq("proyecto_id", id)
      .eq("estado", "activa")
      .order("nivel"),

    supabase
      .from("change_orders")
      .select("id, numero, titulo, estado, impacto_costo, impacto_dias")
      .eq("proyecto_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("costos_reales")
      .select("tipo_recurso, monto")
      .eq("proyecto_id", id),
  ])

  // Queries opcionales — requieren migraciones 007/008; si no existen, no rompen la página
  let qrToken: string | null = null
  try {
    const qrRes = await supabase.from("proyectos").select("qr_token").eq("id", id).single()
    if (!qrRes.error) qrToken = (qrRes.data as any)?.qr_token ?? null
  } catch { /* migración no aplicada aún */ }

  const asistenciaHoyData: RegistroAsistenciaQR[] = []
  if (qrToken) {
    try {
      const res = await supabase
        .from("registros_asistencia_qr")
        .select("id, tipo, hora, nombre_manual, cierre_automatico, motivo_cierre, llegada_tarde, minutos_tarde, horas_extra, trabajador:trabajador_id(nombre_completo)")
        .eq("proyecto_id", id)
        .eq("fecha", hoy)
        .order("hora", { ascending: false })
        .limit(20)
      if (!res.error && res.data) asistenciaHoyData.push(...(res.data as unknown as RegistroAsistenciaQR[]))
    } catch { /* migración no aplicada aún */ }
  }

  // ── Perfil del usuario (para gestión de equipo) ─────────────
  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()

  const ROLES_GESTION = ['capataz', 'project_manager', 'administrador', 'dueno', 'superadmin']
  const puedeGestionarEquipo = !!perfil && ROLES_GESTION.includes(perfil.rol)

  const ROLES_CLIENTE = ['project_manager', 'administrador', 'dueno', 'superadmin']
  const puedeEditarCliente = !!perfil && ROLES_CLIENTE.includes(perfil.rol)
  const esDueno = !!perfil && perfil.rol === 'dueno'

  // ── Equipo autorizado (requiere migration 009) ────────────────
  let equipoAuth: TrabajadorEquipo[] = []
  let equipoDisponibles: TrabajadorEquipo[] = []

  // Nota: trabajadores tiene RLS restringida a roles de gestión (salario, datos
  // personales), así que aquí se usa trabajadores_directorio_empresa(), que solo
  // expone campos no sensibles a cualquier usuario autenticado (migración 035).
  const eqRes = await supabase
    .from("proyecto_trabajadores")
    .select("trabajador_id")
    .eq("proyecto_id", id)
    .eq("autorizado", true)

  if (!eqRes.error && eqRes.data && perfil?.empresa_id) {
    const { data: directorioRaw } = await supabase.rpc("trabajadores_directorio_empresa")
    const directorio = new Map(
      ((directorioRaw ?? []) as (TrabajadorEquipo & { activo: boolean })[]).map((t) => [t.id, t])
    )

    const autorizadosIds = new Set((eqRes.data as { trabajador_id: string }[]).map(pt => pt.trabajador_id))

    equipoAuth = Array.from(autorizadosIds)
      .map((tid) => directorio.get(tid))
      .filter((t): t is TrabajadorEquipo & { activo: boolean } => t != null)
      .map((t) => ({
        id: t.id,
        nombre_completo: t.nombre_completo,
        rol_obra: t.rol_obra ?? null,
        especialidad: t.especialidad ?? null,
      }))

    // Workers in the empresa not yet in this project
    equipoDisponibles = Array.from(directorio.values())
      .filter((t) => t.activo !== false && !autorizadosIds.has(t.id))
      .sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo))
      .map((t) => ({
        id: t.id,
        nombre_completo: t.nombre_completo,
        rol_obra: t.rol_obra ?? null,
        especialidad: t.especialidad ?? null,
      }))
  }

  // Archivos del proyecto (requiere migración 037; si no existe, no rompe la página)
  let archivos: ArchivoProyecto[] = []
  try {
    const archivosRes = await supabase
      .from("proyecto_archivos")
      .select("id, categoria, nombre_archivo, storage_path, tamano_bytes, subido_por, created_at, perfiles_usuario ( nombre_completo )")
      .eq("proyecto_id", id)
      .order("created_at", { ascending: false })
    if (!archivosRes.error && archivosRes.data) {
      archivos = (archivosRes.data as any[]).map((a) => ({
        id: a.id,
        categoria: a.categoria,
        nombre_archivo: a.nombre_archivo,
        storage_path: a.storage_path,
        tamano_bytes: a.tamano_bytes,
        subido_por: a.subido_por,
        subido_por_nombre: a.perfiles_usuario?.nombre_completo ?? null,
        created_at: a.created_at,
      }))
    }
  } catch { /* migración no aplicada aún */ }

  return {
    proyecto: proyecto as Proyecto,
    archivos,
    usuarioId: user.id,
    procesos: (procesosRes.data ?? []) as unknown as Proceso[],
    iidp: (iidpRes.data ?? []) as unknown as IIDPSnapshot[],
    alertas: (alertasRes.data ?? []) as unknown as Alerta[],
    changeOrders: (coRes.data ?? []) as unknown as ChangeOrder[],
    costos: (costosRes.data ?? []) as unknown as CostoReal[],
    qrToken,
    asistenciaHoy: asistenciaHoyData,
    esDueno,
    equipoAuth,
    equipoDisponibles,
    puedeGestionarEquipo,
    puedeEditarCliente,
  }
}

// ── Helpers ──────────────────────────────────────────────────

function formatMXN(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
}

const estadoColor: Record<string, string> = {
  completada: "bg-emerald-100 text-emerald-700",
  en_progreso: "bg-blue-100 text-blue-700",
  no_iniciada: "bg-slate-100 text-slate-500",
  bloqueada: "bg-red-100 text-red-600",
  cancelada: "bg-slate-100 text-slate-400 line-through",
}

const nivelAlertaColor: Record<string, string> = {
  rojo: "bg-red-100 text-red-700 border-red-200",
  amarillo: "bg-amber-100 text-amber-700 border-amber-200",
  verde: "bg-emerald-100 text-emerald-700 border-emerald-200",
}

const dimensiones = [
  { key: "score_cronograma", label: "Cronograma" },
  { key: "score_finanzas", label: "Finanzas" },
  { key: "score_productividad", label: "Productividad" },
  { key: "score_calidad", label: "Calidad" },
  { key: "score_logistica", label: "Logística" },
  { key: "score_gestion", label: "Gestión" },
] as const

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-600"
  if (s >= 60) return "text-amber-600"
  return "text-red-600"
}
function scoreBar(s: number) {
  if (s >= 80) return "bg-emerald-500"
  if (s >= 60) return "bg-amber-500"
  return "bg-red-500"
}

function TendIcon({ t }: { t: string | null }) {
  if (t === "mejorando") return <TrendingUp className="h-4 w-4 text-emerald-600" />
  if (t === "empeorando" || t === "deteriorando") return <TrendingDown className="h-4 w-4 text-red-600" />
  return <Minus className="h-4 w-4 text-slate-400" />
}

// ── Page ─────────────────────────────────────────────────────

export default async function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { proyecto, archivos, usuarioId, procesos, iidp, alertas, changeOrders, costos, qrToken, asistenciaHoy, esDueno, equipoAuth, equipoDisponibles, puedeGestionarEquipo, puedeEditarCliente } = await getData(id)

  const ultimoIIDP = iidp[0] ?? null

  // Cálculos de presupuesto
  const costoTotal = costos.reduce((s, c) => s + (c.monto ?? 0), 0)
  const desviacionCosto = costoTotal - proyecto.presupuesto_base
  const desviacionPct = proyecto.presupuesto_base > 0
    ? ((costoTotal - proyecto.presupuesto_base) / proyecto.presupuesto_base) * 100 : 0

  // Avance global (promedio ponderado de actividades)
  const todasActividades = procesos.flatMap((p) => p.actividades)
  const avanceGlobal = todasActividades.length > 0
    ? todasActividades.reduce((s, a) => s + (a.avance_porcentaje ?? 0), 0) / todasActividades.length
    : 0

  const actividadesCriticas = todasActividades.filter((a) => a.es_critica && a.estado !== "completada")

  // Change orders aprobados
  const coAprobados = changeOrders.filter((co) => ["aprobado", "facturado", "cobrado"].includes(co.estado))
  const coImpacto = coAprobados.reduce((s, co) => s + (co.impacto_costo ?? 0), 0)

  // Costos por tipo
  const costosPorTipo = costos.reduce((acc: Record<string, number>, c) => {
    acc[c.tipo_recurso] = (acc[c.tipo_recurso] ?? 0) + c.monto
    return acc
  }, {})

  const tipoLabel: Record<string, string> = {
    mano_obra: "Mano de obra", material: "Materiales",
    equipo: "Equipo", subcontrato: "Subcontrato", indirecto: "Indirecto"
  }

  return (
    <div>
      {/* Header con breadcrumb */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link
          href="/proyectos"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Proyectos
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs text-slate-400">{proyecto.codigo}</span>
              <EstadoProyecto proyectoId={proyecto.id} estadoInicial={proyecto.estado} puedeEditar={puedeEditarCliente} />
            </div>
            <h1 className="text-xl font-bold text-slate-900">{proyecto.nombre}</h1>
            {proyecto.cliente && <p className="text-sm text-slate-500 mt-0.5">{proyecto.cliente}</p>}
            <div className="mt-1 space-y-1">
              <ClienteEmail proyectoId={proyecto.id} emailInicial={proyecto.cliente_email} puedeEditar={puedeEditarCliente} />
              <TelefonoCliente proyectoId={proyecto.id} telefonoInicial={proyecto.cliente_telefono} puedeEditar={puedeEditarCliente} />
              <CoordenadasObra proyectoId={proyecto.id} coordenadasIniciales={proyecto.coordenadas} puedeEditar={puedeEditarCliente} />
              <HoraEntrada proyectoId={proyecto.id} horaInicial={proyecto.hora_entrada_esperada} puedeEditar={puedeEditarCliente} />
            </div>
          </div>
          {ultimoIIDP && (
            <div className="shrink-0 flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-slate-400">IIDP</p>
                <div className="flex items-center gap-1">
                  <TendIcon t={ultimoIIDP.tendencia} />
                </div>
              </div>
              <CircularProgress value={Math.round(ultimoIIDP.score_total)} size={60} strokeWidth={5} />
            </div>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-5xl">

        {/* ── Métricas rápidas ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Avance global",
              val: `${Math.round(avanceGlobal)}%`,
              color: avanceGlobal >= 80 ? "text-emerald-600" : avanceGlobal >= 50 ? "text-blue-600" : "text-slate-700",
            },
            {
              label: "Costo real vs base",
              val: `${desviacionCosto >= 0 ? "+" : ""}${formatMXN(desviacionCosto)}`,
              color: desviacionCosto > 0 ? "text-red-600" : "text-emerald-600",
            },
            {
              label: "Alertas activas",
              val: alertas.length,
              color: alertas.some((a) => a.nivel === "rojo") ? "text-red-600"
                : alertas.length > 0 ? "text-amber-600" : "text-emerald-600",
            },
            {
              label: "Change orders",
              val: changeOrders.length,
              color: "text-slate-700",
            },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Fechas y ubicación ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Fechas del proyecto</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: "Inicio plan", val: formatDate(proyecto.fecha_inicio_plan) },
              { label: "Fin plan", val: formatDate(proyecto.fecha_fin_plan) },
              { label: "Inicio real", val: formatDate(proyecto.fecha_inicio_real) },
              { label: "Fin forecast", val: formatDate(proyecto.fecha_fin_forecast) },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                <p className="font-medium text-slate-700">{item.val}</p>
              </div>
            ))}
          </div>
          {proyecto.ubicacion && (
            <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
              📍 {proyecto.ubicacion}
            </p>
          )}
        </div>

        {/* ── Presupuesto ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Presupuesto y costos</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {[
              { label: "Presupuesto base", val: formatMXN(proyecto.presupuesto_base), color: "text-slate-700" },
              { label: "Presupuesto venta", val: formatMXN(proyecto.presupuesto_venta), color: "text-slate-700" },
              { label: "Costo real acum.", val: formatMXN(costoTotal), color: desviacionCosto > 0 ? "text-red-600" : "text-emerald-600" },
              {
                label: "Desviación",
                val: `${desviacionCosto >= 0 ? "+" : ""}${desviacionPct.toFixed(1)}%`,
                color: desviacionPct > 10 ? "text-red-600" : desviacionPct > 5 ? "text-amber-600" : "text-emerald-600"
              },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xs text-slate-400 mb-0.5">{s.label}</p>
                <p className={cn("text-lg font-bold", s.color)}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Desglose por tipo */}
          {Object.keys(costosPorTipo).length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2">Desglose por tipo de recurso</p>
              <div className="space-y-1.5">
                {Object.entries(costosPorTipo)
                  .sort(([, a], [, b]) => b - a)
                  .map(([tipo, monto]) => {
                    const pct = costoTotal > 0 ? (monto / costoTotal) * 100 : 0
                    return (
                      <div key={tipo} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-28 shrink-0">{tipoLabel[tipo] ?? tipo}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div className="bg-slate-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-16 text-right">{formatMXN(monto)}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {coImpacto > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">+ Impacto de change orders aprobados</span>
              <span className="font-semibold text-red-600">+{formatMXN(coImpacto)}</span>
            </div>
          )}
        </div>

        {/* ── IIDP ── */}
        {ultimoIIDP && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Desempeño IIDP</h2>
              <span className="text-xs text-slate-400">· {formatDate(ultimoIIDP.fecha)}</span>
              <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                <TendIcon t={ultimoIIDP.tendencia} />
                {ultimoIIDP.tendencia ?? "estable"}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <CircularProgress value={Math.round(ultimoIIDP.score_total)} size={72} strokeWidth={6} />
              <div className="flex-1 space-y-1.5">
                {dimensiones.map(({ key, label }) => {
                  const val = Math.round((ultimoIIDP as unknown as Record<string, number>)[key] ?? 0)
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className={cn("h-1.5 rounded-full", scoreBar(val))} style={{ width: `${val}%` }} />
                      </div>
                      <span className={cn("text-xs font-bold w-8 text-right", scoreColor(val))}>{val}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Alertas activas ── */}
        {alertas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Alertas activas</h2>
              <span className="text-xs text-slate-400">· {alertas.length}</span>
            </div>
            <div className="space-y-2">
              {alertas.map((a) => (
                <div key={a.id} className={cn("border rounded-lg px-4 py-3 flex items-center gap-3", nivelAlertaColor[a.nivel] ?? "bg-slate-50 border-slate-200")}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.titulo}</p>
                    <p className="text-xs opacity-70 capitalize">{a.tipo}</p>
                  </div>
                  <span className="text-xs opacity-70 shrink-0">{formatDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Actividades críticas ── */}
        {actividadesCriticas.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Ruta crítica activa</h2>
              <span className="text-xs text-slate-400">· {actividadesCriticas.length} actividad{actividadesCriticas.length !== 1 ? "es" : ""}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {actividadesCriticas.map((a, i) => (
                <div key={a.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 ? "border-t border-slate-50" : "")}>
                  <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{a.nombre}</p>
                    <p className="text-xs text-slate-400">{a.codigo} · {a.disciplina}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-700">{Math.round(a.avance_porcentaje ?? 0)}%</p>
                    <p className="text-xs text-slate-400">{formatDate(a.fecha_fin_forecast)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Procesos y actividades ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Procesos y actividades</h2>
            <span className="text-xs text-slate-400">· {todasActividades.length} actividades</span>
          </div>
          <div className="space-y-4">
            {procesos.map((proc) => {
              const avanceProceso = proc.actividades.length > 0
                ? proc.actividades.reduce((s, a) => s + (a.avance_porcentaje ?? 0), 0) / proc.actividades.length
                : 0
              return (
                <div key={proc.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {/* Header del proceso */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{proc.codigo}</span>
                      <h3 className="text-sm font-semibold text-slate-700">{proc.nombre}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-1.5">
                        <div
                          className={cn("h-1.5 rounded-full", scoreBar(avanceProceso))}
                          style={{ width: `${avanceProceso}%` }}
                        />
                      </div>
                      <span className={cn("text-xs font-bold", scoreColor(avanceProceso))}>
                        {Math.round(avanceProceso)}%
                      </span>
                    </div>
                  </div>

                  {/* Actividades */}
                  <div className="divide-y divide-slate-50">
                    {proc.actividades.map((act) => (
                      <div key={act.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                        {act.es_critica && (
                          <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" title="Ruta crítica" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-slate-400 shrink-0">{act.codigo}</span>
                            <span className="text-sm text-slate-700 truncate">{act.nombre}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 hidden sm:block">
                            <div
                              className={cn("h-1.5 rounded-full", scoreBar(act.avance_porcentaje ?? 0))}
                              style={{ width: `${act.avance_porcentaje ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-600 w-8 text-right">
                            {Math.round(act.avance_porcentaje ?? 0)}%
                          </span>
                          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", estadoColor[act.estado] ?? "bg-slate-100 text-slate-500")}>
                            {act.estado.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Change Orders ── */}
        {changeOrders.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <GitMerge className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Change Orders</h2>
              <span className="text-xs text-slate-400">· {changeOrders.length}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
              {changeOrders.map((co) => (
                <div key={co.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {co.numero && (
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{co.numero}</span>
                      )}
                      <span className="text-xs text-slate-500 capitalize">{co.estado.replace(/_/g, " ")}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{co.titulo}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {co.impacto_costo !== 0 && (
                      <p className={cn("text-sm font-bold", co.impacto_costo > 0 ? "text-red-600" : "text-emerald-600")}>
                        {co.impacto_costo > 0 ? "+" : ""}{formatMXN(co.impacto_costo)}
                      </p>
                    )}
                    {co.impacto_dias !== 0 && (
                      <p className="text-xs text-amber-600">+{co.impacto_dias}d</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Equipo en obra ── */}
        <EquipoProyecto
          proyectoId={proyecto.id}
          equipo={equipoAuth}
          disponibles={equipoDisponibles}
          puedeGestionar={puedeGestionarEquipo}
        />

        {/* ── Archivos del proyecto ── */}
        <ArchivosProyecto
          proyectoId={proyecto.id}
          archivosIniciales={archivos}
          usuarioId={usuarioId}
          esDueno={esDueno}
        />

        {/* ── QR Asistencia ── */}
        {qrToken && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Control de asistencia QR</h2>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {/* QR Code */}
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <div className="bg-white border-2 border-slate-200 rounded-xl p-3 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                        `${process.env.NEXT_PUBLIC_APP_URL || "https://vertikall-haus.vercel.app"}/check-in/${qrToken}`
                      )}&size=160x160&bgcolor=ffffff&color=0f172a&margin=4`}
                      alt="QR de asistencia"
                      width={160}
                      height={160}
                      className="rounded"
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-center max-w-[160px]">
                    Los trabajadores escanean este código al llegar y salir
                  </p>
                  <a
                    href={`/check-in/${qrToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Abrir página de check-in ↗
                  </a>
                  <a
                    href={`/imprimir-qr/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Imprimir QR ↗
                  </a>
                </div>

                {/* Asistencia de hoy */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Registros de hoy ({asistenciaHoy.length})
                  </p>
                  {asistenciaHoy.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <QrCode className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Sin registros por hoy</p>
                      <p className="text-xs mt-0.5">Los trabajadores verán este panel al escanear</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {asistenciaHoy.map((r) => {
                        const nombre = (r.trabajador as any)?.nombre_completo ?? r.nombre_manual ?? "Sin nombre"
                        return (
                          <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50">
                            <span className={cn(
                              "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                              r.tipo === "entrada" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                            )}>
                              {r.tipo === "entrada"
                                ? <LogIn className="h-3 w-3" />
                                : <LogOut className="h-3 w-3" />
                              }
                            </span>
                            <span className="flex-1 text-sm font-medium text-slate-700 truncate">
                              {nombre}
                              {r.motivo_cierre === "8_horas" && (
                                <span className="ml-1.5 text-[10px] font-normal text-amber-600">(cierre automático, 8h)</span>
                              )}
                              {r.motivo_cierre === "cambio_proyecto" && (
                                <span className="ml-1.5 text-[10px] font-normal text-amber-600">(cerrado por cambio de proyecto)</span>
                              )}
                              {r.llegada_tarde && (
                                <span className="ml-1.5 text-[10px] font-normal text-red-500">(llegada tarde, +{r.minutos_tarde}min)</span>
                              )}
                              {!!r.horas_extra && r.horas_extra > 0 && (
                                <span className="ml-1.5 text-[10px] font-normal text-blue-600">(+{r.horas_extra}h extra)</span>
                              )}
                            </span>
                            <span className="text-xs text-slate-400 font-mono shrink-0">
                              {r.hora?.substring(0, 5) ?? "—"}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
