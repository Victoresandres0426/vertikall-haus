"use client"

import { useState } from "react"
import { CheckCircle, Clock, Camera, Plus, Trash2, Send, CloudSun } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input, Textarea } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const trabajadoresDemo = [
  { id: "1", nombre: "Carlos Mendoza", rol: "Carpintero Senior", asistencia: "presente", horas: 8, extra: 0 },
  { id: "2", nombre: "Pedro García", rol: "Electricista", asistencia: "presente", horas: 8, extra: 2 },
  { id: "3", nombre: "Juan López", rol: "Plomero", asistencia: "ausente", horas: 0, extra: 0, motivo: "Enfermedad" },
  { id: "4", nombre: "Martín Ruiz", rol: "Ayudante", asistencia: "presente", horas: 7, extra: 0 },
  { id: "5", nombre: "Roberto Torres", rol: "Ayudante", asistencia: "presente", horas: 8, extra: 0 },
]

const actividadesDemo = [
  { id: "1", nombre: "Instalación canaleta eléctrica", codigo: "E-04", unidad: "ml", plan_acum: 120, real_ant: 95, real_hoy: 0 },
  { id: "2", nombre: "Drywall cuartos 2do piso", codigo: "A-08", unidad: "m2", plan_acum: 80, real_ant: 62, real_hoy: 0 },
  { id: "3", nombre: "Pintura primer en pasillos", codigo: "A-12", unidad: "m2", plan_acum: 140, real_ant: 140, real_hoy: 0 },
]

type Asistencia = "presente" | "ausente" | "medio_dia"

