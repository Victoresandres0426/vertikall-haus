"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Users, X, Upload, Check, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  analizarCuadrillaExcel, aplicarActualizacionCuadrilla,
  type FilaCuadrillaRevision,
} from "./actualizar-cuadrilla-actions"

// Botón + modal de dos pasos para traer, desde el Excel original de
// estimación, cuadrilla, productividad, cantidad, duración y costos por
// actividad -- sin IA (parseo determinista, ver lib/importar-cuadrilla.ts)
// y sin crear nada nuevo: solo ACTUALIZA actividades que ya existen en
// este proyecto, emparejando por código. Paso 1 solo lee y propone;
// nada se guarda hasta que el usuario confirma en el paso 2.
function fmt(v: number | null, moneda?: boolean): string {
  if (v === null) return "—"
  if (moneda) return `$${Math.round(v).toLocaleString("es-MX")}`
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

function renderDiff(actual: number | null, nuevo: number | null, tieneActividad: string | null, moneda?: boolean) {
  if (!tieneActividad) return <span className="text-slate-300">—</span>
  if (actual === nuevo) return <span className="text-slate-400">{fmt(nuevo, moneda)}</span>
  return (
    <span className="font-semibold text-blue-600">
      {fmt(actual, moneda)} → {fmt(nuevo, moneda)}
    </span>
  )
}

export function ActualizarCuadrillaBoton({ proyectoId }: { proyectoId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<FilaCuadrillaRevision[] | null>(null)
  const [sinEmparejar, setSinEmparejar] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ actualizadas: number } | null>(null)
  const [isPending, startTransition] = useTransition()

  const cerrar = () => {
    setAbierto(false)
    setFilas(null)
    setSinEmparejar(0)
    setError(null)
    setResultado(null)
  }

  const handleArchivo = (formData: FormData) => {
    setError(null)
    setResultado(null)
    startTransition(async () => {
      const res = await analizarCuadrillaExcel(proyectoId, formData)
      if (res.error) { setError(res.error); return }
      setFilas(res.filas ?? [])
      setSinEmparejar(res.sinEmparejar ?? 0)
    })
  }

  const confirmar = () => {
    if (!filas) return
    setError(null)
    startTransition(async () => {
      const res = await aplicarActualizacionCuadrilla(proyectoId, filas)
      if (res.error) { setError(res.error); if (!res.actualizadas) return }
      setResultado({ actualizadas: res.actualizadas ?? 0 })
      router.refresh()
    })
  }

  const emparejadas = filas?.filter((f) => f.actividadId) ?? []
  const cambian = emparejadas.filter((f) =>
    f.personalPlaneado !== f.personalPlaneadoActual ||
    f.cantidadObjetivo !== f.cantidadObjetivoActual ||
    f.duracionPlanDias !== f.duracionPlanDiasActual ||
    f.costoMaterial !== f.costoMaterialActual ||
    f.costoManoObra !== f.costoManoObraActual ||
    f.costoPresupuesto !== f.costoPresupuestoActual
  )

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
        title="Traer cuadrilla, productividad, cantidad, duración y costos desde el Excel original, para actividades que ya existen"
      >
        <Users className="h-3.5 w-3.5" />
        Actualizar datos desde Excel
      </button>

      {abierto && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !isPending) cerrar() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
              onClick={cerrar}
              disabled={isPending}
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-semibold text-slate-900 mb-1">Actualizar datos desde Excel</h3>
            <p className="text-xs text-slate-500 mb-4">
              Sube el mismo Excel de estimación del proyecto. Se leen cuadrilla, productividad, cantidad,
              días de duración y costos (material, mano de obra, total), y se emparejan por código con las
              actividades que ya existen -- no se crea ni se borra nada. Solo se sobreescribe un campo si el
              Excel trae un valor para esa fila.
            </p>

            {resultado ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0" />
                  Se actualizaron {resultado.actualizadas} actividad{resultado.actualizadas !== 1 ? "es" : ""}.
                </div>
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>
                )}
                <div className="flex justify-end">
                  <Button onClick={cerrar}>Cerrar</Button>
                </div>
              </div>
            ) : !filas ? (
              <form action={handleArchivo} className="space-y-4">
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-10 cursor-pointer hover:border-slate-300 hover:bg-slate-50/50 transition-colors">
                  <Upload className="h-6 w-6 text-slate-400" />
                  <span className="text-sm text-slate-600 font-medium">Haz clic para elegir el archivo Excel</span>
                  <span className="text-xs text-slate-400">.xlsx o .xls</span>
                  <input type="file" name="archivo" accept=".xlsx,.xls" required className="hidden" />
                </label>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={cerrar} disabled={isPending}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={isPending}>
                    Analizar archivo
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-lg font-bold text-slate-900">{filas.length}</p>
                    <p className="text-xs text-slate-500">Filas leídas del Excel</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-lg font-bold text-emerald-700">{emparejadas.length}</p>
                    <p className="text-xs text-emerald-600">Emparejadas por código</p>
                  </div>
                  <div className={cn("rounded-lg p-3", sinEmparejar > 0 ? "bg-amber-50" : "bg-slate-50")}>
                    <p className={cn("text-lg font-bold", sinEmparejar > 0 ? "text-amber-700" : "text-slate-400")}>{sinEmparejar}</p>
                    <p className={cn("text-xs", sinEmparejar > 0 ? "text-amber-600" : "text-slate-400")}>Sin actividad correspondiente</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Se van a actualizar <strong>{emparejadas.length}</strong> actividades. De esas,{" "}
                  <strong>{cambian.length}</strong> cambian al menos un dato (personal, cantidad, duración o
                  costo) respecto a lo que tienen ahora -- el resto ya coincidía o el Excel no traía valor.
                </p>

                <div className="border border-slate-200 rounded-lg max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Actividad</th>
                        <th className="px-3 py-2 font-medium text-center">Personal</th>
                        <th className="px-3 py-2 font-medium text-center">Cantidad</th>
                        <th className="px-3 py-2 font-medium text-center">Días</th>
                        <th className="px-3 py-2 font-medium text-center">Costo total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filas.map((f) => (
                        <tr key={f.codigo} className={cn(!f.actividadId && "bg-amber-50/50")}>
                          <td className="px-3 py-1.5 font-mono text-slate-500 align-top">{f.codigo}</td>
                          <td className="px-3 py-1.5 text-slate-700 max-w-[200px] align-top">
                            <div className="truncate" title={f.nombreActual ?? f.nombreReferencia}>
                              {f.nombreActual ?? (
                                <span className="text-amber-600 italic">no encontrada -- se omite</span>
                              )}
                            </div>
                            {f.actividadId && (
                              <div className="text-[10px] text-slate-400 truncate">
                                {f.composicionCuadrilla ?? "—"} · {f.productividadTexto ?? "—"}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center align-top">
                            {renderDiff(f.personalPlaneadoActual, f.personalPlaneado, f.actividadId)}
                          </td>
                          <td className="px-3 py-1.5 text-center align-top">
                            {renderDiff(f.cantidadObjetivoActual, f.cantidadObjetivo, f.actividadId)}
                          </td>
                          <td className="px-3 py-1.5 text-center align-top">
                            {renderDiff(f.duracionPlanDiasActual, f.duracionPlanDias, f.actividadId)}
                          </td>
                          <td className="px-3 py-1.5 text-center align-top">
                            {renderDiff(f.costoPresupuestoActual, f.costoPresupuesto, f.actividadId, true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">{error}</div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setFilas(null); setError(null) }} disabled={isPending}>
                    Elegir otro archivo
                  </Button>
                  <Button onClick={confirmar} className="flex-1" isLoading={isPending} disabled={emparejadas.length === 0}>
                    Aplicar a {emparejadas.length} actividad{emparejadas.length !== 1 ? "es" : ""}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
