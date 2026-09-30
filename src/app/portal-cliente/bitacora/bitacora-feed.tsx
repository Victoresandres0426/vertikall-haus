"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { NotebookPen, UploadCloud, X, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { EntradaBitacora } from "../_shared"

const ROL_LABEL: Record<string, { es: string; en: string }> = {
  dueno: { es: "Dueño", en: "Owner" },
  superadmin: { es: "Dueño", en: "Owner" },
  administrador: { es: "Administrador", en: "Admin" },
  project_manager: { es: "Project Manager", en: "Project Manager" },
  capataz: { es: "Capataz", en: "Foreman" },
  colaborador_externo: { es: "Colaborador", en: "Collaborator" },
  subcontratista: { es: "Subcontratista", en: "Subcontractor" },
  cliente: { es: "Cliente", en: "Client" },
}

function etiquetaAutor(e: EntradaBitacora, en: boolean) {
  // El título (ej. "GC") reemplaza el rol del sistema para CUALQUIER
  // rol -- ver mismo comentario en el dashboard interno (bitacora-client.tsx).
  if (e.autor_titulo) return e.autor_titulo
  const label = ROL_LABEL[e.autor_rol ?? ""]
  return label ? (en ? label.en : label.es) : (e.autor_rol ?? "")
}

function formatoFechaHora(iso: string, en: boolean) {
  const d = new Date(iso)
  return d.toLocaleString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function BitacoraFeed({
  proyectoId,
  entradas,
  puedeEscribir,
  en,
}: {
  proyectoId: string
  entradas: EntradaBitacora[]
  puedeEscribir: boolean
  en: boolean
}) {
  return (
    <div className="space-y-4">
      {puedeEscribir && <FormularioNota proyectoId={proyectoId} en={en} />}

      {entradas.length === 0 ? (
        <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-5">
          {en ? "No log entries yet." : "Todavía no hay entradas en la bitácora."}
        </p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {entradas.map((e) => (
            <details key={e.id} className="group p-4">
              <summary className="flex items-center justify-between gap-2 cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-slate-800 truncate">{e.autor_nombre ?? "—"}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                    {etiquetaAutor(e, en)}
                  </span>
                </div>
                <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                  {formatoFechaHora(e.created_at, en)}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </span>
              </summary>

              <div className="mt-3">
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
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

function FormularioNota({ proyectoId, en }: { proyectoId: string; en: boolean }) {
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

      const fotos: { storage_path: string; nombre_archivo: string }[] = []
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
      setError(en ? "Couldn't publish the entry. Try again." : "No se pudo publicar la nota. Intenta de nuevo.")
    } finally {
      setPublicando(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <NotebookPen className="h-4 w-4 text-[#3B72D8]" /> {en ? "New entry" : "Nueva entrada"}
      </div>

      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        disabled={publicando}
        placeholder={en ? "Describe the event or decision made..." : "Describe el suceso o la decisión tomada..."}
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
        className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#3B72D8]/10 file:text-[#3B72D8] hover:file:bg-[#3B72D8]/20 file:cursor-pointer"
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
          {publicando ? (en ? "Posting..." : "Publicando...") : (en ? "Post" : "Publicar")}
        </button>
      </div>
    </div>
  )
}
