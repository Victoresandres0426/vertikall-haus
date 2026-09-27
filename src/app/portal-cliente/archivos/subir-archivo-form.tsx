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
  const [categoria, setCategoria] = useState<"planos" | "documentos_colaborador">("planos")
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as "planos" | "documentos_colaborador")}
          disabled={subiendo}
          className="w-full sm:w-auto border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#3B72D8] appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%2394a3b8%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.6rem_center] bg-[length:1.1rem] pr-9"
        >
          <option value="planos">{en ? "Plans" : "Planos"}</option>
          <option value="documentos_colaborador">{en ? "Specs / other documents" : "Specs / otros documentos"}</option>
        </select>

        {/* accept explícito: sin esto, algunos navegadores móviles (sobre
            todo en tablets/Android) abren directo la galería de fotos en
            vez de ofrecer también "Archivos" -- al listar tipos que no son
            solo imágenes, el selector nativo muestra el picker completo. */}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          onChange={handleSubir}
          disabled={subiendo}
          className="w-full sm:w-auto text-sm text-slate-500 file:mr-3 file:py-2.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#3B72D8]/10 file:text-[#3B72D8] hover:file:bg-[#3B72D8]/20 file:cursor-pointer"
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
