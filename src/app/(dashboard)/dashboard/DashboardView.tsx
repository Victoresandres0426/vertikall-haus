"use client"

import { useState } from "react"
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  Clock, DollarSign, Users, Package, CheckCircle,
  ArrowRight, Calendar, Zap
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Header, ProyectoSelector } from "@/components/layout/header"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress, CircularProgress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from "recharts"
import type { DashboardData } from "@/lib/dashboard/queries"
import type { Proyecto } from "@/types/database"

// ─── UTILIDADES ───────────────────────────────────────────────

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

function formatMoneda(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toLocaleString("es-MX")}`
}

function diasDiferencia(iso1: string | null, iso2: string | null): number | null {
  if (!iso1 || !iso2) return null
  const ms = new Date(iso2).getTime() - new Date(iso1).getTime()
  return Math.round(ms / 86_400_000)
}

// ─── COMPONENTES ──────────────────────────────────────────────

function KpiCard({
  label, valor, tendencia, sub, color = "default"
}: {
  label: string
  valor: string
  tendencia?: "up" | "down" | "neutral"
  sub?: string
  color?: "default" | "success" | "warning" | "danger"
}) {
  const TIcon = tendencia === "up" ? TrendingUp : tendencia === "down" ? TrendingDown : Minus
  const tColor = tendencia === "up" ? "text-emerald-600" : tendencia === "down" ? "text-red-500" : "text-slate-400"
  const borderColor = {
    default: "border-l-4 border-l-slate-300",
    success: "border-l-4 border-l-emerald-500",
    warning: "border-l-4 border-l-amber-500",
    danger: "border-l-4 border-l-red-500",
  }[color]

  return (
    <Card className={cn(borderColor)}>
      <CardContent className="pt-5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{valor}</p>
        {sub && (
          <div className="flex items-center gap-1 mt-1.5">
            {tendencia && <TIcon className={cn("h-3.5 w-3.5", tColor)} />}
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Estado vacío cuando aún no hay datos reales
function EmptyState({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400 gap-2">
      <Package className="h-10 w-10 opacity-30" />
      <p className="text-sm">{mensaje}</p>
    </div>
  )
}

// ─── VISTA PRINCIPAL ──────────────────────────────────────────

interface Props {
  proyectos: Proyecto[]
  proyectoActualId: string | null
  data: DashboardData
}

export function DashboardView({ proyectos, proyectoActualId, data }: Props) {
  const [selectedId, setSelectedId] = useState(proyectoActualId)

  const {
    proyecto,
    iidpActual,
    iidpHistorial,
    scoreComponentes,
    alertas,
    avancePorProceso,
    kpis,
    alertasActivas,
  } = data

  // Fecha de hoy localizada
  const hoy = new Date().toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  })

  // KPIs calculados
  const atrasoEnDias = diasDiferencia(kpis.fechaFinPlan, kpis.fechaFinForecast)
  const sobrecostoPct = kpis.presupuestoBase > 0
    ? ((kpis.costoReal - kpis.presupuestoBase * (kpis.avancePct / 100)) / (kpis.presupuestoBase * (kpis.avancePct / 100))) * 100
    : 0
  const planAvancePct = (() => {
    // Promedio del avance planeado por proceso
    if (avancePorProceso.length === 0) return 0
    return Math.round(avancePorProceso.reduce((s, p) => s + p.plan_pct, 0) / avancePorProceso.length)
  })()

  const totalAlertasActivas = alertasActivas.rojas + alertasActivas.amarillas

  // Caja semanas (placeholder funcional — en fase futura se conecta a costos programados)
  const kpisCaja = [
    { semana: "Esta", entrada: 0, salida: 0 },
    { semana: "S+1", entrada: 0, salida: 0 },
    { semana: "S+2", entrada: 0, salida: 0 },
    { semana: "S+3", entrada: 0, salida: 0 },
  ]

  const hayDatos = proyecto !== null
  const tituloPagina = proyecto?.nombre ?? "Dashboard Ejecutivo"

  return (
    <div className="min-h-screen">
      <Header
        titulo="Dashboard Ejecutivo"
        subtitulo={`Hoy, ${hoy}`}
        acciones={
          <ProyectoSelector
            proyectos={proyectos}
            proyectoActualId={selectedId}
            onSeleccionar={(id) => {
              setSelectedId(id)
              // Recargar la página con el nuevo proyecto en la URL
              window.location.href = `/dashboard?proyecto=${id}`
            }}
          />
        }
      />

      <div className="p-6 space-y-6">

        {!hayDatos && (
          <Card className="border-dashed border-2 border-slate-200">
            <CardContent className="py-16">
              <EmptyState mensaje="No hay proyectos activos en tu cuenta. Crea uno para empezar a ver datos aquí." />
            </CardContent>
          </Card>
        )}

        {hayDatos && (
          <>
            {/* FILA 1: IIDP + KPIs principales */}
            <div className="grid grid-cols-12 gap-4">
              {/* IIDP */}
              <Card className="col-span-12 lg:col-span-4">
                <CardHeader>
                  <CardTitle>Índice de Desempeño (IIDP)</CardTitle>
                  <CardDescription>Score integral 0–100 · Pesos configurables</CardDescription>
                </CardHeader>
                <CardContent>
                  {scoreComponentes.length === 0 ? (
                    <EmptyState mensaje="Aún no hay snapshots de IIDP. Se generarán automáticamente al enviar reportes diarios." />
                  ) : (
                    <>
                      <div className="flex items-center gap-6">
                        <CircularProgress value={iidpActual} size={100} strokeWidth={10} />
                        <div className="space-y-2 flex-1">
                          {scoreComponentes.map((c) => (
                            <div key={c.label} className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 w-24 shrink-0">{c.label}</span>
                              <Progress
                                value={c.score}
                                size="sm"
                                colorClass={c.score >= 75 ? "bg-emerald-500" : c.score >= 60 ? "bg-amber-500" : "bg-red-500"}
                                className="flex-1"
                              />
                              <span className="text-xs font-semibold text-slate-700 w-7 text-right">{c.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {iidpHistorial.length >= 2 && (
                        <div className="mt-4 h-20">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={iidpHistorial} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
                              <defs>
                                <linearGradient id="gradIIDP" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                              <YAxis domain={[50, 100]} tick={{ fontSize: 10 }} />
                              <Tooltip />
                              <Area type="monotone" dataKey="iidp" stroke="#f59e0b" fill="url(#gradIIDP)" strokeWidth={2} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* KPIs */}
              <div className="col-span-12 lg:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-4 content-start">
                <KpiCard
                  label="Fecha contractual"
                  valor={formatFecha(kpis.fechaFinPlan)}
                  tendencia={atrasoEnDias && atrasoEnDias > 0 ? "down" : "neutral"}
                  sub={
                    atrasoEnDias
                      ? `Forecast: ${formatFecha(kpis.fechaFinForecast)} (${atrasoEnDias > 0 ? "+" : ""}${atrasoEnDias}d)`
                      : kpis.fechaFinForecast ? `Forecast: ${formatFecha(kpis.fechaFinForecast)}` : undefined
                  }
                  color={atrasoEnDias && atrasoEnDias > 7 ? "danger" : atrasoEnDias && atrasoEnDias > 0 ? "warning" : "default"}
                />
                <KpiCard
                  label="Avance físico"
                  valor={`${kpis.avancePct}%`}
                  tendencia={kpis.avancePct < planAvancePct ? "down" : kpis.avancePct > planAvancePct ? "up" : "neutral"}
                  sub={planAvancePct > 0 ? `Plan: ${planAvancePct}% (${kpis.avancePct - planAvancePct > 0 ? "+" : ""}${kpis.avancePct - planAvancePct} pts)` : undefined}
                  color={kpis.avancePct < planAvancePct - 10 ? "danger" : kpis.avancePct < planAvancePct ? "warning" : "success"}
                />
                <KpiCard
                  label="Presupuesto gastado"
                  valor={formatMoneda(kpis.costoReal)}
                  tendencia={sobrecostoPct > 5 ? "down" : "neutral"}
                  sub={kpis.presupuestoBase > 0 ? `Base: ${formatMoneda(kpis.presupuestoBase)} (${sobrecostoPct > 0 ? "+" : ""}${sobrecostoPct.toFixed(1)}%)` : undefined}
                  color={sobrecostoPct > 10 ? "danger" : sobrecostoPct > 5 ? "warning" : "default"}
                />
                <KpiCard
                  label="Margen objetivo"
                  valor={`${kpis.margenObjetivo}%`}
                  tendencia="neutral"
                  sub="Meta del proyecto"
                  color={kpis.margenObjetivo < 15 ? "warning" : "success"}
                />
                <KpiCard
                  label="IIDP actual"
                  valor={iidpActual > 0 ? `${iidpActual}` : "—"}
                  tendencia={iidpActual >= 75 ? "up" : iidpActual >= 60 ? "neutral" : "down"}
                  sub={iidpActual >= 75 ? "Buen desempeño" : iidpActual >= 60 ? "Atención requerida" : iidpActual > 0 ? "En riesgo" : "Sin datos aún"}
                  color={iidpActual >= 75 ? "success" : iidpActual >= 60 ? "warning" : iidpActual > 0 ? "danger" : "default"}
                />
                <KpiCard
                  label="Trabajadores hoy"
                  valor={kpis.trabajadoresHoy > 0 ? `${kpis.trabajadoresHoy}` : "—"}
                  tendencia="neutral"
                  sub={kpis.trabajadoresHoy > 0 ? "En sitio hoy" : "Sin reporte de hoy"}
                  color="default"
                />
                <KpiCard
                  label="Alertas activas"
                  valor={`${totalAlertasActivas}`}
                  tendencia={totalAlertasActivas > 0 ? "down" : "up"}
                  sub={
                    totalAlertasActivas > 0
                      ? `${alertasActivas.rojas} roja${alertasActivas.rojas !== 1 ? "s" : ""} · ${alertasActivas.amarillas} amarilla${alertasActivas.amarillas !== 1 ? "s" : ""}`
                      : "Sin alertas activas"
                  }
                  color={alertasActivas.rojas > 0 ? "danger" : alertasActivas.amarillas > 0 ? "warning" : "success"}
                />
                <KpiCard
                  label="Presupuesto base"
                  valor={kpis.presupuestoBase > 0 ? formatMoneda(kpis.presupuestoBase) : "—"}
                  tendencia="neutral"
                  sub="Total del contrato"
                  color="default"
                />
              </div>
            </div>

            {/* FILA 2: Alertas + Avance por proceso */}
            <div className="grid grid-cols-12 gap-4">
              {/* Alertas */}
              <Card className="col-span-12 lg:col-span-7">
                <CardHeader className="flex-row items-center justify-between">
                  <div>
                    <CardTitle>Alertas activas</CardTitle>
                    <CardDescription>Ordenadas por severidad · Incluye alternativas de acción</CardDescription>
                  </div>
                  <a
                    href="/alertas"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Ver todas <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </CardHeader>
                <CardContent>
                  {alertas.length === 0 ? (
                    <EmptyState mensaje="No hay alertas activas. El proyecto está bajo control." />
                  ) : (
                    <div className="space-y-3">
                      {alertas.slice(0, 5).map((a) => (
                        <div
                          key={a.id}
                          className={cn(
                            "rounded-lg border p-3.5",
                            a.nivel === "rojo" ? "bg-red-50 border-red-200" :
                            a.nivel === "amarillo" ? "bg-amber-50 border-amber-200" :
                            "bg-emerald-50 border-emerald-200"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <AlertaBadge nivel={a.nivel} />
                                <Badge variant="secondary" className="text-xs">{a.tipo}</Badge>
                              </div>
                              <p className="text-sm font-semibold text-slate-900">{a.titulo}</p>
                              <p className="text-xs text-slate-600 mt-0.5">{a.que_ocurrio}</p>
                              <div className="flex items-center gap-4 mt-2">
                                {a.impacto_financiero && (
                                  <span className="text-xs text-slate-500">
                                    <span className="font-medium">Impacto:</span> {formatMoneda(a.impacto_financiero)}
                                  </span>
                                )}
                                {a.fecha_limite_accion && (
                                  <span className="text-xs text-slate-500">
                                    <Clock className="h-3 w-3 inline mr-0.5" />
                                    Actuar: {formatFecha(a.fecha_limite_accion)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {a.nivel !== "verde" && a.alternativas && a.alternativas.length > 0 && (
                              <Button size="sm" variant="outline" className="shrink-0">
                                <Zap className="h-3.5 w-3.5" />
                                {a.alternativas.length} opciones
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Avance por proceso */}
              <div className="col-span-12 lg:col-span-5 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Avance por proceso</CardTitle>
                    <CardDescription>Plan vs. Real al día de hoy</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {avancePorProceso.length === 0 ? (
                      <EmptyState mensaje="No hay procesos definidos para este proyecto." />
                    ) : (
                      <div className="space-y-4">
                        {avancePorProceso.map((p) => (
                          <div key={p.id}>
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-sm font-medium text-slate-700">{p.nombre}</span>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-slate-400">Plan {p.plan_pct}%</span>
                                <span className={cn(
                                  "font-semibold",
                                  p.real_pct < p.plan_pct ? "text-red-600" : "text-emerald-600"
                                )}>
                                  Real {p.real_pct}%
                                </span>
                              </div>
                            </div>
                            <div className="relative">
                              <Progress value={p.plan_pct} colorClass="bg-slate-200" size="md" />
                              <div className="absolute inset-0">
                                <Progress
                                  value={p.real_pct}
                                  colorClass={p.real_pct < p.plan_pct ? "bg-red-500" : "bg-emerald-500"}
                                  size="md"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Mini flujo de caja */}
                <Card>
                  <CardHeader>
                    <CardTitle>Flujo de caja próximas semanas</CardTitle>
                    <CardDescription className="text-xs text-slate-400">Próximamente — módulo de costos</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center h-36 gap-2 text-slate-300">
                      <DollarSign className="h-8 w-8" />
                      <p className="text-xs text-slate-400 text-center">El flujo de caja se conectará<br />al módulo de presupuesto (Fase 7)</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* FILA 3: Acciones pendientes */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Acciones pendientes de decisión</CardTitle>
                  <CardDescription>Requieren tu autorización hoy</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {alertas.filter((a) => a.nivel !== "verde" && a.alternativas?.length > 0).length === 0 ? (
                  <EmptyState mensaje="No hay acciones pendientes de decisión en este momento." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {alertas
                      .filter((a) => a.nivel !== "verde" && a.alternativas?.length > 0)
                      .slice(0, 3)
                      .map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-4 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800">{a.titulo}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-slate-400">Rol: {a.rol_que_decide ?? "PM"}</span>
                              {a.impacto_financiero && (
                                <span className="text-xs text-slate-400">Impacto: {formatMoneda(a.impacto_financiero)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={a.nivel === "rojo" ? "destructive" : "secondary"}>
                              {a.nivel === "rojo" ? "Hoy" : "Esta semana"}
                            </Badge>
                            <Button size="sm" variant="outline">Revisar</Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
