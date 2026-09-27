"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { UploadCloud } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// Solo colaboradores externos (diseñador/arquitecto) ven este form --
// el cliente puede ver la sección de Archivos pero no subir (decisión
// confirmada con el dueño). La subida va directo del navegador a
// Storage (mismo patrón que "Archivos del proyecto" interno), y las
// políticas RLS nuevas (migración 118) son las que de verdad
// restringen esto a colaborador_externo + su único proyecto +
// categoría planos/otros -- este componente es solo la UI.
export function SubirArchivoForm({ proyectoId, en }: { proyectoId: string; en: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [categoria, setCategoria] = useState<"planos" | "otros">("planos")
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubir = async () => {
    const archivo = inputRef.current?.files?.[0]
    if (!archivo) return

    setSubiendo(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("no_autenticado")

      const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const storagePath = `${proyectoId}/${categoria}/${Date.now()}-${nombreLimpio}`

      const { error: errUpload } = await supabase.storage
        .from("proyecto-archivos")
        .upload(storagePath, archivo)
      if (errUpload) throw errUpload

      const { error: errInsert } = await supabase.from("proyecto_archivos").insert({
        proyecto_id: proyectoId,
        categoria,
        nombre_archivo: archivo.name,
        storage_path: storagePath,
        tamano_bytes: archivo.size,
        subido_por: user.id,
      })
      if (errInsert) throw errInsert

      if (inputRef.current) inputRef.current.value = ""
      router.refresh()
    } catch (e) {
      console.error("Subir archivo falló:", e)
      setError(en ? "Couldn't upload the file. Try again." : "No se pudo subir el archivo. Intenta de nuevo.")
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as "planos" | "otros")}
          disabled={subiendo}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3B72D8]"
        >
          <option value="planos">{en ? "Plans" : "Planos"}</option>
          <option value="otros">{en ? "Other documents" : "Otros documentos"}</option>
        </select>

        <input
          ref={inputRef}
          type="file"
          onChange={handleSubir}
          disabled={subiendo}
          className="text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#3B72D8]/10 file:text-[#3B72D8] hover:file:bg-[#3B72D8]/20 file:cursor-pointer"
        />

        {subiendo && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <UploadCloud className="h-3.5 w-3.5 animate-pulse" /> {en ? "Uploading..." : "Subiendo..."}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
