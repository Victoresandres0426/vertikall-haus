"use client"

import { useState } from "react"
import { ChevronRight, Clock, AlertTriangle, CheckCircle, Circle, Ban, Play } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { EstadoActividad, NivelAlerta } from "@/types/database"

const procesosDemo = [
  {
    id: "1",
    codigo: "P-01",
    nombre: "Cimentación",
    actividades: [
      { id: "a1", codigo: "C-01", nombre: "Excavación y nivelación", estado: "completada" as EstadoActividad, avance: 100, plan: 100, riesgo: "verde" as NivelAlerta, critica: false, inicio: "2026-05-01", fin: "2026-05-05", holgura: 0 },
      { id: "a2", codigo: "C-02", nombre: "Trazo y replanteo", estado: "completada" as EstadoActividad, avance: 100, plan: 100, riesgo: "verde" as NivelAlerta, critica: false, inicio: "2026-05-06", fin: "2026-05-07", holgura: 2 },
      { id: "a3", codigo: "C-03", nombre: "Armado y colado de cimentación", estado: "completada" as EstadoActividad, avance: 100, plan: 100, riesgo: "verde" as NivelAlerta, critica: true, inicio: "2026-05-08", fin: "2026-05-20", holgura: 0 },
    ]
  },
  {
    id: "2",
    codigo: "P-02",
    nombre: "Estructura",
    actividades: [
      { id: "a4", codigo: "E-01", nombre: "Columnas y trabes primer nivel", estado: "completada" as EstadoActividad, avance: 100, plan: 100, riesgo: "verde" as NivelAlerta, critica: true, inicio: "2026-05-21", fin: "2026-06-05", holgura: 0 },
      { id: "a5", codigo: "E-02", nombre: "Losa de entrepiso", estado: "completada" as EstadoActividad, avance: 100, plan: 100, riesgo: "amarillo" as NivelAlerta, critica: true, inicio: "2026-06-06", fin: "2026-06-20", holgura: 0 },
      { id: "a6", codigo: "E-03", nombre: "Muros de mampostería", estado: "en_progreso" as EstadoActividad, avance: 78, plan: 85, riesgo: "amarillo" as NivelAlerta, critica: false, inicio: "2026-07-01", fin: "2026-08-20", holgura: 4 },
    ]
  },
  {
    id: "3",
    codigo: "P-03",
    nombre: "Instalaciones",
    actividades: [
      { id: "a7", codigo: "I-01", nombre: "Plomería hidráulica", estado: "en_progreso" as EstadoActividad, avance: 45, plan: 50, riesgo: "verde" as NivelAlerta, critica: false, inicio: "2026-07-15", fin: "2026-09-10", holgura: 7 },
      { id: "a8", codigo: "E-04", nombre: "Instalación eléctrica y canaleta", estado: "en_progreso" as EstadoActividad, avance: 32, plan: 47, riesgo: "rojo" as NivelAlerta, critica: true, inicio: "2026-07-15", fin: "2026-08-17", holgura: 0 },
      { id: "a9", codigo: "I-03", nombre: "Instalación de gas", estado: "no_iniciada" as EstadoActividad, avance: 0, plan: 0, riesgo: "verde" as NivelAlerta, critica: false, inicio: "2026-09-01", fin: "2026-09-20", holgura: 5 },
    ]
  },
  {
    id: "4",
    codigo: "P-04",
    nombre: "Acabados",
    actividades: [
      { id: "a10", codigo: "A-01", nombre: "Ventanería de cristal templado", estado: "no_iniciada" as EstadoActividad, avance: 0, plan: 0, riesgo: "amarillo" as NivelAlerta, critica: true, inicio: "2026-09-05", fin: "2026-09-25", holgura: 0 },
      { id: "a11", codigo: "A-08", nombre: "Drywall y cancelería", estado: "en_progreso" as EstadoActividad, avance: 62, plan: 70, riesgo: "verde" as NivelAlerta, critica: false, inicio: "2026-08-01", fin: "2026-09-15", holgura: 3 },
      { id: "a12", codigo: "A-12", nombre: "Pintura primer y acabado", estado: "no_iniciada" as EstadoActividad, avance: 0, plan: 0, riesgo: "verde" as NivelAlerta, critica: false, inicio: "2026-10-01", fin: "2026-10-30", holgura: 5 },
    ]
  },
]

