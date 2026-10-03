// Lógica pura (sin "use client") para armar los puntos del gráfico
// "Facturado acumulado vs. % de avance real" -- cada COLUMNA sigue
// siendo una factura real, ubicada en el eje X según su fecha de
// emisión, pero la ALTURA de la barra es el total facturado ACUMULADO
// hasta esa fecha (no solo el monto de esa factura puntual), para que
// las columnas se vean crecer una sobre otra.
//
// Modelo de color (tercera iteración, descrito explícitamente por el
// usuario): el anticipo es un monto FIJO (p.ej. $110,190) que se
// dibuja como una "franja" de 0 hasta ese monto -- la primera barra
// (la del propio anticipo) la ocupa POR COMPLETO. En cada factura
// posterior, dentro de esa misma franja se va llenando desde abajo la
// porción ya amortizada (más oscura) -- lo que todavía no se ha
// amortizado se ve igual que la franja del anticipo (más claro) hasta
// que se cubre por completo. Por ENCIMA del monto del anticipo se va
// acumulando el resto de lo facturado (otro color), que no tiene techo.
//
// Se separó de facturado-avance-chart.tsx porque ese archivo es "use
// client" -- y Next.js convierte TODOS los exports de un módulo "use
// client" en referencias de cliente cuando se importan desde un
// Server Component. Llamar una función así (no renderizarla como JSX)
// directamente en un Server Component revienta en tiempo de
// ejecución. Esta función, en un archivo sin la directiva, se puede
// llamar tanto desde Server Components (portal cliente) como desde
// Client Components (vista interna de Facturas).

export type FacturaParaGrafico = {
  numero: string | null
  fecha_emision: string | null
  // Monto neto a cobrar de ESTA factura (lo que de verdad se factura
  // nuevo en ese momento). Para la factura de anticipo (ANT-), este es
  // el anticipo cobrado.
  monto: number
  // Cuánto del anticipo ya cobrado se dio por "consumido"/justificado
  // en ESTA factura puntual (no acumulado todavía -- el acumulado se
  // calcula aquí mismo). 0 para la propia factura de anticipo.
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
  totalAcumulado: number
  // Barra en tres segmentos, de abajo a arriba:
  // 1) amortizacionAcumulada -- cuánto del anticipo se ha amortizado
  //    EN TOTAL hasta esta factura (crece con cada factura, pero
  //    nunca más allá del propio monto del anticipo).
  // 2) baseSinConsumir -- el resto de la "franja" del anticipo que
  //    todavía no se ha amortizado (mismo color que la barra del
  //    anticipo -- visualmente es la misma franja, solo que una parte
  //    ya se pintó más oscura). Para la factura de anticipo, esto es
  //    la barra ENTERA.
  // 3) cobradoSobreAnticipo -- lo acumulado que excede el monto del
  //    anticipo (no tiene techo, crece sin límite con cada factura
  //    nueva una vez que el anticipo ya se cubrió por completo).
  amortizacionAcumulada: number
  baseSinConsumir: number
  cobradoSobreAnticipo: number
  avancePct: number | null
  // Monto del anticipo original -- igual en todos los puntos. Se usa
  // para dibujar la línea de referencia horizontal ("línea de
  // partida del anticipo") que pidió el usuario, para que siempre se
  // vea dónde está ese límite.
  anticipoMonto: number | null
}

function formatoFechaCorta(iso: string, en: boolean) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short" })
}

export function construirPuntosPorFactura(facturas: FacturaParaGrafico[], en: boolean): PuntoFacturaChart[] {
  const ordenadas = facturas
    .filter((f) => f.fecha_emision)
    .slice()
    .sort((a, b) => (a.fecha_emision as string).localeCompare(b.fecha_emision as string))

  const anticipoMonto = ordenadas.find((f) => (f.numero ?? "").startsWith("ANT-"))?.monto ?? null
  const anticipoSeguro = anticipoMonto ?? 0

  let acumuladoTotal = 0
  let acumuladoConsumido = 0

  return ordenadas.map((f) => {
    const esAnticipo = (f.numero ?? "").startsWith("ANT-")
    const montoFactura = Number(f.monto ?? 0)
    const amortFactura = esAnticipo ? 0 : Number(f.amortizacion_anticipo ?? 0)

    acumuladoTotal += montoFactura
    acumuladoConsumido += amortFactura

    // La franja del anticipo va de $0 a $anticipoSeguro. Lo ya
    // amortizado llena esa franja desde abajo (sin poder pasarse del
    // tope); lo que falta de esa misma franja se ve igual que la
    // barra del anticipo; y lo que excede el tope es la parte "nueva"
    // sin límite.
    const amortizacionAcumulada = Math.min(acumuladoConsumido, anticipoSeguro)
    const baseSinConsumir = Math.max(Math.min(acumuladoTotal, anticipoSeguro) - amortizacionAcumulada, 0)
    const cobradoSobreAnticipo = Math.max(acumuladoTotal - anticipoSeguro, 0)

    return {
      etiqueta: formatoFechaCorta(f.fecha_emision as string, en),
      fechaISO: f.fecha_emision as string,
      numero: f.numero,
      esAnticipo,
      totalAcumulado: acumuladoTotal,
      amortizacionAcumulada,
      baseSinConsumir,
      cobradoSobreAnticipo,
      avancePct: f.avance_acumulado_pct ?? null,
      anticipoMonto,
    }
  })
}
