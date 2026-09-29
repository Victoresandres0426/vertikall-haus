"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { NotebookPen, UploadCloud, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export type FotoBitacora = { storage_path: string; nombre_archivo: string; url?: string }

export type EntradaBitacora = {
  id: string
  autor_nombre: string | null
  autor_rol: string | null
  autor_titulo: string | null
  nota: string | null
  idioma_detectado?: "es" | "en" | null
  nota_traducida?: string | null
  fotos: FotoBitacora[]
  created_at: string
}

const ROL_LABEL: Record<string, string> = {
  dueno: "Dueño",
  superadmin: "Dueño",
  administrador: "Administrador",
  project_manager: "Project Manager",
  capataz: "Capataz",
  colaborador_externo: "Colaborador",
  subcontratista: "Subcontratista",
  cliente: "Cliente",
}

function etiquetaAutor(e: EntradaBitacora) {
  if ((e.autor_rol === "colaborador_externo" || e.autor_rol === "subcontratista") && e.autor_titulo) return e.autor_titulo
  return ROL_LABEL[e.autor_rol ?? ""] ?? e.autor_rol ?? ""
}

function formatoFechaHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function BitacoraClient({
  proyectoId,
  entradas,
  puedeEscribir,
}: {
  proyectoId: string
  entradas: EntradaBitacora[]
  puedeEscribir: boolean
}) {
  return (
    <div className="max-w-3xl space-y-4">
      {puedeEscribir && <FormularioNota proyectoId={proyectoId} />}

      {entradas.length === 0 ? (
        <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">
          Todavía no hay entradas en la bitácora de este proyecto.
        </p>
      ) : (
        <div className="space-y-3">
          {entradas.map((e) => (
            <div key={e.id} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{e.autor_nombre ?? "—"}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {etiquetaAutor(e)}
                  </span>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{formatoFechaHora(e.created_at)}</span>
              </div>

              {e.nota && <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.nota}</p>}

              {e.fotos?.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                  {e.fotos.filter((f) => f.url).map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
                      <img src={f.url} alt={f.nombre_archivo} className="aspect-square object-cover rounded-lg border border-slate-100" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FormularioNota({ proyectoId }: { proyectoId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [nota, setNota] = useState("")
  const [archivos, setArchivos] = useState<File[]>([])
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const quitarArchivo = (idx: number) => {
    setArchivos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handlePublicar = async () => {
    if (!nota.trim() && archivos.length === 0) return

    setPublicando(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("no_autenticado")

      const fotos: FotoBitacora[] = []
      for (const archivo of archivos) {
        const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const storagePath = `${proyectoId}/${Date.now()}-${nombreLimpio}`
        const { error: errUpload } = await supabase.storage.from("bitacora-fotos").upload(storagePath, archivo)
        if (errUpload) throw errUpload
        fotos.push({ storage_path: storagePath, nombre_archivo: archivo.name })
      }

      const { error: errInsert } = await supabase.from("bitacora_proyecto").insert({
        proyecto_id: proyectoId,
        nota: nota.trim() || null,
        fotos,
      })
      if (errInsert) throw errInsert

      setNota("")
      setArchivos([])
      if (inputRef.current) inputRef.current.value = ""
      router.refresh()
    } catch (e) {
      console.error("Publicar en bitácora falló:", e)
      setError("No se pudo publicar la nota. Intenta de nuevo.")
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <NotebookPen className="h-4 w-4 text-[#3B72D8]" /> Nueva entrada
      </div>

      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        disabled={publicando}
        placeholder="Describe el suceso o la decisión tomada..."
        rows={3}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3B72D8] resize-none"
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setArchivos((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
        disabled={publicando}
        className="text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#3B72D8]/10 file:text-[#3B72D8] hover:file:bg-[#3B72D8]/20 file:cursor-pointer"
      />

      {archivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {archivos.map((a, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
              {a.name}
              <button onClick={() => quitarArchivo(i)} className="text-slate-400 hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={handlePublicar}
          disabled={publicando || (!nota.trim() && archivos.length === 0)}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-700 disabled:opacity-40 rounded-lg px-4 py-2"
        >
          {publicando && <UploadCloud className="h-3.5 w-3.5 animate-pulse" />}
          {publicando ? "Publicando..." : "Publicar"}
        </button>
      </div>
    </div>
  )
}