export default function ReporteDiarioPage() {
  const [paso, setPaso] = useState(1)
  const [clima, setClima] = useState("Soleado")
  const [observaciones, setObservaciones] = useState("")
  const [trabajadores, setTrabajadores] = useState(trabajadoresDemo)
  const [actividades, setActividades] = useState(actividadesDemo)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const pasos = [
    { num: 1, label: "Asistencia" },
    { num: 2, label: "Avance" },
    { num: 3, label: "Materiales" },
    { num: 4, label: "Enviar" },
  ]

  const toggleAsistencia = (id: string, tipo: Asistencia) => {
    setTrabajadores(prev => prev.map(t =>
      t.id === id ? { ...t, asistencia: tipo, horas: tipo === "ausente" ? 0 : tipo === "medio_dia" ? 4 : 8 } : t
    ))
  }

  const updateHoras = (id: string, horas: number) => {
    setTrabajadores(prev => prev.map(t => t.id === id ? { ...t, horas } : t))
  }

  const updateAvance = (id: string, cantidad: number) => {
    setActividades(prev => prev.map(a => a.id === id ? { ...a, real_hoy: cantidad } : a))
  }

  const handleEnviar = async () => {
    setEnviando(true)
    await new Promise(r => setTimeout(r, 1500))
    setEnviando(false)
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">¡Reporte enviado!</h2>
          <p className="text-slate-500 mb-6">El sistema procesará los datos y generará alertas automáticamente.</p>
          <Button onClick={() => { setEnviado(false); setPaso(1) }}>Nuevo reporte</Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header
        titulo="Reporte Diario"
        subtitulo="Sábado, 15 de agosto 2026 · Residencia Lomas — Fase II"
        acciones={
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Borrador
          </Badge>
        }
      />

      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {/* Progreso de pasos */}
        <div className="flex items-center gap-1">
          {pasos.map((p, i) => (
            <div key={p.num} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => setPaso(p.num)}
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold transition-colors shrink-0",
                  paso === p.num ? "bg-slate-900 text-white" :
                  paso > p.num ? "bg-emerald-500 text-white" :
                  "bg-slate-100 text-slate-400"
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

        {/* PASO 1: Asistencia */}
        {paso === 1 && (
          <div className="space-y-4">
            {/* Clima rápido */}
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
                <CardDescription>
                  {trabajadores.filter(t => t.asistencia === "presente").length} presentes ·{" "}
                  {trabajadores.filter(t => t.asistencia === "ausente").length} ausentes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trabajadores.map((t) => (
                    <div key={t.id} className={cn(
                      "rounded-lg border p-3.5 transition-colors",
                      t.asistencia === "presente" ? "border-emerald-200 bg-emerald-50" :
                      t.asistencia === "ausente" ? "border-red-200 bg-red-50" :
                      "border-amber-200 bg-amber-50"
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{t.nombre}</p>
                          <p className="text-xs text-slate-500">{t.rol}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {(["presente", "medio_dia", "ausente"] as Asistencia[]).map((tipo) => (
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
                            onChange={(e) => updateHoras(t.id, Number(e.target.value))}
                            className="w-32 text-sm"
                          />
                          <Input
                            label=""
                            type="number"
                            placeholder="Horas extra"
                            value={t.extra}
                            className="w-28 text-sm"
                          />
                        </div>
                      )}
                      {t.asistencia === "ausente" && (
                        <Input
                          label=""
                          placeholder="Motivo de ausencia..."
                          className="mt-2"
                          defaultValue={t.motivo}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => setPaso(2)}>
                Continuar con Avance →
              </Button>
            </div>
          </div>
        )}

        {/* PASO 2: Avance */}
        {paso === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Avance por actividad</CardTitle>
                <CardDescription>Ingresa la cantidad ejecutada hoy en cada actividad activa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {actividades.map((a) => {
                  const totalReal = a.real_ant + a.real_hoy
                  const pctReal = Math.round((totalReal / a.plan_acum) * 100)
                  return (
                    <div key={a.id} className="border border-slate-200 rounded-lg p-3.5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{a.nombre}</p>
                          <p className="text-xs text-slate-400 font-mono">{a.codigo}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="0"
                            value={a.real_hoy || ""}
                            onChange={(e) => updateAvance(a.id, Number(e.target.value))}
                            className="w-24 text-sm"
                          />
                          <span className="text-sm text-slate-500">{a.unidad}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Acumulado real: {totalReal} {a.unidad} de {a.plan_acum}</span>
                          <span className={cn(pctReal >= 100 ? "text-emerald-600" : pctReal >= 80 ? "text-amber-600" : "text-slate-600", "font-medium")}>
                            {pctReal}%
                          </span>
                        </div>
                        <Progress value={pctReal} showLabel={false} size="sm" />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <Textarea
                  label="Incidencias o bloqueos del día"
                  placeholder="¿Hubo algún problema, bloqueo o situación relevante hoy?..."
                  rows={3}
                />
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPaso(1)}>← Asistencia</Button>
              <Button onClick={() => setPaso(3)}>Continuar con Materiales →</Button>
            </div>
          </div>
        )}

        {/* PASO 3: Materiales */}
        {paso === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Consumo de materiales</CardTitle>
                <CardDescription>Registra lo que se consumió hoy en obra</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { material: "Canaleta PVC 32mm", actividad: "Instalación eléctrica", unidad: "ml", consumido: 0 },
                  { material: "Lámina de drywall 1/2\"", actividad: "Drywall cuartos", unidad: "pzas", consumido: 0 },
                ].map((m, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{m.material}</p>
                        <p className="text-xs text-slate-400">{m.actividad}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="0"
                          className="w-20 text-sm"
                        />
                        <span className="text-sm text-slate-500 w-10">{m.unidad}</span>
                        <Input
                          type="number"
                          placeholder="Desperdicio"
                          className="w-24 text-sm"
                        />
                        <span className="text-sm text-slate-500">desp.</span>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full">
                  <Plus className="h-4 w-4" />
                  Agregar material
                </Button>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPaso(2)}>← Avance</Button>
              <Button onClick={() => setPaso(4)}>Revisar y enviar →</Button>
            </div>
          </div>
        )}

        {/* PASO 4: Resumen y envío */}
        {paso === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Resumen del reporte</CardTitle>
                <CardDescription>Revisa antes de enviar. Una vez enviado, el PM puede validarlo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center bg-emerald-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-emerald-700">
                      {trabajadores.filter(t => t.asistencia === "presente").length}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Presentes</p>
                  </div>
                  <div className="text-center bg-red-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-red-600">
                      {trabajadores.filter(t => t.asistencia === "ausente").length}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Ausentes</p>
                  </div>
                  <div className="text-center bg-blue-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-blue-700">
                      {trabajadores.reduce((a, t) => a + t.horas + t.extra, 0)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Total horas</p>
                  </div>
                </div>

                <Textarea
                  label="Observaciones generales del día"
                  placeholder="Comentarios adicionales para el PM..."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                />

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <p className="font-semibold mb-1">⚡ El sistema detectará automáticamente:</p>
                  <ul className="text-xs space-y-0.5 list-disc list-inside text-amber-700">
                    <li>Actividades con atraso vs. plan</li>
                    <li>Materiales con sobreconsumo</li>
                    <li>Alertas nuevas según umbrales configurados</li>
                    <li>Impacto en la ruta crítica</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setPaso(3)}>← Materiales</Button>
              <Button onClick={handleEnviar} isLoading={enviando} size="lg">
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
