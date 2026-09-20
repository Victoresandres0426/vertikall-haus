"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function IdiomaToggle({ idiomaInicial }: { idiomaInicial: "es" | "en" }) {
  const router = useRouter()
  const supabase = createClient()
  const [idioma, setIdioma] = useState(idiomaInicial)
  const [isPending, startTransition] = useTransition()

  const cambiar = (nuevo: "es" | "en") => {
    if (nuevo === idioma || isPending) return
    setIdioma(nuevo)
    startTransition(async () => {
      const { error } = await supabase.rpc("cliente_actualizar_idioma", { p_idioma: nuevo })
      if (error) {
        setIdioma(idioma) // revertir si falló
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5 text-[11px] font-medium">
      <button
        onClick={() => cambiar("es")}
        disabled={isPending}
        className={`px-2 py-0.5 rounded-full transition-colors ${idioma === "es" ? "bg-[#3B72D8] text-white" : "text-slate-400 hover:text-slate-600"}`}
      >
        ES
      </button>
      <button
        onClick={() => cambiar("en")}
        disabled={isPending}
        className={`px-2 py-0.5 rounded-full transition-colors ${idioma === "en" ? "bg-[#3B72D8] text-white" : "text-slate-400 hover:text-slate-600"}`}
      >
        EN
      </button>
    </div>
  )
}
