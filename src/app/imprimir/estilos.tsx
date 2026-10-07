export function EstilosImpresion() {
  return (
    <style>{`
      @media print {
        @page { size: letter portrait; margin: 12mm; }
        body { background: white !important; }
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    `}</style>
  )
}

export function fmt(n: number | null | undefined) {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtFecha(f: string | null | undefined) {
  if (!f) return "—"
  const d = new Date(f.length === 10 ? f + "T00:00:00" : f)
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

export function EtiquetaEstado({ texto, color }: { texto: string; color: string }) {
  return (
    <span className="inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide" style={{ background: color + "22", color, border: `1.5px solid ${color}` }}>
      {texto}
    </span>
  )
}
