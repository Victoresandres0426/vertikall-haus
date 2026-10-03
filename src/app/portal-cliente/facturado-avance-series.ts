// Lógica pura (sin "use client") para armar los puntos del gráfico
// "Facturado por factura vs. % de avance real" -- cada COLUMNA es una
// factura real (no un mes agrupado), en el eje X según su fecha de
// emisión. Se separó de facturado-avance-chart.tsx porque ese archivo
// es "use client" -- y Next.js convierte TODOS los exports de un
// módulo "use client" en referencias de cliente cuando se importan
// desde un Server Component. Llamar una función así (no renderizarla
// como JSX) directamente en un Server Component revienta en tiempo de
// ejecución. Esta función, en un archivo sin la directiva, se puede
// llamar tanto desde Server Components (portal cliente) como desde
// Client Components (vista interna de Facturas).

export type FacturaParaGrafico = {
  numero: string | null
  fecha_emision: string | null
  // Monto neto a cobrar de ESTA factura (lo que de verdad se factura
  // nuevo). Para una factura de anticipo (ANT-), este es el anticipo
  // cobrado -- esa factura no "consume" anticipo, lo genera.
  monto: number
  // Cuánto del anticipo ya cobrado se dio por "consumido"/justificado
  // en ESTA factura puntual (no acumulado). 0 para la propia factura
  // de anticipo.
  amortizacion_anticipo: number
  // % de avance ponderado del proyecto en el momento en que se generó
  // ESTA factura -- ya viene calculado y guardado en la fila (ver
  // generar_facturas_semanales), no hace falta reconstruirlo de
  // snapshots históricos.
  avance_acumulado_pct?: number | null
}

export type PuntoFacturaChart = {
  etiqueta: string
  fechaISO: string
  numero: string | null
  esAnticipo: boolean
  // Dark green en el gráfico -- cuánto del anticipo ya cobrado se
  // consumió en esta factura puntual.
  anticipoConsumido: number
  // El valor "principal" de esta factura -- el anticipo cobrado si es
  // la factura ANT-, o el dinero nuevo facturado en cualquier otro
  // caso. Un solo campo que cambia de color según esAnticipo (ver
  // facturado-avance-chart.tsx), para que ambos casos compartan la
  // misma posición "arriba" del stack.
  valorPrincipal: number
  avancePct: number | null
}

function formatoFechaCorta(iso: string, en: boolean) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short" })
}

export function construirPuntosPorFactura(facturas: FacturaParaGrafico[], en: boolean): PuntoFacturaChart[] {
  return facturas
    .filter((f) => f.fecha_emision)
    .slice()
    .sort((a, b) => (a.fecha_emision as string).localeCompare(b.fecha_emision as string))
    .map((f) => {
      const esAnticipo = (f.numero ?? "").startsWith("ANT-")
      return {
        etiqueta: formatoFechaCorta(f.fecha_emision as string, en),
        fechaISO: f.fecha_emision as string,
        numero: f.numero,
        esAnticipo,
        anticipoConsumido: esAnticipo ? 0 : Number(f.amortizacion_anticipo ?? 0),
        valorPrincipal: Number(f.monto ?? 0),
        avancePct: f.avance_acumulado_pct ?? null,
      }
    })
}
