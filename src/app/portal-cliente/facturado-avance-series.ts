// Lógica pura (sin "use client") para armar los puntos del gráfico
// "Facturado acumulado vs. % de avance real" -- cada COLUMNA sigue
// siendo una factura real, ubicada en el eje X según su fecha de
// emisión, pero la ALTURA de la barra es el total facturado ACUMULADO
// hasta esa fecha (no solo el monto de esa factura puntual), para que
// las columnas se vean crecer una sobre otra -- diseño pedido
// explícitamente por el usuario via boceto a mano (segunda
// iteración). Se separó de facturado-avance-chart.tsx porque ese
// archivo es "use client" -- y Next.js convierte TODOS los exports de
// un módulo "use client" en referencias de cliente cuando se importan
// desde un Server Component. Llamar una función así (no renderizarla
// como JSX) directamente en un Server Component revienta en tiempo de
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
  // Barra en tres segmentos, de abajo a arriba:
  // 1) anticipoConsumidoAcumulado (verde) -- cuánto del anticipo se ha
  //    consumido EN TOTAL hasta esta factura (crece con cada factura).
  // 2) baseAcumulada (celeste) -- el resto de lo ya facturado antes
  //    que todavía no se cuenta como consumido. Para la factura de
  //    anticipo, esta es la barra ENTERA (sirve de "línea de
  //    partida"), ya que todavía no hay nada que marcar como nuevo.
  // 3) incrementoNuevo (naranja) -- lo que se facturó de nuevo justo
  //    en ESTA factura (0 para la propia factura de anticipo).
  // La suma de los tres = totalAcumulado = todo lo facturado hasta la
  // fecha de esta factura.
  anticipoConsumidoAcumulado: number
  baseAcumulada: number
  incrementoNuevo: number
  totalAcumulado: number
  avancePct: number | null
  // Monto del anticipo original -- igual en todos los puntos. Se usa
  // para dibujar la línea de referencia horizontal ("línea de
  // partida del anticipo") que pidió el usuario, para que siempre se
  // vea dónde arrancó, incluso cuando las barras ya la superaron.
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

  let acumuladoTotal = 0
  let acumuladoConsumido = 0

  return ordenadas.map((f) => {
    const esAnticipo = (f.numero ?? "").startsWith("ANT-")
    const montoFactura = Number(f.monto ?? 0)
    const amortFactura = esAnticipo ? 0 : Number(f.amortizacion_anticipo ?? 0)

    acumuladoTotal += montoFactura
    acumuladoConsumido += amortFactura

    const incrementoNuevo = esAnticipo ? 0 : montoFactura
    const anticipoConsumidoAcumulado = esAnticipo ? 0 : acumuladoConsumido
    const baseAcumulada = Math.max(acumuladoTotal - anticipoConsumidoAcumulado - incrementoNuevo, 0)

    return {
      etiqueta: formatoFechaCorta(f.fecha_emision as string, en),
      fechaISO: f.fecha_emision as string,
      numero: f.numero,
      esAnticipo,
      anticipoConsumidoAcumulado,
      baseAcumulada,
      incrementoNuevo,
      totalAcumulado: acumuladoTotal,
      avancePct: f.avance_acumulado_pct ?? null,
      anticipoMonto,
    }
  })
}
