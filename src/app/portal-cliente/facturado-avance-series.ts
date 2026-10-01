// Lógica pura (sin "use client") para armar la serie del gráfico
// Facturado vs. % de avance real. Se separó de facturado-avance-chart.tsx
// porque ese archivo sí es "use client" -- y Next.js convierte TODOS los
// exports de un módulo "use client" en referencias de cliente cuando se
// importan desde un Server Component. Llamar una función así (no
// renderizarla como JSX) directamente en un Server Component revienta en
// tiempo de ejecución ("Algo salió mal" / error de RSC), que es
// justamente lo que le pasaba a la página de Facturas del portal del
// cliente. Esta función, en un archivo sin la directiva, se puede llamar
// tanto desde Server Components (portal cliente) como desde Client
// Components (vista interna de Facturas).

export type PuntoFacturadoAvance = {
  mes: string
  facturadoAcumulado: number
  avancePct: number | null
}

// Junta, mes a mes, el facturado acumulado con el % de avance real más
// reciente a esa fecha -- para responder "¿lo que se ha cobrado
// corresponde a lo que de verdad se ha construido?". Se usa tanto en
// el portal del cliente (histórico vía cliente_ver_avance_historico)
// como en la vista interna de Facturas (histórico vía
// proyecto_avance_historico) -- por eso recibe los datos ya resueltos
// en vez de ir a buscarlos ella misma.
export function construirSerieFacturadoAvance(
  facturas: { fecha_emision: string | null; monto: number }[],
  historico: { fecha: string; avance_pct: number }[],
  en: boolean
): PuntoFacturadoAvance[] {
  const conFecha = facturas.filter((f) => f.fecha_emision)
  if (conFecha.length === 0) return []

  const claveMes = (iso: string) => {
    const d = new Date(iso + "T00:00:00")
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }

  const meses = Array.from(new Set(conFecha.map((f) => claveMes(f.fecha_emision as string)))).sort()

  const historicoOrdenado = [...historico]
    .filter((h) => h.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  return meses.map((clave) => {
    const [anio, mes] = clave.split("-").map(Number)
    const finDeMes = new Date(anio, mes, 0) // día 0 del mes siguiente = último día de "mes"
    const finDeMesISO = finDeMes.toISOString().slice(0, 10)

    const facturadoAcumulado = conFecha
      .filter((f) => claveMes(f.fecha_emision as string) <= clave)
      .reduce((s, f) => s + Number(f.monto ?? 0), 0)

    let avancePct: number | null = null
    for (const h of historicoOrdenado) {
      if (h.fecha <= finDeMesISO) avancePct = Math.round(Number(h.avance_pct))
      else break
    }

    const etiquetaMes = finDeMes.toLocaleDateString(en ? "en-US" : "es-MX", { month: "short", year: "2-digit" })

    return { mes: etiquetaMes, facturadoAcumulado, avancePct }
  })
}
