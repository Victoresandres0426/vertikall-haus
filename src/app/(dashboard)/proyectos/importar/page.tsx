"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeft, Upload, FileSpreadsheet, Loader2, AlertTriangle,
  CheckCircle2, Trash2, Sparkles,
} from "lucide-react"
import {
  analizarExcelProyecto, crearProyectoDesdeImportacion,
  type ExtraccionResultado, type ProcesoExtraido,
} from "./actions"

export default function ImportarProyectoPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [isAnalizando, startAnalisis] = useTransition()
  const [isCreando, startCreacion] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ExtraccionResultado | null>(null)

  // Campos que la IA no puede inventar
  const [codigo, setCodigo] = useState("")
  const [fechaInicio, setFechaInicio] = useState("")

  const handleAnalizar = () => {
    if (!archivo) return
    setError(null)
    startAnalisis(async () => {
      const fd = new FormData()
      fd.append("archivo", archivo)
      const res = await analizarExcelProyecto(fd)
      if (res.error) setError(res.error)
      else if (res.data) setResultado(res.data)
    })
  }

  const handleCrear = () => {
    if (!resultado) return
    setError(null)
    if (!codigo.trim()) { setError("Ingresa un código para el proyecto"); return }
    if (!fechaInicio) { setError("Selecciona la fecha de inicio"); return }

    startCreacion(async () => {
      const res = await crearProyectoDesdeImportacion({
        codigo,
        fecha_inicio_plan: fechaInicio,
        proyecto: resultado.proyecto,
        procesos: resultado.procesos,
      })
      if (res.error) setError(res.error)
      else if (res.id) router.push(`/proyectos/${res.id}`)
    })
  }

  const actualizarProyectoField = <K extends keyof ExtraccionResultado["proyecto"]>(
    campo: K,
    valor: ExtraccionResultado["proyecto"][K]
  ) => {
    if (!resultado) return
    setResultado({ ...resultado, proyecto: { ...resultado.proyecto, [campo]: valor } })
  }

  const actualizarActividad = (
    procIdx: number,
    actIdx: number,
    campo: "nombre" | "costo_presupuesto" | "dias_duracion" | "es_critica",
    valor: string | number | boolean
  ) => {
    if (!resultado) return
    const nuevosProcesos: ProcesoExtraido[] = resultado.procesos.map((p, pi) => {
      if (pi !== procIdx) return p
      return {
        ...p,
        actividades: p.actividades.map((a, ai) => (ai === actIdx ? { ...a, [campo]: valor } : a)),
      }
    })
    setResultado({ ...resultado, procesos: nuevosProcesos })
  }

  const eliminarActividad = (procIdx: number, actIdx: number) => {
    if (!resultado) return
    const nuevosProcesos = resultado.procesos.map((p, pi) => {
      if (pi !== procIdx) return p
      return { ...p, actividades: p.actividades.filter((_, ai) => ai !== actIdx) }
    })
    setResultado({ ...resultado, procesos: nuevosProcesos })
  }

  const totalActividades = resultado?.procesos.reduce((s, p) => s + p.actividades.length, 0) ?? 0
  const totalCosto = resultado?.procesos.reduce(
    (s, p) => s + p.actividades.reduce((s2, a) => s2 + (a.costo_presupuesto || 0), 0),
    0
  ) ?? 0

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <Link
          href="/proyectos"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Proyectos
        </Link>
        <h1 className="text-xl font-bold text-slate-900">Importar proyecto desde Excel</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Sube tu estimado y la IA arma el proyecto — actividades, costos y cronograma — para que lo revises antes de crearlo.
        </p>
      </div>

      <div className="p-6 max-w-4xl space-y-6">
        {!resultado && (
          <div className="bg-white border border-slate-200 rounded-xl p-8">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center">
                <FileSpreadsheet className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {archivo ? archivo.name : "Selecciona tu archivo Excel (.xlsx)"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Puede tener cualquier formato — actividades, costos, duraciones, presupuesto.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />

              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  {archivo ? "Cambiar archivo" : "Elegir archivo"}
                </button>

                {archivo && (
                  <button
                    onClick={handleAnalizar}
                    disabled={isAnalizando}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3B72D8] hover:bg-[#3163C2] text-white text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {isAnalizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isAnalizando ? "Analizando con IA..." : "Analizar con IA"}
                  </button>
                )}
              </div>

              {isAnalizando && (
                <p className="text-xs text-slate-400 mt-1">
                  Esto puede tardar entre 15 y 40 segundos según el tamaño del archivo.
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {resultado && (
          <>
            {resultado.notas && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span><strong>La IA dejó esta nota:</strong> {resultado.notas}</span>
              </div>
            )}

            {/* Datos del proyecto */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Datos del proyecto</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Código *</label>
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Ej. VH-2026-05"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fecha de inicio *</label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nombre del proyecto</label>
                  <input
                    value={resultado.proyecto.nombre}
                    onChange={(e) => actualizarProyectoField("nombre", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Cliente</label>
                  <input
                    value={resultado.proyecto.cliente ?? ""}
                    onChange={(e) => actualizarProyectoField("cliente", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Correo del cliente</label>
                  <input
                    value={resultado.proyecto.cliente_email ?? ""}
                    onChange={(e) => actualizarProyectoField("cliente_email", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono del cliente</label>
                  <input
                    value={resultado.proyecto.cliente_telefono ?? ""}
                    onChange={(e) => actualizarProyectoField("cliente_telefono", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ubicación</label>
                  <input
                    value={resultado.proyecto.ubicacion ?? ""}
                    onChange={(e) => actualizarProyectoField("ubicacion", e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Presupuesto base ($)</label>
                  <input
                    type="number"
                    value={resultado.proyecto.presupuesto_base}
                    onChange={(e) => actualizarProyectoField("presupuesto_base", parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Presupuesto venta ($)</label>
                  <input
                    type="number"
                    value={resultado.proyecto.presupuesto_venta}
                    onChange={(e) => actualizarProyectoField("presupuesto_venta", parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Margen objetivo (%)</label>
                  <input
                    type="number"
                    value={resultado.proyecto.margen_objetivo}
                    onChange={(e) => actualizarProyectoField("margen_objetivo", parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{resultado.procesos.length}</p>
                <p className="text-sm text-slate-500 mt-0.5">Procesos</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-slate-900">{totalActividades}</p>
                <p className="text-sm text-slate-500 mt-0.5">Actividades</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">${totalCosto.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-sm text-slate-500 mt-0.5">Costo total actividades</p>
              </div>
            </div>

            {/* Procesos y actividades */}
            <div className="space-y-4">
              {resultado.procesos.map((proc, procIdx) => (
                <div key={procIdx} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <span className="font-mono text-xs text-slate-400">{proc.codigo}</span>
                    <h3 className="text-sm font-semibold text-slate-700">{proc.nombre}</h3>
                    <span className="text-xs text-slate-400 ml-auto">{proc.actividades.length} actividades</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {proc.actividades.map((act, actIdx) => (
                      <div key={actIdx} className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                        <span className="font-mono text-xs text-slate-400 w-16 shrink-0">{act.codigo}</span>
                        <input
                          value={act.nombre}
                          onChange={(e) => actualizarActividad(procIdx, actIdx, "nombre", e.target.value)}
                          className="flex-1 min-w-[180px] border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <input
                          type="number"
                          value={act.costo_presupuesto}
                          onChange={(e) => actualizarActividad(procIdx, actIdx, "costo_presupuesto", parseFloat(e.target.value) || 0)}
                          className="w-24 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          title="Costo ($)"
                        />
                        <input
                          type="number"
                          value={act.dias_duracion}
                          onChange={(e) => actualizarActividad(procIdx, actIdx, "dias_duracion", parseFloat(e.target.value) || 0)}
                          className="w-16 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                          title="Días de duración"
                        />
                        <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0" title="Ruta crítica">
                          <input
                            type="checkbox"
                            checked={act.es_critica}
                            onChange={(e) => actualizarActividad(procIdx, actIdx, "es_critica", e.target.checked)}
                            className="h-3.5 w-3.5"
                          />
                          Crítica
                        </label>
                        <button
                          onClick={() => eliminarActividad(procIdx, actIdx)}
                          className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {proc.actividades.length === 0 && (
                      <p className="text-xs text-slate-400 px-4 py-3">Sin actividades en este proceso.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pb-6">
              <button
                onClick={() => { setResultado(null); setArchivo(null); setError(null) }}
                className="px-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                disabled={isCreando}
              >
                Empezar de nuevo
              </button>
              <button
                onClick={handleCrear}
                disabled={isCreando}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#3B72D8] hover:bg-[#3163C2] text-white text-sm font-semibold transition-colors disabled:opacity-60 ml-auto"
              >
                {isCreando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isCreando ? "Creando proyecto..." : "Crear proyecto"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
