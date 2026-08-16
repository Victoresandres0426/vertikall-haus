"use client"

import { useState, useTransition } from "react"
import { Package, Ruler, FolderOpen, AlertCircle, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { crearMaterial } from "./actions"

export type MaterialCatalogo = {
  id: string
  codigo: string | null
  nombre: string
  descripcion: string | null
  unidad: string
  categoria: string | null
  precio_unitario: number | null
  stock_actual: number | null
  stock_minimo: number | null
}

export type MaterialActividad = {
  id: string
  cantidad_plan: number
  cantidad_recibida: number
  cantidad_en_transito: number
  costo_unitario: number | null
  material_id: string
  actividades: { nombre: string; codigo: string } | null
  materiales_catalogo: { nombre: string; unidad: string } | null
}

const categoriaColor: Record<string, string> = {
  concreto: "bg-slate-100 text-slate-700",
  acero: "bg-blue-100 text-blue-700",
  madera: "bg-amber-100 text-amber-700",
  instalaciones: "bg-purple-100 text-purple-700",
  acabados: "bg-pink-100 text-pink-700",
  herramienta: "bg-orange-100 text-orange-700",
}

export function MaterialesClient({
  catalogoInicial,
  asignados,
  puedeCrear,
}: {
  catalogoInicial: MaterialCatalogo[]
  asignados: MaterialActividad[]
  puedeCrear: boolean
}) {
  const [catalogo] = useState<MaterialCatalogo[]>(catalogoInicial)
  const [showModal, setShowModal] = useState(false)

  const categorias = Array.from(new Set(catalogo.map((m) => m.categoria ?? "Sin categoría")))
  const bajoStock = catalogo.filter(
    (m) => m.stock_minimo != null && m.stock_actual != null && m.stock_actual <= m.stock_minimo
  )

  return (
    <div className="p-6 space-y-6">
      {puedeCrear && (
        <div className="flex justify-end">
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1" /> Agregar material
          </Button>
        </div>
      )}

      {catalogo.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Catálogo vacío</p>
            <p className="text-sm mt-1 max-w-sm mx-auto">
              El catálogo de materiales se alimenta al cargar un presupuesto o manualmente.
              Pronto podrás importar desde Excel.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Package, label: "Catálogo", desc: "Gestiona precios y stock de todos los materiales" },
              { icon: Ruler, label: "Asignación", desc: "Vincula materiales a actividades con cantidades" },
              { icon: AlertCircle, label: "Alertas stock", desc: "Recibe notificaciones cuando el stock baja del mínimo" },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-5 text-center">
                <item.icon className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {bajoStock.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {bajoStock.length} material{bajoStock.length !== 1 ? "es" : ""} bajo stock mínimo
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {bajoStock.map((m) => m.nombre).join(", ")}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total materiales", val: catalogo.length, color: "text-slate-900" },
              { label: "Categorías", val: categorias.length, color: "text-blue-600" },
              { label: "Bajo stock mínimo", val: bajoStock.length, color: "text-amber-600" },
              { label: "En asignaciones", val: asignados.length, color: "text-emerald-600" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color)}>{s.val}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {categorias.map((cat) => {
            const items = catalogo.filter((m) => (m.categoria ?? "Sin categoría") === cat)
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-700 capitalize">{cat}</h2>
                  <span className="text-xs text-slate-400">· {items.length}</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="divide-y divide-slate-50">
                    {items.map((m) => {
                      const bajStock = m.stock_minimo != null && m.stock_actual != null && m.stock_actual <= m.stock_minimo
                      return (
                        <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {m.codigo && (
                                <span className="font-mono text-xs text-slate-400">{m.codigo}</span>
                              )}
                              <span className="text-sm font-medium text-slate-800 truncate">{m.nombre}</span>
                              {m.categoria && (
                                <span className={cn("text-xs px-1.5 py-0.5 rounded hidden sm:inline", categoriaColor[m.categoria] ?? "bg-slate-100 text-slate-600")}>
                                  {m.categoria}
                                </span>
                              )}
                              {bajStock && (
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              )}
                            </div>
                            {m.descripcion && (
                              <p className="text-xs text-slate-400 mt-0.5 truncate">{m.descripcion}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-6 text-right text-xs">
                            <div>
                              <p className="text-slate-400">Unidad</p>
                              <p className="font-mono font-medium text-slate-700">{m.unidad}</p>
                            </div>
                            {m.precio_unitario != null && (
                              <div>
                                <p className="text-slate-400">Precio unit.</p>
                                <p className="font-medium text-slate-900">${m.precio_unitario.toLocaleString()}</p>
                              </div>
                            )}
                            {m.stock_actual != null && (
                              <div>
                                <p className="text-slate-400">Stock</p>
                                <p className={cn("font-bold", bajStock ? "text-amber-600" : "text-emerald-600")}>
                                  {m.stock_actual} {m.unidad}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          {asignados.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Asignaciones recientes</h2>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-50">
                  {asignados.map((a) => {
                    const pctRecibido = a.cantidad_plan > 0
                      ? Math.round((a.cantidad_recibida / a.cantidad_plan) * 100)
                      : 0
                    return (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {a.materiales_catalogo?.nombre ?? "—"}
                          </p>
                          {a.actividades && (
                            <p className="text-xs text-slate-400">
                              {a.actividades.codigo} · {a.actividades.nombre}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-right shrink-0">
                          <p className="text-slate-500">
                            {a.cantidad_recibida} / {a.cantidad_plan} {a.materiales_catalogo?.unidad ?? ""}
                          </p>
                          <p className={cn("font-medium", pctRecibido >= 100 ? "text-emerald-600" : pctRecibido > 0 ? "text-blue-600" : "text-slate-400")}>
                            {pctRecibido}% recibido
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showModal && <ModalAgregarMaterial onClose={() => setShowModal(false)} />}
    </div>
  )
}

function ModalAgregarMaterial({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await crearMaterial(formData)
      if (result.error) {
        setError(result.error)
      } else {
        onClose()
        window.location.reload()
      }
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-50"
          onClick={onClose}
          disabled={isPending}
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-slate-900 mb-5">Agregar material</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre *</label>
            <input
              name="nombre"
              required
              placeholder="Ej. Cemento gris 50kg"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código</label>
              <input
                name="codigo"
                placeholder="Ej. MAT-001"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unidad *</label>
              <input
                name="unidad"
                required
                placeholder="Ej. saco, m3, kg"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
            <select
              name="categoria"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              <option value="">Sin categoría</option>
              <option value="concreto">Concreto</option>
              <option value="acero">Acero</option>
              <option value="madera">Madera</option>
              <option value="instalaciones">Instalaciones</option>
              <option value="acabados">Acabados</option>
              <option value="herramienta">Herramienta</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              name="descripcion"
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Precio unit.</label>
              <input
                name="precio_unitario"
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Stock actual</label>
              <input
                name="stock_actual"
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Stock mín.</label>
              <input
                name="stock_minimo"
                type="number"
                min="0"
                step="0.01"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" isLoading={isPending}>
              Agregar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
