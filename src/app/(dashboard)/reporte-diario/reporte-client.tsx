"use client"

import { useState, useTransition } from "react"
import {
  CheckCircle, Clock, Send, CloudSun, HardHat, Users,
  ChevronDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input, Textarea } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { crearReporteDiario } from "./actions"

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
export type ActividadDB = {
  id: string
  codigo: string
  nombre: string
  unidad: string | null
  avance_porcentaje: number
  cantidad_objetivo: number | null
  cantidad_ejecutada: number | null
  estado: string
}

export type TrabajadorDB = {
  id: string
  nombre_completo: string
  rol_obra: string | null
  especialidad: string | null
}

export type ProyectoSimple = {
  id: string
  codigo: string
  nombre: string
}

type AsistenciaState = "presente" | "ausente" | "medio_dia"

type TrabajadorLocal = TrabajadorDB & {
  asistencia: AsistenciaState
  horas: number
  extra: number
  motivo?: string
}

type ActividadLocal = ActividadDB & {
  cantidad_hoy: number
  incidencias: string
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fechaHoyISO() {
  const d = new Date()
  return d.toISOString().split("T")[0]
}

function fechaHoyLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(new Date())
}

// ──────────────────────────────────────────────
// Componente
// ──────────────────────────────────────────────
export function ReporteClient({
  proyectos,
  actividadesPorProyecto,
  trabajadores: trabajadoresDB,
}: {
  proyectos: ProyectoSimple[]
  actividadesPorProyecto: Record<string, ActividadDB[]>
  trabajadores: TrabajadorDB[]
}) {
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ?? "")
  const [paso, setPaso] = useState(1)
  const [clima, setClima] = useState("Soleado")
  const [observaciones, setObservaciones] = useState("")
  const [enviado, setEnviado] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [trabajadores, setTrabajadores] = useState<TrabajadorLocal[]>(
    trabajadoresDB.map((t) => ({
      ...t,
      asistencia: "presente" as AsistenciaState,
      horas: 8,
      extra: 0,
    }))
  )

  const [actividades, setActividades] = useState<ActividadLocal[]>(
    (actividadesPorProyecto[proyectos[0]?.id ?? ""] ?? []).map((a) => ({
      ...a,
      cantidad_hoy: 0,
      incidencias: "",
    }))
  )

  const proyectoActual = proyectos.find((p) => p.id === proyectoId)

  // Al cambiar proyecto, actualiza actividades
  const handleCambiarProyecto = (id: string) => {
    setProyectoId(id)
    setActividades(
      (actividadesPorProyecto[id] ?? []).map((a) => ({
        ...a,
        cantidad_hoy: 0,
        incidencias: "",
      }))
    )
    setPaso(1)
  }

  const toggleAsistencia = (id: string, tipo: AsistenciaState) => {
    setTrabajadores((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, asistencia: tipo, horas: tipo === "ausente" ? 0 : tipo === "medio_dia" ? 4 : 8 }
          : t
      )
    )
  }

  const updateCantidad = (id: string, cantidad: number) => {
    setActividades((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        const objetivo = a.cantidad_objetivo ?? 0
        const anterior = a.cantidad_ejecutada ?? 0
        const total = anterior + cantidad
        const pct = objetivo > 0 ? Math.min(100, Math.round((total / objetivo) * 100)) : a.avance_porcentaje
        return { ...a, cantidad_hoy: cantidad, avance_porcentaje: pct }
      })
    )
  }

  const handleEnviar = () => {
    setErrorEnvio(null)
    startTransition(async () => {
      const result = await crearReporteDiario({
        proyecto_id: proyectoId,
        fecha: fechaHoyISO(),
        clima,
        observaciones,
        avances: actividades
          .filter((a) => a.cantidad_hoy > 0)
          .map((a) => ({
            actividad_id: a.id,
            cantidad_ejecutada_dia: a.cantidad_hoy,
            porcentaje_avance_total: a.avance_porcentaje,
            incidencias: a.incidencias || undefined,
          })),
        asistencia: trabajadores
          .filter((t) => t.asistencia !== "ausente")
          .map((t) => ({
            trabajador_id: t.id,
            presente: t.asistencia === "presente",
            horas_regulares: t.horas,
            horas_extra: t.extra,
          })),
      })
      if (result.error) {
        setErrorEnvio(result.error)
      } else {
        setEnviado(true)
      }
    })
  }

  const pasos = [
    { num: 1, label: "Asistencia" },
    { num: 2, label: "Avance" },
    { num: 3, label: "Enviar" },
  ]

  if (proyectos.length === 0) {
    return (
      <div>
        <Header titulo="Reporte Diario" subtitulo="No hay proyectos activos" />
        <div className="p-6 text-center text-slate-400 py-16 border border-dashed border-slate-200 rounded-xl m-6">
          <HardHat className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin proyectos activos</p>
          <p className="text-sm mt-1">Crea un proyecto para empezar a registrar reportes</p>
        </div>
      </div>
    )
  }

  if (enviado) {
    return (
      <div>
        <Header titulo="Reporte Diario" subtitulo={fechaHoyLabel()} />
        <div className="min-h-96 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">¡Reporte enviado!</h2>
            <p className="text-slate-500 mb-1">
              {proyectoActual?.nombre ?? "Proyecto"} · {fechaHoyLabel()}
            </p>
            <p className="text-sm text-slate-400 mb-6">
              Los avances se actualizaron. El sistema detectará alertas automáticamente.
            </p>
            <Button onClick={() => { setEnviado(false); setPaso(1); setObservaciones("") }}>
              Nuevo reporte
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const presentes = trabajadores.filter((t) => t.asistencia === "presente").length
  const totalHoras = trabajadores.reduce((s, t) => s + t.horas + t.extra, 0)

  return (
    <div>
      <Header
        titulo="Reporte Diario"
        subtitulo={`${fechaHoyLabel()} · ${proyectoActual?.nombre ?? ""}`}
        acciones={
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Borrador
          </Badge>
        }
      />

      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {/* Selector de proyecto */}
        {proyectos.length > 1 && (
          <div className="relative">
            <select
              value={proyectoId}
              onChange={(e) => handleCambiarProyecto(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 appearance-none pr-10"
            >
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
        )}

        {/* Progreso de pasos */}
        <div className="flex items-center gap-1">
          {pasos.map((p, i) => (
            <div key={p.num} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => setPaso(p.num)}
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold transition-colors shrink-0",
                  paso === p.num
                    ? "bg-slate-900 text-white"
                    : paso > p.num
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-100 text-slate-400"
                )}
              >
                {paso > p.num ? <CheckCircle className="h-4 w-4" /> : p.num}
              </button>
              <span className={cn("text-sm", paso === p.num ? "text-slate-900 font-medium" : "text-slate-400")}>
                {p.label}
              </span>
              {i < pasos.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-2", paso > p.num ? "bg-emerald-500" : "bg-slate-200")} />
              )}
            </div>
          ))}
        </div>

        {/* ── PASO 1: Asistencia ── */}
        {paso === 1 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <CloudSun className="h-5 w-5 text-amber-500 shrink-0" />
                  <Input
                    label=""
                    placeholder="¿Cómo estuvo el clima hoy?"
                    value={clima}
                    onChange={(e) => setClima(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Asistencia del personal</CardTitle>
                {trabajadores.length > 0 ? (
                  <CardDescription>
                    {presentes} presentes · {trabajadores.filter((t) => t.asistencia === "ausente").length} ausentes
                  </CardDescription>
                ) : (
                  <CardDescription className="text-amber-600">
                    No hay trabajadores registrados en este proyecto aún.
                    Se puede continuar el reporte y registrar solo avance de actividades.
                  </CardDescription>
                )}
              </CardHeader>
              {trabajadores.length > 0 && (
                <CardContent>
                  <div className="space-y-3">
                    {trabajadores.map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "rounded-lg border p-3.5 transition-colors",
                          t.asistencia === "presente" ? "border-emerald-200 bg-emerald-50" :
                          t.asistencia === "ausente" ? "border-red-200 bg-red-50" :
                          "border-amber-200 bg-amber-50"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{t.nombre_completo}</p>
                            <p className="text-xs text-slate-500">{t.rol_obra ?? t.especialidad ?? "—"}</p>
                          </div>
                          <div className="flex gap-1.5">
                            {(["presente", "medio_dia", "ausente"] as AsistenciaState[]).map((tipo) => (
                              <button
                                key={tipo}
                                onClick={() => toggleAsistencia(t.id, tipo)}
                                className={cn(
                                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                                  t.asistencia === tipo
                                    ? tipo === "presente" ? "bg-emerald-600 text-white"
                                      : tipo === "ausente" ? "bg-red-600 text-white"
                                      : "bg-amber-500 text-white"
                                    : "bg-white border border-slate-200 text-slate-600"
                                )}
                              >
                                {tipo === "presente" ? "✓ Presente" :
                                 tipo === "medio_dia" ? "½ Medio día" : "✗ Ausente"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {t.asistencia === "presente" && (
                          <div className="flex gap-3 mt-2.5">
                            <Input
                              label=""
                              type="number"
                              placeholder="Horas regulares"
                              value={t.horas}
                              onChange={(e) =>
                                setTrabajadores((prev) =>
                                  prev.map((w) => w.id === t.id ? { ...w, horas: Number(e.target.value) } : w)
                                )
                              }
                              className="w-32 text-sm"
                            />
                            <Input
                              label=""
                              type="number"
                              placeholder="Horas extra"
                              value={t.extra}
                              onChange={(e) =>
                                setTrabajadores((prev) =>
                                  prev.map((w) => w.id === t.id ? { ...w, extra: Number(e.target.value) } : w)
                                )
                              }
                              className="w-28 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => setPaso(2)}>Continuar con Avance →</Button>
            </div>
          </div>
        )}

        {/* ── PASO 2: Avance ── */}
        {paso === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Avance por actividad</CardTitle>
                <CardDescription>Ingresa la cantidad ejecutada hoy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {actividades.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No hay actividades activas en este proyecto.
                  </p>
                ) : (
                  actividades.map((a) => (
                    <div key={a.id} className="border border-slate-200 rounded-lg p-3.5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{a.nombre}</p>
                          <p className="text-xs text-slate-400 font-mono">{a.codigo}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            placeholder="0"
                            value={a.cantidad_hoy || ""}
                            onChange={(e) => updateCantidad(a.id, Number(e.target.value))}
                            className="w-24 text-sm"
                          />
                          <span className="text-sm text-slate-500 w-10">{a.unidad ?? "und"}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>
                            Acum: {((a.cantidad_ejecutada ?? 0) + a.cantidad_hoy).toFixed(1)} {a.unidad ?? "und"} de {a.cantidad_objetivo ?? "—"}
                          </span>
                          <span className={cn(
                            "font-medium",
                            a.avance_porcentaje >= 100 ? "text-emerald-600" :
                            a.avance_porcentaje >= 80 ? "text-amber-600" : "text-slate-600"
                          )}>
                            {a.avance_porcentaje}%
                          </span>
                        </div>
                        <Progress value={a.avance_porcentaje} showLabel={false} size="sm" />
                      </div>
                      <Input
                        label=""
                        placeholder="Incidencias o bloqueos..."
                        value={a.incidencias}
                        onChange={(e) =>
                          setActividades((prev) =>
                            prev.map((x) => x.id === a.id ? { ...x, incidencias: e.target.value } : x)
                          )
                        }
                        className="mt-2 text-xs"
                      />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPaso(1)}>← Asistencia</Button>
              <Button onClick={() => setPaso(3)}>Revisar y enviar →</Button>
            </div>
          </div>
        )}

        {/* ── PASO 3: Resumen y envío ── */}
        {paso === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resumen del reporte</CardTitle>
                <CardDescription>Revisa antes de enviar. El PM podrá validarlo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={cn("grid gap-3", trabajadores.length > 0 ? "grid-cols-3" : "grid-cols-1")}>
                  {trabajadores.length > 0 && (
                    <>
                      <div className="text-center bg-emerald-50 rounded-lg p-3">
                        <Users className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
                        <p className="text-xl font-bold text-emerald-700">{presentes}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Presentes</p>
                      </div>
                      <div className="text-center bg-red-50 rounded-lg p-3">
                        <p className="text-xl font-bold text-red-600">
                          {trabajadores.filter((t) => t.asistencia === "ausente").length}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">Ausentes</p>
                      </div>
                      <div className="text-center bg-blue-50 rounded-lg p-3">
                        <p className="text-xl font-bold text-blue-700">{totalHoras}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Total horas</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Avances a registrar */}
                {actividades.filter((a) => a.cantidad_hoy > 0).length > 0 && (
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Avances a registrar
                    </p>
                    {actividades
                      .filter((a) => a.cantidad_hoy > 0)
                      .map((a) => (
                        <div key={a.id} className="flex justify-between text-sm">
                          <span className="text-slate-700">{a.nombre}</span>
                          <span className="font-medium text-slate-900">
                            +{a.cantidad_hoy} {a.unidad ?? "und"} → {a.avance_porcentaje}%
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                <Textarea
                  label="Observaciones generales del día"
                  placeholder="Comentarios adicionales para el PM..."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                />

                {errorEnvio && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">
                    {errorEnvio}
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <p className="font-semibold mb-1">⚡ El sistema detectará automáticamente:</p>
                  <ul className="text-xs space-y-0.5 list-disc list-inside text-amber-700">
                    <li>Actividades con atraso vs. plan</li>
                    <li>Impacto en la ruta crítica</li>
                    <li>Alertas nuevas según umbrales configurados</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPaso(2)}>← Avance</Button>
              <Button onClick={handleEnviar} isLoading={isPending} size="lg">
                <Send className="h-4 w-4" />
                Enviar reporte del día
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
