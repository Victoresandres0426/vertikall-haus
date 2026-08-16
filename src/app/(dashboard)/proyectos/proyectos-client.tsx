"use client"

import { useState, useTransition } from "react"
import {
  Plus,
  Search,
  MapPin,
  Calendar,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Trash2,
  X,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { CircularProgress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { eliminarProyecto } from "./actions"

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
type IidpSnapshot = { iidp_global: number; fecha: string }
type AlertaRaw = { nivel: string; estado: string }

export type ProyectoFromDB = {
  id: string
  codigo: string
  nombre: string
  cliente: string | null
  ubicacion: string | null
  estado: string
  fecha_fin_plan: string | null
  fecha_fin_forecast: string | null
  avance_plan: number
  avance_real: number
  presupuesto: number
  costo_actual: number
  margen_objetivo: number
  margen_forecast: number
  responsable: string | null
  iidp_snapshots: IidpSnapshot[]
  alertas: AlertaRaw[]
}

type Proyecto = ProyectoFromDB & {
  iidp: number
  alertas_rojas: number
  alertas_amarillas: number
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function procesarProyecto(p: ProyectoFromDB): Proyecto {
  const sorted = [...(p.iidp_snapshots ?? [])].sort((a, b) =>
    b.fecha.localeCompare(a.fecha)
  )
  const iidp = Math.round(sorted[0]?.iidp_global ?? 0)

  const activas = (p.alertas ?? []).filter((a) =>
    ["activa", "en_revision"].includes(a.estado)
  )

  return {
    ...p,
    iidp,
    alertas_rojas: activas.filter((a) => a.nivel === "rojo").length,
    alertas_amarillas: activas.filter((a) => a.nivel === "amarillo").length,
  }
}

function formatMillones(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────
export function ProyectosClient({ proyectos: raw }: { proyectos: ProyectoFromDB[] }) {
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "completado">("todos")
  const [proyectoAEliminar, setProyectoAEliminar] = useState<Proyecto | null>(null)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const proyectos = raw.map(procesarProyecto)

  const proyectosFiltrados = proyectos.filter((p) => {
    const matchBusqueda =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busqueda.toLowerCase())
    const matchEstado = filtroEstado === "todos" || p.estado === filtroEstado
    return matchBusqueda && matchEstado
  })

  const activos = proyectos.filter((p) => p.estado === "activo")
  const totalAlertas = proyectos.reduce(
    (s, p) => s + p.alertas_rojas + p.alertas_amarillas,
    0
  )
  const presupuestoTotal = proyectos.reduce((s, p) => s + (p.presupuesto ?? 0), 0)

  const handleConfirmEliminar = () => {
    if (!proyectoAEliminar) return
    setErrorEliminar(null)
    startTransition(async () => {
      const result = await eliminarProyecto(proyectoAEliminar.id)
      if (result.error) {
        setErrorEliminar(result.error)
      } else {
        setProyectoAEliminar(null)
      }
    })
  }

  return (
    <>
      <div className="p-6 space-y-5">
        {/* Filtros */}
        <div className="flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="Buscar proyecto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(["todos", "activo", "completado"] as const).map((estado) => (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                className={cn(
                  "px-4 py-2 text-sm capitalize transition-colors",
                  filtroEstado === estado
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {estado === "todos"
                  ? "Todos"
                  : estado.charAt(0).toUpperCase() + estado.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Resumen rápido */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{activos.length}</p>
            <p className="text-sm text-slate-500 mt-0.5">Proyectos activos</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{totalAlertas}</p>
            <p className="text-sm text-slate-500 mt-0.5">Alertas totales</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {formatMillones(presupuestoTotal)}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">Presupuesto total</p>
          </div>
        </div>

        {/* Lista de proyectos */}
        {proyectosFiltrados.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg font-medium">Sin proyectos</p>
            <p className="text-sm mt-1">
              {busqueda ? "Intenta otra búsqueda" : "Crea tu primer proyecto"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {proyectosFiltrados.map((p) => (
              <Card
                key={p.id}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="pt-5">
                  <div className="flex items-start gap-5">
                    {/* IIDP circular */}
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <CircularProgress value={p.iidp} size={72} strokeWidth={7} />
                      <span className="text-xs text-slate-400">IIDP</span>
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {p.codigo}
                        </Badge>
                        <Badge variant={p.estado === "activo" ? "default" : "success"}>
                          {p.estado === "activo" ? "Activo" : "Completado"}
                        </Badge>
                        {p.alertas_rojas > 0 && <AlertaBadge nivel="rojo" />}
                        {p.alertas_amarillas > 0 && <AlertaBadge nivel="amarillo" />}
                      </div>

                      <h3 className="text-base font-semibold text-slate-900">{p.nombre}</h3>
                      <p className="text-sm text-slate-500">{p.cliente ?? "—"}</p>

                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                        {p.ubicacion && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {p.ubicacion}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {p.estado === "completado"
                            ? "Completado"
                            : p.fecha_fin_plan
                              ? `Fin: ${p.fecha_fin_plan}`
                              : "Sin fecha"}
                          {p.fecha_fin_forecast &&
                            p.fecha_fin_forecast !== p.fecha_fin_plan &&
                            p.estado !== "completado" && (
                              <span className="text-amber-600 font-medium ml-1">
                                (Forecast: {p.fecha_fin_forecast})
                              </span>
                            )}
                        </span>
                      </div>

                      {/* Avance */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Avance físico</span>
                          <span>
                            Plan <strong>{p.avance_plan}%</strong> · Real{" "}
                            <strong
                              className={
                                p.avance_real < p.avance_plan
                                  ? "text-red-600"
                                  : "text-emerald-600"
                              }
                            >
                              {p.avance_real}%
                            </strong>
                          </span>
                        </div>
                        <div className="relative h-2 rounded-full bg-slate-100">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-slate-200"
                            style={{ width: `${p.avance_plan}%` }}
                          />
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-full",
                              p.avance_real < p.avance_plan
                                ? "bg-red-500"
                                : "bg-emerald-500"
                            )}
                            style={{ width: `${p.avance_real}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Métricas financieras */}
                    <div className="shrink-0 text-right space-y-2 hidden lg:block">
                      <div>
                        <p className="text-xs text-slate-400">Presupuesto</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatMillones(p.presupuesto)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Ejecutado</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatMillones(p.costo_actual)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Margen forecast</p>
                        <p
                          className={cn(
                            "text-sm font-semibold flex items-center justify-end gap-1",
                            p.margen_forecast >= p.margen_objetivo
                              ? "text-emerald-600"
                              : "text-red-600"
                          )}
                        >
                          {p.margen_forecast >= p.margen_objetivo ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {p.margen_forecast}%
                        </p>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="shrink-0 flex flex-col gap-2">
                      <Button size="sm" variant="outline">
                        Ver detalle
                      </Button>
                      {p.estado === "activo" &&
                        p.alertas_rojas + p.alertas_amarillas > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-slate-500"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {p.alertas_rojas + p.alertas_amarillas} alertas
                          </Button>
                        )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setProyectoAEliminar(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmación de eliminación */}
      {proyectoAEliminar && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setProyectoAEliminar(null)
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative">
            <button
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
              onClick={() => setProyectoAEliminar(null)}
              disabled={isPending}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-7 w-7 text-red-600" />
              </div>
            </div>

            <h3 className="text-lg font-semibold text-slate-900 text-center mb-1">
              ¿Eliminar proyecto?
            </h3>
            <p className="text-sm text-slate-500 text-center mb-1">
              <strong className="text-slate-700">{proyectoAEliminar.nombre}</strong>
            </p>
            <p className="text-xs text-slate-400 text-center mb-6">
              El proyecto será archivado. Los datos se conservan y puedes
              restaurarlo contactando a soporte.
            </p>

            {errorEliminar && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 mb-4">
                {errorEliminar}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setProyectoAEliminar(null)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                isLoading={isPending}
                onClick={handleConfirmEliminar}
              >
                Sí, eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
