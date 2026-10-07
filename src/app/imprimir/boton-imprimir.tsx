"use client"

export function BotonImprimirPDF() {
  return (
    <div className="flex items-center gap-3 print:hidden">
      <p className="text-xs text-slate-400 hidden sm:block">En el diálogo elige &quot;Guardar como PDF&quot; como destino.</p>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#3B72D8] hover:bg-[#3163C2] text-white text-sm font-semibold transition-colors shrink-0"
      >
        Descargar PDF
      </button>
    </div>
  )
}
