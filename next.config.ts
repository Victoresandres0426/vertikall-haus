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

// ─── DATOS DEMO ───────────────────────────────────────────────
const datosIIDP = [
  { semana: "S1", iidp: 82 },
  { semana: "S2", iidp: 79 },
  { semana: "S3", iidp: 75 },
  { semana: "S4", iidp: 71 },
  { semana: "S5", iidp: 68 },
  { semana: "Hoy", iidp: 72 },
]

const alertasDemo = [
  {
    id: "1",
    nivel: "rojo" as const,
    tipo: "Cronograma",
    titulo: "Instalación eléctrica — 3 días de atraso",
    causa: "Falta de material: canaleta 32mm sin confirmar",
    impacto: "$12,400 en riesgo",
    plazo: "Hoy",
    alternativas: 3,
  },
  {
    id: "2",
    nivel: "amarillo" as const,
    tipo: "Costo",
    titulo: "Consumo de concreto +8% sobre presupuesto",
    causa: "Desperdicio excesivo en losa de entrepiso",
    impacto: "$5,200 extra proyectado",
    plazo: "2 días",
    alternativas: 2,
  },
  {
    id: "3",
    nivel: "amarillo" as const,
    tipo: "Logística",
    titulo: "Ventanas especiales — lead time en riesgo",
    causa: "Proveedor confirmó 18 días vs. 14 planeados",
    impacto: "Posible atraso en acabados",
    plazo: "5 días",
    alternativas: 2,
  },
  {
    id: "4",
    nivel: "verde" as const,
    tipo: "Calidad",
    titulo: "Cimentación — inspección aprobada",
    causa: "Todos los parámetros dentro de especificación",
    impacto: "Sin impacto negativo",
    plazo: "—",
    alternativas: 0,
  },
]

const avancePorProceso = [
  { proceso: "Cimentación", plan: 100, real: 100 },
  { proceso: "Estructura", plan: 85, real: 80 },
  { proceso: "Instalaciones", plan: 40, real: 32 },
  { proceso: "Acabados", plan: 10, real: 0 },
  { proceso: "Exterior", plan: 0, real: 0 },
]

const scoreComponentes = [
  { label: "Cronograma", score: 68, peso: "25%" },
  { label: "Finanzas", score: 74, peso: "25%" },
  { label: "Productividad", score: 71, peso: "20%" },
  { label: "Calidad", score: 88, peso: "15%" },
  { label: "Logística", score: 62, peso: "10%" },
  { label: "Gestión", score: 80, peso: "5%" },
]

const kpisCaja = [
  { semana: "Esta", entrada: 45000, salida: 38000 },
  { semana: "S+1", entrada: 0, salida: 52000 },
  { semana: "S+2", entrada: 120000, salida: 41000 },
  { semana: "S+3", entrada: 30000, salida: 38000 },
]

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

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────

