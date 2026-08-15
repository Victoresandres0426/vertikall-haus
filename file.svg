"use client"

import { useState } from "react"
import { AlertTriangle, Clock, DollarSign, TrendingDown, ChevronDown, ChevronUp, Zap, CheckCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge, AlertaBadge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const alertasDemo = [
  {
    id: "1",
    nivel: "rojo" as const,
    tipo: "Cronograma",
    estado: "activa",
    titulo: "Instalación eléctrica — 3 días de atraso acumulado",
    actividad: "E-04 · Instalación canaleta eléctrica",
    que_ocurrio: "La actividad lleva 3 días de retraso respecto al plan. Al ritmo actual, la fecha de terminación se proyecta 5 días después de lo planificado.",
    causa_probable: "Material clave (canaleta 32mm) no confirmado por proveedor. El electricista perdió un día por espera.",
    desviacion: "-15% vs. plan · 3 días de atraso",
    proyeccion: "Si no se actúa, la instalación terminará el 22 de agosto en lugar del 17. Esto retrasa el inicio de drywall y la inspección eléctrica.",
    impacto_financiero: 12400,
    fecha_limite: "Hoy",
    rol_decide: "Project Manager",
    alternativas: [
      {
        id: "A",
        label: "Compra urgente local",
        descripcion: "Adquirir canaleta 32mm de Electro Norte hoy mismo. Stock disponible.",
        costo_extra: 3200,
        dias_recuperados: 3,
        impacto: "Recupera el retraso completo. Costo adicional por urgencia: +$3,200.",
        recomendada: true,
      },
      {
        id: "B",
        label: "Horas extra",
        descripcion: "3 electricistas, 2 horas extra × 4 días una vez llegue el material.",
        costo_extra: 2100,
        dias_recuperados: 2,
        impacto: "Recupera 2 de 3 días de atraso. Más barato pero no recupera todo el tiempo perdido.",
        recomendada: false,
      },
      {
        id: "C",
        label: "No intervenir",
        descripcion: "Esperar a que llegue el pedido original (2-3 días más).",
        costo_extra: 0,
        dias_recuperados: -2,
        impacto: "El atraso crece a 5 días. Riesgo de afectar la ruta crítica y multas contractuales.",
        recomendada: false,
      },
    ],
  },
  {
    id: "2",
    nivel: "amarillo" as const,
    tipo: "Costo",
    estado: "activa",
    titulo: "Consumo de concreto — tendencia +8% sobre presupuesto",
    actividad: "E-02 · Losa de entrepiso",
    que_ocurrio: "El consumo real de concreto acumula 8% por encima del presupuesto. La losa está terminada pero el desperdicio fue mayor al estimado.",
    causa_probable: "Mezcla de concreto con exceso de agua en días de calor. Desperdicio en bordes no controlado.",
    desviacion: "+8% consumo · $5,200 sobre partida",
    proyeccion: "Si el patrón continúa en cimentación de ampliación, el sobrecosto puede escalar a $18,000 adicionales.",
    impacto_financiero: 5200,
    fecha_limite: "2 días",
    rol_decide: "Project Manager",
    alternativas: [
      {
        id: "A",
        label: "Ajustar procedimiento",
        descripcion: "Reunión con capataz para protocolo de mezcla. Monitoreo diario de desperdicio.",
        costo_extra: 0,
        dias_recuperados: 0,
        impacto: "Previene que el patrón se repita. Sin costo adicional.",
        recomendada: true,
      },
      {
        id: "B",
        label: "Renegociar partida",
        descripcion: "Ajustar presupuesto de concreto con aprobación del dueño.",
        costo_extra: 5200,
        dias_recuperados: 0,
        impacto: "Formaliza el sobrecosto pero reduce el margen del proyecto.",
        recomendada: false,
      },
    ],
  },
  {
    id: "3",
    nivel: "amarillo" as const,
    tipo: "Logística",
    estado: "activa",
    titulo: "Ventanas especiales — riesgo de lead time",
    actividad: "A-01 · Instalación de ventanería de cristal templado",
    que_ocurrio: "El proveedor de ventanas confirmó entrega en 18 días. El plan requería 14 días. La actividad es sucesora de instalación eléctrica.",
    causa_probable: "El proveedor tiene alta demanda. No se confirmó con anticipación suficiente.",
    desviacion: "+4 días lead time",
    proyeccion: "Riesgo de retraso en acabados de 4 días si no se gestiona proveedor alternativo.",
    impacto_financiero: 0,
    fecha_limite: "5 días",
    rol_decide: "Administrador / PM",
    alternativas: [
      {
        id: "A",
        label: "Proveedor alternativo",
        descripcion: "Cotizar Vidrios La Palma (proveedor aprobado). Lead time estimado: 12 días.",
        costo_extra: 1800,
        dias_recuperados: 6,
        impacto: "Resuelve el problema con 2 días de margen. Costo ligeramente mayor.",
        recomendada: true,
      },
      {
        id: "B",
        label: "Negociar prioridad con proveedor actual",
        descripcion: "Solicitar trato preferencial pagando anticipo del 50%.",
        costo_extra: 0,
        dias_recuperados: 2,
        impacto: "Reduce el atraso a 2 días. Depende de respuesta del proveedor.",
        recomendada: false,
      },
    ],
  },
]

function AlertaCard({ alerta }: { alerta: typeof alertasDemo[0] }) {
  const [expandida, setExpandida] = useState(false)
  const [altSeleccionada, setAltSeleccionada] = useState<string | null>(null)
  const [aprobando, setAprobando] = useState(false)
  const [aprobada, setAprobada] = useState(false)

  const handleAprobar = async () => {
    if (!altSeleccionada) return
    setAprobando(true)
    await new Promise(r => setTimeout(r, 1000))
    setAprobando(false)
    setAprobada(true)
  }

  if (aprobada) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
        <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0" />
        <div>
          <p className="font-semibold text-emerald-800">{alerta.titulo}</p>
          <p className="text-sm text-emerald-600">
            Decisión registrada: Opción {altSeleccionada} · El sistema actualizará el plan automáticamente.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Card className={cn(
      "border-l-4",
      alerta.nivel === "rojo" ? "border-l-red-500" : "border-l-amber-500"
    )}>
      <CardContent className="pt-5">
        {/* Header de la alerta */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <AlertaBadge nivel={alerta.nivel} />
              <Badge variant="secondary">{alerta.tipo}</Badge>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Actuar antes: {alerta.fecha_limite}
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-900">{alerta.titulo}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{alerta.actividad}</p>
          </div>
          <button
            onClick={() => setExpandida(!expandida)}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 shrink-0"
          >
            {expandida ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expandida ? "Menos" : "Ver detalle"}
          </button>
        </div>

        {/* Resumen siempre visible */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-xs text-slate-400">Qué ocurrió</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5 line-clamp-2">{alerta.que_ocurrio}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-xs text-slate-400">Desviación</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">{alerta.desviacion}</p>
          </div>
          <div className={cn("rounded-lg p-2.5", alerta.impacto_financiero > 0 ? "bg-red-50" : "bg-slate-50")}>
            <p className="text-xs text-slate-400">Impacto financiero</p>
            <p className={cn("text-sm font-bold mt-0.5", alerta.impacto_financiero > 0 ? "text-red-600" : "text-slate-600")}>
              {alerta.impacto_financiero > 0 ? `$${alerta.impacto_financiero.toLocaleString()}` : "Indirecto"}
            </p>
          </div>
        </div>

        {/* Detalle expandible */}
        {expandida && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Causa probable</p>
                <p className="text-sm text-slate-700">{alerta.causa_probable}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Proyección sin acción</p>
                <p className="text-sm text-slate-700">{alerta.proyeccion}</p>
              </div>
            </div>

            {/* Alternativas */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Alternativas de acción · Decide: {alerta.rol_decide}
              </p>
              <div className="space-y-2">
                {alerta.alternativas.map((alt) => (
                  <button
                    key={alt.id}
                    onClick={() => setAltSeleccionada(alt.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3.5 transition-all",
                      altSeleccionada === alt.id
                        ? "border-slate-900 bg-slate-900 text-white"
                        : alt.recomendada
                        ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-xs font-bold px-1.5 py-0.5 rounded",
                            altSeleccionada === alt.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                          )}>
                            Opción {alt.id}
                          </span>
                          <span className="text-sm font-semibold">{alt.label}</span>
                          {alt.recomendada && altSeleccionada !== alt.id && (
                            <span className="text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                              Recomendada
                            </span>
                          )}
                        </div>
                        <p className={cn("text-xs mt-1", altSeleccionada === alt.id ? "text-white/80" : "text-slate-600")}>
                          {alt.descripcion}
                        </p>
                        <p className={cn("text-xs mt-1 font-medium", altSeleccionada === alt.id ? "text-white/90" : "text-slate-700")}>
                          {alt.impacto}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-xs", altSeleccionada === alt.id ? "text-white/60" : "text-slate-400")}>Costo extra</p>
                        <p className={cn("text-sm font-bold", alt.costo_extra > 0
                          ? altSeleccionada === alt.id ? "text-amber-300" : "text-amber-600"
                          : altSeleccionada === alt.id ? "text-emerald-300" : "text-emerald-600")}>
                          {alt.costo_extra > 0 ? `+$${alt.costo_extra.toLocaleString()}` : "Sin costo"}
                        </p>
                        <p className={cn("text-xs mt-0.5", altSeleccionada === alt.id ? "text-white/60" : "text-slate-400")}>Días recuperados</p>
                        <p className={cn("text-sm font-bold", alt.dias_recuperados > 0
                          ? altSeleccionada === alt.id ? "text-emerald-300" : "text-emerald-600"
                          : altSeleccionada === alt.id ? "text-red-300" : "text-red-500")}>
                          {alt.dias_recuperados > 0 ? `+${alt.dias_recuperados}d` : `${alt.dias_recuperados}d`}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Botón de decisión */}
            {altSeleccionada && (
              <div className="flex items-center justify-between bg-slate-900 rounded-lg p-3.5">
                <div>
                  <p className="text-sm font-semibold text-white">
                    Confirmar: Opción {altSeleccionada} — {alerta.alternativas.find(a => a.id === altSeleccionada)?.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    La decisión quedará registrada con tu nombre, rol y fecha.
                  </p>
                </div>
                <Button
                  onClick={handleAprobar}
                  isLoading={aprobando}
                  className="bg-white text-slate-900 hover:bg-slate-100 shrink-0"
                >
                  Aprobar decisión
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AlertasPage() {
  const [filtroNivel, setFiltroNivel] = useState<"todas" | "rojo" | "amarillo" | "verde">("todas")

  const alertasFiltradas = alertasDemo.filter(a =>
    filtroNivel === "todas" || a.nivel === filtroNivel
  )

  return (
    <div>
      <Header
        titulo="Centro de Alertas"
        subtitulo="Motor de alertas y decisiones · Ordenadas por severidad e impacto"
      />

      <div className="p-6 space-y-5">
        {/* Resumen de severidades */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setFiltroNivel(filtroNivel === "rojo" ? "todas" : "rojo")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              filtroNivel === "rojo" ? "border-red-500 bg-red-500 text-white" : "bg-red-50 border-red-200 hover:border-red-300"
            )}
          >
            <p className={cn("text-3xl font-bold", filtroNivel === "rojo" ? "text-white" : "text-red-600")}>1</p>
            <p className={cn("text-sm font-medium mt-0.5 flex items-center gap-1.5", filtroNivel === "rojo" ? "text-red-100" : "text-red-700")}>
              <span className={cn("h-2 w-2 rounded-full", filtroNivel === "rojo" ? "bg-red-200" : "bg-red-500")} />
              Alertas rojas
            </p>
          </button>
          <button
            onClick={() => setFiltroNivel(filtroNivel === "amarillo" ? "todas" : "amarillo")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              filtroNivel === "amarillo" ? "border-amber-500 bg-amber-500 text-white" : "bg-amber-50 border-amber-200 hover:border-amber-300"
            )}
          >
            <p className={cn("text-3xl font-bold", filtroNivel === "amarillo" ? "text-white" : "text-amber-600")}>2</p>
            <p className={cn("text-sm font-medium mt-0.5 flex items-center gap-1.5", filtroNivel === "amarillo" ? "text-amber-100" : "text-amber-700")}>
              <span className={cn("h-2 w-2 rounded-full", filtroNivel === "amarillo" ? "bg-amber-200" : "bg-amber-500")} />
              Alertas amarillas
            </p>
          </button>
          <button
            onClick={() => setFiltroNivel(filtroNivel === "verde" ? "todas" : "verde")}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              filtroNivel === "verde" ? "border-emerald-500 bg-emerald-500 text-white" : "bg-emerald-50 border-emerald-200 hover:border-emerald-300"
            )}
          >
            <p className={cn("text-3xl font-bold", filtroNivel === "verde" ? "text-white" : "text-emerald-600")}>4</p>
            <p className={cn("text-sm font-medium mt-0.5 flex items-center gap-1.5", filtroNivel === "verde" ? "text-emerald-100" : "text-emerald-700")}>
              <span className={cn("h-2 w-2 rounded-full", filtroNivel === "verde" ? "bg-emerald-200" : "bg-emerald-500")} />
              Sin alerta
            </p>
          </button>
        </div>

        {/* Alertas */}
        <div className="space-y-3">
          {alertasFiltradas.map((a) => (
            <AlertaCard key={a.id} alerta={a} />
          ))}
          {alertasFiltradas.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              No hay alertas en este nivel.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