const EstadoIcon = ({ estado }: { estado: EstadoActividad }) => {
  const props = { className: "h-4 w-4 shrink-0" }
  switch (estado) {
    case "completada": return <CheckCircle {...props} className={cn(props.className, "text-emerald-600")} />
    case "en_progreso": return <Play {...props} className={cn(props.className, "text-blue-600")} />
    case "bloqueada": return <Ban {...props} className={cn(props.className, "text-red-600")} />
    case "no_iniciada": return <Circle {...props} className={cn(props.className, "text-slate-300")} />
    case "cancelada": return <Ban {...props} className={cn(props.className, "text-slate-400")} />
  }
}

export default function ActividadesPage() {
  const [procesosExpandidos, setProcesosExpandidos] = useState<Set<string>>(new Set(["2", "3"]))

  const toggleProceso = (id: string) => {
    setProcesosExpandidos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalActividades = procesosDemo.flatMap(p => p.actividades)
  const criticas = totalActividades.filter(a => a.critica)
  const enRiesgo = totalActividades.filter(a => a.riesgo !== "verde")

  return (
    <div>
      <Header
        titulo="Actividades"
        subtitulo="Vista jerárquica — Proyecto: Residencia Lomas Fase II"
        acciones={
          <Button size="sm">
            + Nueva actividad
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Resumen ruta crítica */}
        <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold text-sm">Ruta crítica del proyecto</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {criticas.length} actividades críticas · 0 días de holgura
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-white">{enRiesgo.length}</p>
              <p className="text-xs text-slate-400">En riesgo</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-400">+14 días</p>
              <p className="text-xs text-slate-400">Forecast vs. plan</p>
            </div>
            <Button size="sm" variant="outline" className="text-white border-white/30 hover:bg-white/10">
              Ver Gantt
            </Button>
          </div>
        </div>

        {/* Lista jerárquica Proceso → Actividad */}
        <div className="space-y-2">
          {procesosDemo.map((proceso) => {
            const expandido = procesosExpandidos.has(proceso.id)
            const actCompletadas = proceso.actividades.filter(a => a.estado === "completada").length
            const pctProceso = Math.round((actCompletadas / proceso.actividades.length) * 100)

            return (
              <div key={proceso.id} className="rounded-xl overflow-hidden border border-slate-200">
                {/* Header del proceso */}
                <button
                  onClick={() => toggleProceso(proceso.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                >
                  <ChevronRight className={cn(
                    "h-4 w-4 text-slate-400 transition-transform shrink-0",
                    expandido && "rotate-90"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{proceso.codigo}</span>
                      <span className="font-semibold text-slate-900 text-sm">{proceso.nombre}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>{actCompletadas}/{proceso.actividades.length} completadas</span>
                    <div className="w-24">
                      <Progress value={pctProceso} size="sm" />
                    </div>
                    <span className="font-semibold text-slate-700">{pctProceso}%</span>
                  </div>
                </button>

                {/* Actividades del proceso */}
                {expandido && (
                  <div className="divide-y divide-slate-100">
                    {proceso.actividades.map((act) => (
                      <div
                        key={act.id}
                        className={cn(
                          "flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors",
                          act.critica && "border-l-2 border-l-orange-500"
                        )}
                      >
                        <div className="w-6 flex justify-center shrink-0">
                          <EstadoIcon estado={act.estado} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-slate-400">{act.codigo}</span>
                            <span className="text-sm font-medium text-slate-800">{act.nombre}</span>
                            {act.critica && (
                              <Badge variant="destructive" className="text-[10px] py-0">
                                Crítica
                              </Badge>
                            )}
                            {act.riesgo !== "verde" && (
                              <AlertaBadge nivel={act.riesgo} />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            <span>{act.inicio} → {act.fin}</span>
                            {act.holgura > 0 && <span className="text-emerald-600">+{act.holgura}d holgura</span>}
                            {act.holgura === 0 && act.estado !== "completada" && (
                              <span className="text-red-500 font-medium">Sin holgura</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          {act.estado !== "completada" && act.estado !== "no_iniciada" && (
                            <div className="flex items-center gap-2 w-40">
                              <Progress
                                value={act.avance}
                                colorClass={act.avance < act.plan ? "bg-red-500" : "bg-emerald-500"}
                                size="sm"
                              />
                              <span className={cn(
                                "text-xs font-semibold w-14 text-right",
                                act.avance < act.plan ? "text-red-600" : "text-emerald-600"
                              )}>
                                {act.avance}% / {act.plan}%
                              </span>
                            </div>
                          )}
                          {act.estado === "completada" && (
                            <Badge variant="success">✓ Completada</Badge>
                          )}
                          {act.estado === "no_iniciada" && (
                            <Badge variant="secondary">Pendiente</Badge>
                          )}
                          <Button size="sm" variant="ghost" className="text-xs">
                            Ver
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
