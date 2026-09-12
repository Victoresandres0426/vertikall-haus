"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Trash2 } from "lucide-react"
import { crearDependencia, actualizarDependencia, eliminarDependencia } from "../actions"
import { ETIQUETA_TIPO_DEPENDENCIA, type ActividadEditable, type DependenciaEditable, type TipoDependencia } from "./types"

const TIPOS: TipoDependencia[] = ["fin_a_inicio", "inicio_a_inicio", "fin_a_fin", "inicio_a_fin"]

// Modal de dependencias de UNA actividad -- se abre desde el ícono de
// enlace en su fila del Gantt editable. Muestra de qué depende
// (predecesoras, editables/borrables aquí, y con un formulario para
// agregar una nueva) y qué depende de ella (sucesoras, informativo pero
// también se pueden quitar/editar desde aquí porque es la misma tabla).
export function DependenciasModal({
  act,
  todasActividades,
  dependencias,
  soloLectura,
  onClose,
}: {
  act: ActividadEditable
  todasActividades: ActividadEditable[]
  dependencias: DependenciaEditable[]
  soloLectura: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [cargandoId, setCargandoId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(null)
  const [nuevoTipo, setNuevoTipo] = useState<TipoDependencia>("fin_a_inicio")
  const [nuevoLag, setNuevoLag] = useState(0)

  const porId = useMemo(() => new Map(todasActividades.map((a) => [a.id, a])), [todasActividades])
  const predecesoras = useMemo(() => dependencias.filter((d) => d.actividad_id === act.id), [dependencias, act.id])
  const sucesoras = useMemo(() => dependencias.filter((d) => d.predecesora_id === act.id), [dependencias, act.id])
  const disponibles = useMemo(() => {
    const yaUsadas = new Set(predecesoras.map((d) => d.predecesora_id))
    return todasActividades.filter((a) => a.id !== act.id && !yaUsadas.has(a.id))
  }, [todasActividades, predecesoras, act.id])

  const [nuevoPredecesorId, setNuevoPredecesorId] = useState(disponibles[0]?.id ?? "")
  useEffect(() => {
    if (!disponibles.some((a) => a.id === nuevoPredecesorId)) {
      setNuevoPredecesorId(disponibles[0]?.id ?? "")
    }
  }, [disponibles, nuevoPredecesorId])

  function agregar() {
    if (!nuevoPredecesorId) return
    setCargandoId("nuevo")
    setErrorId(null)
    startTransition(async () => {
      const res = await crearDependencia(act.id, nuevoPredecesorId, nuevoTipo, nuevoLag)
      setCargandoId(null)
      if (res.error) setErrorId({ id: "nuevo", msg: res.error })
      else {
        setNuevoLag(0)
        router.refresh()
      }
    })
  }

  function guardarCambio(dep: DependenciaEditable, tipo: TipoDependencia, lag: number) {
    setCargandoId(dep.id)
    setErrorId(null)
    startTransition(async () => {
      const res = await actualizarDependencia(dep.id, { tipo, lag_dias: lag })
      setCargandoId(null)
      if (res.error) setErrorId({ id: dep.id, msg: res.error })
      else router.refresh()
    })
  }

  function quitar(dep: DependenciaEditable) {
    setCargandoId(dep.id)
    setErrorId(null)
    startTransition(async () => {
      const res = await eliminarDependencia(dep.id)
      setCargandoId(null)
      if (res.error) setErrorId({ id: dep.id, msg: res.error })
      else router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-slate-400 font-mono">{act.codigo}</p>
            <h2 className="text-base font-bold text-slate-900">Dependencias — {act.nombre}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Depende de (predecesoras)</h3>
        {predecesoras.length === 0 && (
          <p className="text-sm text-slate-400 mb-3">Esta actividad no depende de ninguna otra.</p>
        )}
        <div className="space-y-2 mb-3">
          {predecesoras.map((dep) => {
            const pred = porId.get(dep.predecesora_id)
            return (
              <FilaDependencia
                key={dep.id}
                etiqueta={pred ? `${pred.codigo} — ${pred.nombre}` : "(actividad no encontrada)"}
                dep={dep}
                soloLectura={soloLectura}
                cargando={cargandoId === dep.id}
                error={errorId?.id === dep.id ? errorId.msg : null}
                onGuardar={(tipo, lag) => guardarCambio(dep, tipo, lag)}
                onQuitar={() => quitar(dep)}
              />
            )
          })}
        </div>

        {!soloLectura && (
          <div className="border border-dashed border-slate-300 rounded-lg p-3 mb-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">+ Agregar predecesora</p>
            {disponibles.length === 0 ? (
              <p className="text-xs text-slate-400">No hay más actividades disponibles para enlazar.</p>
            ) : (
              <div className="flex flex-wrap gap-2 items-end">
                <label className="flex flex-col gap-0.5 flex-1 min-w-40">
                  <span className="text-[10px] text-slate-400">Actividad</span>
                  <select
                    value={nuevoPredecesorId}
                    onChange={(e) => setNuevoPredecesorId(e.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 text-xs"
                  >
                    {disponibles.map((a) => (
                      <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400">Tipo</span>
                  <select
                    value={nuevoTipo}
                    onChange={(e) => setNuevoTipo(e.target.value as TipoDependencia)}
                    className="border border-slate-200 rounded px-2 py-1 text-xs"
                  >
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>{ETIQUETA_TIPO_DEPENDENCIA[t]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-slate-400">Lag (días)</span>
                  <input
                    type="number"
                    value={nuevoLag}
                    onChange={(e) => setNuevoLag(Number(e.target.value))}
                    className="border border-slate-200 rounded px-2 py-1 text-xs w-20"
                  />
                </label>
                <button
                  onClick={agregar}
                  disabled={cargandoId === "nuevo"}
                  className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-medium disabled:opacity-60"
                >
                  {cargandoId === "nuevo" ? "Agregando..." : "Agregar"}
                </button>
              </div>
            )}
            {errorId?.id === "nuevo" && <p className="text-xs text-red-600 mt-1">{errorId.msg}</p>}
          </div>
        )}

        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Actividades que dependen de esta (sucesoras)
        </h3>
        {sucesoras.length === 0 && <p className="text-sm text-slate-400">Ninguna actividad depende de esta.</p>}
        <div className="space-y-2">
          {sucesoras.map((dep) => {
            const suc = porId.get(dep.actividad_id)
            return (
              <FilaDependencia
                key={dep.id}
                etiqueta={suc ? `${suc.codigo} — ${suc.nombre}` : "(actividad no encontrada)"}
                dep={dep}
                soloLectura={soloLectura}
                cargando={cargandoId === dep.id}
                error={errorId?.id === dep.id ? errorId.msg : null}
                onGuardar={(tipo, lag) => guardarCambio(dep, tipo, lag)}
                onQuitar={() => quitar(dep)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FilaDependencia({
  etiqueta,
  dep,
  soloLectura,
  cargando,
  error,
  onGuardar,
  onQuitar,
}: {
  etiqueta: string
  dep: DependenciaEditable
  soloLectura: boolean
  cargando: boolean
  error: string | null
  onGuardar: (tipo: TipoDependencia, lag: number) => void
  onQuitar: () => void
}) {
  const [tipo, setTipo] = useState<TipoDependencia>(dep.tipo)
  const [lag, setLag] = useState(dep.lag_dias)
  const cambio = tipo !== dep.tipo || lag !== dep.lag_dias

  return (
    <div className="border border-slate-200 rounded-lg p-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-700 font-medium">{etiqueta}</p>
        {!soloLectura && (
          <button
            onClick={onQuitar}
            disabled={cargando}
            title="Quitar dependencia"
            className="text-slate-300 hover:text-red-500 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 items-end mt-1.5">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-400">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDependencia)}
            disabled={soloLectura}
            className="border border-slate-200 rounded px-1.5 py-1 text-[11px] disabled:bg-slate-50 disabled:text-slate-400"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO_DEPENDENCIA[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] text-slate-400">Lag (días)</span>
          <input
            type="number"
            value={lag}
            onChange={(e) => setLag(Number(e.target.value))}
            disabled={soloLectura}
            className="border border-slate-200 rounded px-1.5 py-1 text-[11px] w-16 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>
        {!soloLectura && cambio && (
          <button
            onClick={() => onGuardar(tipo, lag)}
            disabled={cargando}
            className="px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-medium disabled:opacity-60"
          >
            {cargando ? "Guardando..." : "Guardar"}
          </button>
        )}
      </div>
      {error && <p className="text-[10px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}
