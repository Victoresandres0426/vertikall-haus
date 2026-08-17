"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { crearProyecto } from "./actions"

export function NuevoProyectoBoton() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await crearProyecto(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setAbierto(false)
      if (result.id) router.push(`/proyectos/${result.id}`)
      else router.refresh()
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Plus className="h-4 w-4" />
        Nuevo proyecto
      </Button>

      {abierto && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !isPending) setAbierto(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
              onClick={() => setAbierto(false)}
              disabled={isPending}
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-semibold text-slate-900 mb-4">Nuevo proyecto</h3>

            <form action={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Código *</label>
                  <input
                    name="codigo"
                    required
                    placeholder="VH-2026-01"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nombre *</label>
                  <input
                    name="nombre"
                    required
                    placeholder="Casa Los Pinos"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Cliente</label>
                  <input
                    name="cliente"
                    placeholder="Nombre del cliente"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Ubicación</label>
                  <input
                    name="ubicacion"
                    placeholder="Ciudad, estado"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fecha de inicio *</label>
                  <input
                    name="fecha_inicio_plan"
                    type="date"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fecha de fin *</label>
                  <input
                    name="fecha_fin_plan"
                    type="date"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Presupuesto venta (USD)</label>
                  <input
                    name="presupuesto_venta"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Presupuesto base (USD)</label>
                  <input
                    name="presupuesto_base"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Margen objetivo (%)</label>
                  <input
                    name="margen_objetivo"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-3 mt-3">Contacto y check-in QR (opcional, se puede configurar después)</p>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Correo del cliente</label>
                    <input
                      name="cliente_email"
                      type="email"
                      placeholder="correo@cliente.com"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono del cliente</label>
                    <input
                      name="cliente_telefono"
                      type="tel"
                      placeholder="+1 305 555 0100"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Latitud (GPS)</label>
                    <input
                      name="lat"
                      type="number"
                      step="0.000001"
                      placeholder="25.681886"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Longitud (GPS)</label>
                    <input
                      name="lng"
                      type="number"
                      step="0.000001"
                      placeholder="-80.431882"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Entrada esperada</label>
                    <input
                      name="hora_entrada_esperada"
                      type="time"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Para México, EE.UU. y el resto de América, la longitud lleva signo negativo (ej. -80.43, no 80.43).
                </p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setAbierto(false)} disabled={isPending}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1" isLoading={isPending}>
                  Crear proyecto
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
