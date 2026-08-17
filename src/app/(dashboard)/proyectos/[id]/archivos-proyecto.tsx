"use client"

import { useRef, useState, useTransition } from "react"
import {
  Ruler, Camera, FileText, Folder, Upload, Download,
  Trash2, File as FileIcon, Loader2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { registrarArchivoProyecto, eliminarArchivoProyecto } from "../actions"
import { cn } from "@/lib/utils"

export type ArchivoProyecto = {
  id: string
  categoria: string
  nombre_archivo: string
  storage_path: string
  tamano_bytes: number | null
  subido_por: string | null
  subido_por_nombre: string | null
  created_at: string
}

const CATEGORIAS = [
  { key: "planos", label: "Planos", icon: Ruler },
  { key: "fotos", label: "Fotos", icon: Camera },
  { key: "contratos", label: "Contratos", icon: FileText },
  { key: "otros", label: "Otros", icon: Folder },
] as const

function formatBytes(bytes: number | null) {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ArchivosProyecto({
  proyectoId,
  archivosIniciales,
  usuarioId,
  esDueno,
}: {
  proyectoId: string
  archivosIniciales: ArchivoProyecto[]
  usuarioId: string | null
  esDueno: boolean
}) {
  const [categoriaActiva, setCategoriaActiva] = useState<(typeof CATEGORIAS)[number]["key"]>("fotos")
  const [archivos, setArchivos] = useState(archivosIniciales)
  const [subiendo, setSubiendo] = useState(false)
  const [descargando, setDescargando] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const archivosCategoria = archivos.filter((a) => a.categoria === categoriaActiva)

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError("")
    setSubiendo(true)

    const supabase = createClient()

    for (const file of Array.from(files)) {
      const nombreLimpio = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `${proyectoId}/${categoriaActiva}/${Date.now()}_${nombreLimpio}`

      const { error: uploadError } = await supabase.storage
        .from("proyecto-archivos")
        .upload(path, file)

      if (uploadError) {
        setError(`Error subiendo ${file.name}: ${uploadError.message}`)
        continue
      }

      const result = await registrarArchivoProyecto(proyectoId, categoriaActiva, path, file.name, file.size)
      if (result.error) {
        setError(result.error)
        continue
      }
      if (result.id) {
        setArchivos((prev) => [
          {
            id: result.id!,
            categoria: categoriaActiva,
            nombre_archivo: file.name,
            storage_path: path,
            tamano_bytes: file.size,
            subido_por: usuarioId,
            subido_por_nombre: "Tú",
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
      }
    }

    setSubiendo(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDescargar = async (archivo: ArchivoProyecto) => {
    setDescargando(archivo.id)
    const supabase = createClient()
    const { data, error: urlError } = await supabase.storage
      .from("proyecto-archivos")
      .createSignedUrl(archivo.storage_path, 60)
    setDescargando(null)
    if (urlError || !data) {
      setError("No se pudo generar el link de descarga.")
      return
    }
    window.open(data.signedUrl, "_blank")
  }

  const handleEliminar = (archivo: ArchivoProyecto) => {
    if (!confirm(`¿Eliminar "${archivo.nombre_archivo}"?`)) return
    startTransition(async () => {
      const result = await eliminarArchivoProyecto(archivo.id, archivo.storage_path, proyectoId)
      if (result.error) setError(result.error)
      else setArchivos((prev) => prev.filter((a) => a.id !== archivo.id))
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Archivos del proyecto</h3>
      </div>

      <div className="flex gap-1.5 mb-4 border-b border-slate-100 pb-0">
        {CATEGORIAS.map((cat) => {
          const Icon = cat.icon
          const count = archivos.filter((a) => a.categoria === cat.key).length
          return (
            <button
              key={cat.key}
              onClick={() => setCategoriaActiva(cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                categoriaActiva === cat.key
                  ? "border-slate-900 text-slate-900 font-medium"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              {count > 0 && <span className="text-xs text-slate-400">({count})</span>}
            </button>
          )
        })}
      </div>

      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg py-4 mb-3 text-sm text-slate-500 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors">
        {subiendo ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Subiendo...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Subir a {CATEGORIAS.find((c) => c.key === categoriaActiva)?.label}
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={subiendo}
          onChange={(e) => handleUpload(e.target.files)}
        />
      </label>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-600 mb-3">
          {error}
        </div>
      )}

      {archivosCategoria.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          Sin archivos en esta categoría todavía.
        </p>
      ) : (
        <div className="space-y-1.5">
          {archivosCategoria.map((archivo) => (
            <div
              key={archivo.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 group"
            >
              <FileIcon className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 truncate">{archivo.nombre_archivo}</p>
                <p className="text-xs text-slate-400">
                  {formatBytes(archivo.tamano_bytes)}
                  {archivo.subido_por_nombre && ` · ${archivo.subido_por_nombre}`}
                  {" · "}
                  {new Date(archivo.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <button
                onClick={() => handleDescargar(archivo)}
                disabled={descargando === archivo.id}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50 shrink-0"
                title="Descargar"
              >
                {descargando === archivo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </button>
              {esDueno && (
                <button
                  onClick={() => handleEliminar(archivo)}
                  disabled={isPending}
                  className="text-slate-300 hover:text-red-600 disabled:opacity-50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
