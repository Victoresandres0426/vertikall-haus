"use client"

import { useState } from "react"
import { Plus, Search, MapPin, Calendar, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { Progress, CircularProgress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const proyectosDemo = [
  {
    id: "1",
    codigo: "VH-2024-01",
    nombre: "Residencia Lomas — Fase II",
    cliente: "Familia Rodríguez Pérez",
    ubicacion: "Lomas de Chapultepec, CDMX",
    estado: "activo",
    fecha_fin_plan: "2026-11-30",
    fecha_fin_forecast: "2026-12-14",
    avance_plan: 57,
    avance_real: 51,
    presupuesto: 2100000,
    costo_actual: 1240000,
    margen_objetivo: 18,
    margen_forecast: 14.2,
    iidp: 72,
    alertas_rojas: 1,
    alertas_amarillas: 2,
    responsable: "Ing. Marco Vega",
  },
  {
    id: "2",
    codigo: "VH-2024-02",
    nombre: "Edificio Corporativo Torre Norte",
    cliente: "InverBuild S.A. de C.V.",
    ubicacion: "Polanco, CDMX",
    estado: "activo",
    fecha_fin_plan: "2027-03-15",
    fecha_fin_forecast: "2027-03-15",
    avance_plan: 22,
    avance_real: 24,
    presupuesto: 8500000,
    costo_actual: 1700000,
    margen_objetivo: 20,
    margen_forecast: 21.2,
    iidp: 88,
    alertas_rojas: 0,
    alertas_amarillas: 1,
    responsable: "Ing. Sofía Herrera",
  },
  {
    id: "3",
    codigo: "VH-2023-04",
    nombre: "Remodelación Casa Pedregal",
    cliente: "Sr. Arturo Montoya",
    ubicacion: "El Pedregal, CDMX",
    estado: "completado",
    fecha_fin_plan: "2026-06-30",
    fecha_fin_forecast: "2026-07-08",
    avance_plan: 100,
    avance_real: 100,
    presupuesto: 450000,
    costo_actual: 447000,
    margen_objetivo: 15,
    margen_forecast: 15.8,
    iidp: 91,
    alertas_rojas: 0,
    alertas_amarillas: 0,
    responsable: "Ing. Marco Vega",
  },
]

export default function ProyectosPage() {
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "completado">("todos")

  const proyectosFiltrados = proyectosDemo.filter((p) => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busqueda.toLowerCase())
    const matchEstado = filtroEstado === "todos" || p.estado === filtroEstado
    return matchBusqueda && matchEstado
  })

  return (
    <div>
      <Header
        titulo="Proyectos"
        subtitulo={`${proyectosFiltrados.length} proyecto${proyectosFiltrados.length !== 1 ? "s" : ""} · Multi-proyecto activo`}
        acciones={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nuevo proyecto
          </Button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Filtros */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-sm">
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
                {estado === "todos" ? "Todos" : estado.charAt(0).toUpperCase() + estado.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Resumen rápido */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">2</p>
            <p className="text-sm text-slate-500 mt-0.5">Proyectos activos</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">3</p>
            <p className="text-sm text-slate-500 mt-0.5">Alertas totales</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">$10.55M</p>
            <p className="text-sm text-slate-500 mt-0.5">Presupuesto total</p>
          </div>
        </div>

        {/* Lista de proyectos */}
        <div className="space-y-3">
          {proyectosFiltrados.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow cursor-pointer">
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
                      <Badge variant="secondary" className="font-mono text-xs">{p.codigo}</Badge>
                      <Badge variant={p.estado === "activo" ? "default" : "success"}>
                        {p.estado === "activo" ? "Activo" : "Completado"}
                      </Badge>
                      {p.alertas_rojas > 0 && (
                        <AlertaBadge nivel="rojo" />
                      )}
                      {p.alertas_amarillas > 0 && (
                        <AlertaBadge nivel="amarillo" />
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-slate-900">{p.nombre}</h3>
                    <p className="text-sm text-slate-500">{p.cliente}</p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {p.ubicacion}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {p.estado === "completado" ? "Completado" : `Fin: ${p.fecha_fin_plan}`}
                        {p.fecha_fin_forecast !== p.fecha_fin_plan && p.estado !== "completado" && (
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
                          <strong className={p.avance_real < p.avance_plan ? "text-red-600" : "text-emerald-600"}>
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
                            p.avance_real < p.avance_plan ? "bg-red-500" : "bg-emerald-500"
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
                        ${(p.presupuesto / 1000000).toFixed(2)}M
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Ejecutado</p>
                      <p className="text-sm font-semibold text-slate-900">
                        ${(p.costo_actual / 1000000).toFixed(2)}M
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Margen forecast</p>
                      <p className={cn(
                        "text-sm font-semibold flex items-center justify-end gap-1",
                        p.margen_forecast >= p.margen_objetivo ? "text-emerald-600" : "text-red-600"
                      )}>
                        {p.margen_forecast >= p.margen_objetivo
                          ? <TrendingUp className="h-3.5 w-3.5" />
                          : <TrendingDown className="h-3.5 w-3.5" />
                        }
                        {p.margen_forecast}%
                      </p>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="shrink-0 flex flex-col gap-2">
                    <Button size="sm" variant="outline">
                      Ver detalle
                    </Button>
                    {p.estado === "activo" && (
                      <Button size="sm" variant="ghost" className="text-slate-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {p.alertas_rojas + p.alertas_amarillas} alertas
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