export default function DashboardPage() {
  const [proyectoActual] = useState("Residencia Lomas — Fase II")

  return (
    <div className="min-h-screen">
      <Header
        titulo="Dashboard Ejecutivo"
        subtitulo="Hoy, sábado 15 de agosto 2026"
        acciones={<ProyectoSelector proyectoActual={proyectoActual} />}
      />

      <div className="p-6 space-y-6">

        {/* FILA 1: IIDP + KPIs principales */}
        <div className="grid grid-cols-12 gap-4">
          {/* IIDP */}
          <Card className="col-span-12 lg:col-span-4">
            <CardHeader>
              <CardTitle>Índice de Desempeño (IIDP)</CardTitle>
              <CardDescription>Score integral 0–100 · Pesos configurables</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <CircularProgress value={72} size={100} strokeWidth={10} />
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
              {/* Tendencia histórica */}
              <div className="mt-4 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datosIIDP} margin={{ top: 4, right: 0, left: -30, bottom: 0 }}>
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
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-4 content-start">
            <KpiCard
              label="Fecha contractual"
              valor="Nov 30"
              tendencia="neutral"
              sub="Forecast: Dic 14 (+14d)"
              color="warning"
            />
            <KpiCard
              label="Avance físico"
              valor="51%"
              tendencia="down"
              sub="Plan: 57% (-6 pts)"
              color="warning"
            />
            <KpiCard
              label="Presupuesto gastado"
              valor="$1.24M"
              tendencia="down"
              sub="$1.18M planificado (+5.1%)"
              color="warning"
            />
            <KpiCard
              label="Margen proyectado"
              valor="14.2%"
              tendencia="down"
              sub="Objetivo: 18% (riesgo)"
              color="danger"
            />
            <KpiCard
              label="Productividad"
              valor="0.87"
              tendencia="down"
              sub="Rendimiento vs. estándar"
              color="warning"
            />
            <KpiCard
              label="Trabajadores hoy"
              valor="12"
              tendencia="neutral"
              sub="Plan: 14 · 2 ausentes"
              color="default"
            />
            <KpiCard
              label="Caja esta semana"
              valor="$7,000"
              tendencia="up"
              sub="+$45k entrada prevista"
              color="success"
            />
            <KpiCard
              label="Alertas activas"
              valor="3"
              tendencia="neutral"
              sub="1 roja · 2 amarillas"
              color="danger"
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
              <Button variant="outline" size="sm">
                Ver todas <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alertasDemo.map((a) => (
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
                        <p className="text-xs text-slate-600 mt-0.5">{a.causa}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs text-slate-500">
                            <span className="font-medium">Impacto:</span> {a.impacto}
                          </span>
                          <span className="text-xs text-slate-500">
                            <Clock className="h-3 w-3 inline mr-0.5" />
                            Actuar: {a.plazo}
                          </span>
                        </div>
                      </div>
                      {a.nivel !== "verde" && (
                        <Button size="sm" variant="outline" className="shrink-0">
                          <Zap className="h-3.5 w-3.5" />
                          {a.alternativas} opciones
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                <div className="space-y-4">
                  {avancePorProceso.map((p) => (
                    <div key={p.proceso}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium text-slate-700">{p.proceso}</span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-400">Plan {p.plan}%</span>
                          <span className={cn(
                            "font-semibold",
                            p.real < p.plan ? "text-red-600" : "text-emerald-600"
                          )}>
                            Real {p.real}%
                          </span>
                        </div>
                      </div>
                      <div className="relative">
                        <Progress value={p.plan} colorClass="bg-slate-200" size="md" />
                        <div className="absolute inset-0">
                          <Progress
                            value={p.real}
                            colorClass={p.real < p.plan ? "bg-red-500" : "bg-emerald-500"}
                            size="md"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Mini flujo de caja */}
            <Card>
              <CardHeader>
                <CardTitle>Flujo de caja próximas semanas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kpisCaja} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                      <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => `$${(v as number / 1000).toFixed(0)}k`} />
                      <Bar dataKey="entrada" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="salida" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs text-slate-500">Entradas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                    <span className="text-xs text-slate-500">Salidas</span>
                  </div>
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
            <div className="divide-y divide-slate-100">
              {[
                { desc: "Aprobar compra de canaleta eléctrica — Proveedor Electro Norte", rol: "PM / Admin", urgencia: "Hoy", monto: "$3,200" },
                { desc: "Autorizar 2 horas extra × 3 carpinteros esta semana", rol: "PM", urgencia: "Mañana", monto: "$1,800" },
                { desc: "Cotizar proveedor alternativo de ventanas especiales", rol: "Admin", urgencia: "Mañana", monto: "—" },
              ].map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800">{a.desc}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-400">Rol: {a.rol}</span>
                      <span className="text-xs text-slate-400">Monto: {a.monto}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={a.urgencia === "Hoy" ? "destructive" : "secondary"}>
                      {a.urgencia}
                    </Badge>
                    <Button size="sm" variant="outline">Revisar</Button>
                    <Button size="sm">Aprobar</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
