"use client"

import { useState } from "react"
import { UserCheck, UserPlus, X, ChevronDown, ChevronUp, Loader2, Users, Pencil, Check } from "lucide-react"
import { agregarTrabajadorAProyecto, removerTrabajadorDeProyecto, actualizarRolProyecto } from "./equipo-actions"
import { cn } from "@/lib/utils"

export type TrabajadorEquipo = {
  id: string
  nombre_completo: string
  rol_obra: string | null
  especialidad: string | null
  // Rol que desempeña específicamente en ESTE proyecto (si se definió).
  // Cuando es null, se usa rol_obra (el rol general de Personal) como respaldo.
  rol_obra_proyecto?: string | null
}

type Props = {
  proyectoId: string
  equipo: TrabajadorEquipo[]
  disponibles: TrabajadorEquipo[]
  puedeGestionar: boolean
}

const rolLabel: Record<string, string> = {
  electricista: "Electricista",
  albañil: "Albañil",
  plomero: "Plomero",
  pintor: "Pintor",
  herrero: "Herrero",
  carpintero: "Carpintero",
  ayudante: "Ayudante",
  impermeabilizador: "Impermeabilizador",
  pisos: "Inst. pisos",
  capataz: "Capataz",
  operador: "Operador",
}

function Avatar({ nombre, selected = false }: { nombre: string; selected?: boolean }) {
  return (
    <div className={cn(
      "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
      selected ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-600"
    )}>
      {nombre.charAt(0).toUpperCase()}
    </div>
  )
}

export function EquipoProyecto({ proyectoId, equipo: initialEquipo, disponibles: initialDisponibles, puedeGestionar }: Props) {
  const [equipo, setEquipo] = useState<TrabajadorEquipo[]>(initialEquipo)
  const [disponibles, setDisponibles] = useState<TrabajadorEquipo[]>(initialDisponibles)
  const [showPicker, setShowPicker] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Edición del rol específico de un trabajador en ESTE proyecto
  const [editandoRolId, setEditandoRolId] = useState<string | null>(null)
  const [rolDraft, setRolDraft] = useState("")
  const [savingRol, setSavingRol] = useState(false)

  const handleAgregar = async (t: TrabajadorEquipo) => {
    setLoadingId(t.id)
    setErrorMsg(null)
    const res = await agregarTrabajadorAProyecto(proyectoId, t.id)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setEquipo(prev => [...prev, t].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)))
      setDisponibles(prev => prev.filter(d => d.id !== t.id))
    }
    setLoadingId(null)
  }

  const handleRemover = async (t: TrabajadorEquipo) => {
    setLoadingId(t.id)
    setErrorMsg(null)
    const res = await removerTrabajadorDeProyecto(proyectoId, t.id)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setDisponibles(prev => [...prev, t].sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)))
      setEquipo(prev => prev.filter(e => e.id !== t.id))
    }
    setLoadingId(null)
  }

  const subtitulo = (t: TrabajadorEquipo) => {
    const rol = t.rol_obra_proyecto || t.rol_obra
    return rol ? (rolLabel[rol] ?? rol) : (t.especialidad ?? "—")
  }

  const iniciarEdicionRol = (t: TrabajadorEquipo) => {
    setEditandoRolId(t.id)
    setRolDraft(t.rol_obra_proyecto ?? t.rol_obra ?? "")
  }

  const guardarRol = async (t: TrabajadorEquipo) => {
    setSavingRol(true)
    setErrorMsg(null)
    const nuevoRol = rolDraft.trim() || null
    const res = await actualizarRolProyecto(proyectoId, t.id, nuevoRol)
    if (res.error) {
      setErrorMsg(res.error)
    } else {
      setEquipo(prev => prev.map(e => e.id === t.id ? { ...e, rol_obra_proyecto: nuevoRol } : e))
      setEditandoRolId(null)
    }
    setSavingRol(false)
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">Equipo autorizado en obra</h2>
        <span className="text-xs text-slate-400">· {equipo.length} trabajador{equipo.length !== 1 ? "es" : ""}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5">

        {/* Lista de autorizados */}
        {equipo.length === 0 ? (
          <div className="text-center py-8">
            <UserCheck className="h-8 w-8 mx-auto text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">Sin trabajadores autorizados aún</p>
            {puedeGestionar && (
              disponibles.length > 0 ? (
                <p className="text-xs text-slate-400 mt-0.5">Usa el botón de abajo para agregar al equipo</p>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">
                  Todavía no tienes trabajadores registrados en tu empresa —{" "}
                  <a href="/personal" className="text-blue-600 hover:underline">agrégalos primero en Personal</a>
                </p>
              )
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {equipo.map(t => (
              <div
                key={t.id}
                className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <Avatar nombre={t.nombre_completo} selected />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.nombre_completo}</p>
                    {editandoRolId !== t.id && (
                      <button
                        onClick={() => iniciarEdicionRol(t)}
                        disabled={!puedeGestionar}
                        className="text-xs text-slate-400 capitalize hover:text-slate-700 disabled:hover:text-slate-400 inline-flex items-center gap-1 group"
                        title={puedeGestionar ? "Editar rol en este proyecto" : undefined}
                      >
                        {subtitulo(t)}
                        {puedeGestionar && <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />}
                      </button>
                    )}
                  </div>
                  {puedeGestionar && (
                    <button
                      onClick={() => handleRemover(t)}
                      disabled={loadingId === t.id}
                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50 shrink-0 ml-1"
                      title="Remover del proyecto"
                    >
                      {loadingId === t.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <X className="h-3.5 w-3.5" />
                      }
                    </button>
                  )}
                </div>

                {editandoRolId === t.id && (
                  <div className="flex items-center gap-1.5 mt-2 pl-11">
                    <input
                      autoFocus
                      value={rolDraft}
                      onChange={(e) => setRolDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") guardarRol(t); if (e.key === "Escape") setEditandoRolId(null) }}
                      placeholder={`Rol general: ${t.rol_obra ?? "sin definir"}`}
                      className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      onClick={() => guardarRol(t)}
                      disabled={savingRol}
                      className="text-emerald-600 hover:text-emerald-700 shrink-0 disabled:opacity-50"
                      title="Guardar"
                    >
                      {savingRol ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => setEditandoRolId(null)}
                      disabled={savingRol}
                      className="text-slate-400 hover:text-slate-600 shrink-0"
                      title="Cancelar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {errorMsg}
          </p>
        )}

        {/* Botón para abrir picker */}
        {puedeGestionar && disponibles.length > 0 && (
          <div>
            <button
              onClick={() => setShowPicker(p => !p)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                showPicker
                  ? "bg-slate-100 text-slate-700"
                  : "bg-slate-900 text-white hover:bg-slate-700"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Agregar trabajador
              {showPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {/* Picker */}
            {showPicker && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Trabajadores disponibles ({disponibles.length})
                </p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {disponibles.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleAgregar(t)}
                      disabled={loadingId === t.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-left disabled:opacity-50"
                    >
                      <Avatar nombre={t.nombre_completo} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{t.nombre_completo}</p>
                        <p className="text-xs text-slate-400 capitalize">{subtitulo(t)}</p>
                      </div>
                      {loadingId === t.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
                        : <UserPlus className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                      }
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No gestionable y sin equipo */}
        {!puedeGestionar && equipo.length === 0 && (
          <p className="text-xs text-slate-400 text-center">
            El capataz aún no ha configurado el equipo para esta obra.
          </p>
        )}
      </div>
    </section>
  )
}
