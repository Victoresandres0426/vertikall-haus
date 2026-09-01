"use client"

export function BotonImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#3B72D8] hover:bg-[#3163C2] text-white text-sm font-semibold transition-colors shrink-0"
    >
      Imprimir
    </button>
  )
}
