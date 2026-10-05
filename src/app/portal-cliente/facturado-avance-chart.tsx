"use client"

// Barras ACUMULADAS -- cada columna sigue siendo una factura real
// ubicada en el eje X según su fecha de emisión real, pero la ALTURA
// de la barra es el total facturado acumulado hasta esa fecha (no
// solo el monto de esa factura), para que las columnas se vean crecer
// una sobre otra.
//
// Modelo de color (tercera iteración, descrito por el usuario): el
// anticipo es un monto FIJO que ocupa una "franja" de 0 a ese monto
// (azul claro) -- la primera barra, la del propio anticipo, es esa
// franja completa. En las facturas siguientes, dentro de esa misma
// franja se va llenando desde abajo la porción ya amortizada (azul
// oscuro) conforme se consume; lo que todavía no se amortiza se ve
// igual que la franja del anticipo. Por encima del monto del anticipo
// se acumula, sin techo, el resto de lo facturado (verde claro). Una
// línea de referencia punteada marca siempre el monto del anticipo.
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine,
} from "recharts"
// La lógica de armado de los puntos vive en un archivo aparte, sin
// "use client" -- ver el comentario en facturado-avance-series.ts. Se
// reexporta aquí para no romper los imports existentes.
export { construirPuntosPorFactura, type FacturaParaGrafico, type PuntoFacturaChart } from "./facturado-avance-series"
import type { PuntoFacturaChart } from "./facturado-avance-series"

const COLOR_ANTICIPO_CLARO = "#93C5FD"
const COLOR_AMORTIZACION = "#1D4ED8"
const COLOR_COBRADO = "#34D399"
const COLOR_AVANCE = "#DB2777"

function formatoCortoMXN(n: number) {
  const v = Number(n)
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

// Texto plano, sin halo -- para las etiquetas DENTRO de un segmento
// de color sólido (ya hay contraste de sobra entre el texto y el
// fondo de la barra; agregarle un halo ahí solo lo emborronaba,
// sobre todo cuando el texto ya era blanco sobre un halo blanco).
function TextoSimple({ x, y, fill, fontSize, fontWeight, anchor, children }: {
  x: number; y: number; fill: string; fontSize: number; fontWeight: number; anchor: "middle" | "start"; children: string
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={fontSize} fontWeight={fontWeight} fill={fill}>
      {children}
    </text>
  )
}

// Etiqueta dentro de un segmento del stack -- solo si mide lo
// suficiente para que quepa el texto sin encimarse con el borde.
function crearEtiquetaSegmento(color: string) {
  return (props: any) => {
    const { x, y, width, height, value } = props
    if (!value || height == null || height < 18) return null
    return (
      <TextoSimple x={x + width / 2} y={y + height / 2 + 4} fill={color} fontSize={10} fontWeight={700} anchor="middle">
        {formatoCortoMXN(value)}
      </TextoSimple>
    )
  }
}

// Total acumulado -- mismo criterio que el gráfico "Avance en el
// tiempo" (Real vs. Plan) de Cronograma: solo se escribe en el ÚLTIMO
// punto (el más reciente), no en cada barra. Repetirlo en las tres
// barras era justo lo que se veía amontonado -- el detalle de cada
// factura puntual ya está en el tooltip al pasar el mouse.
// "responsable" decide cuál de los dos Bars es el que de verdad está
// en la punta de la barra: cuando ya se superó el monto del anticipo
// es "cobradoSobreAnticipo", y mientras no (solo la propia factura de
// anticipo) es "baseSinConsumir".
function crearEtiquetaTotalUltimo(datos: PuntoFacturaChart[], responsable: (row: PuntoFacturaChart) => boolean) {
  return (props: any) => {
    const { x, y, width, index } = props
    if (index !== datos.length - 1) return null
    const row = datos[index]
    if (!row || x == null || y == null || !responsable(row)) return null
    return (
      <TextoSimple x={x + width / 2} y={y - 8} fill="#334155" fontSize={12} fontWeight={700} anchor="middle">
        {formatoCortoMXN(row.totalAcumulado)}
      </TextoSimple>
    )
  }
}

// % de avance real -- igual que arriba: solo en el último punto, a su
// derecha (no arriba), para no competir con la etiqueta del total.
// Usa "avancePctMostrado" (ver más abajo), que para el último punto es
// el avance REAL de hoy -- no el que tenía la obra cuando se generó la
// última factura -- con su decimal real, igual que en Cronograma.
function crearEtiquetaPctUltimo(datos: { avancePctMostrado: number | null }[]) {
  return (props: any) => {
    const { x, y, index } = props
    if (index !== datos.length - 1) return null
    const pct = datos[index]?.avancePctMostrado
    if (pct == null || x == null || y == null) return null
    return (
      <TextoSimple x={Number(x) + 10} y={Number(y) + 4} fill={COLOR_AVANCE} fontSize={11} fontWeight={700} anchor="start">
        {`${pct}%`}
      </TextoSimple>
    )
  }
}

function TooltipFactura({ active, payload, label, en }: any) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload as (PuntoFacturaChart & { avanceEquivDinero?: number | null }) | undefined
  if (!row) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs space-y-0.5">
      <p className="font-semibold text-slate-700">{row.numero ?? label}</p>
      <p className="text-slate-400 mb-1">{label}</p>
      {row.esAnticipo ? (
        <p style={{ color: COLOR_ANTICIPO_CLARO }}>
          {en ? "Deposit collected" : "Anticipo cobrado"}: {formatoCortoMXN(row.totalAcumulado)}
        </p>
      ) : (
        <>
          <p style={{ color: COLOR_AMORTIZACION }}>
            {en ? "Deposit amortized (cumulative)" : "Anticipo amortizado (acumulado)"}: {formatoCortoMXN(row.amortizacionAcumulada)}
          </p>
          <p style={{ color: COLOR_COBRADO }}>
            {en ? "Billed above deposit (cumulative)" : "Cobrado sobre el anticipo (acumulado)"}: {formatoCortoMXN(row.cobradoSobreAnticipo)}
          </p>
          <p className="text-slate-500">{en ? "Total invoiced to date" : "Total facturado a la fecha"}: {formatoCortoMXN(row.totalAcumulado)}</p>
        </>
      )}
      {row.avancePct != null && (
        <p className="pt-0.5 mt-0.5 border-t border-slate-100" style={{ color: COLOR_AVANCE }}>
          {en ? "Actual site progress" : "Avance real de la obra"}: {row.avancePct}%
        </p>
      )}
    </div>
  )
}

export function FacturadoAvanceChart({
  datos,
  en,
  label,
  presupuestoVenta,
  avanceActualPct,
}: {
  datos: PuntoFacturaChart[]
  en: boolean
  label: string
  // Monto total del contrato -- necesario para ubicar el punto de %
  // de avance en el mismo eje de dinero que las barras (avance_pct/100
  // × contrato). Sin esto, el punto de avance simplemente no se dibuja.
  presupuestoVenta?: number | null
  // Avance REAL de la obra a día de hoy (mismo histórico que usa
  // Cronograma) -- distinto de avance_acumulado_pct de la última
  // factura, que es el avance que tenía la obra en el momento en que
  // se generó esa factura (pudo haber sido antes de hoy). El ÚLTIMO
  // punto del gráfico usa este valor si está disponible, para que
  // siempre muestre el dato más actual, con su decimal real.
  avanceActualPct?: number | null
}) {
  if (datos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
        <p className="text-sm text-slate-400">{en ? "No invoices yet." : "Todavía no hay facturas registradas."}</p>
      </div>
    )
  }

  const anticipoMonto = datos[0]?.anticipoMonto ?? null

  const conEquivalente = datos.map((d, i) => {
    // El último punto muestra el avance de HOY (avanceActualPct) si
    // está disponible -- para todos los demás puntos (y como
    // respaldo si no llegó el avance actual), se usa el avance que
    // quedó guardado en la propia factura.
    const esUltimo = i === datos.length - 1
    const avancePctMostrado = esUltimo && avanceActualPct != null ? avanceActualPct : d.avancePct
    return {
      ...d,
      avancePctMostrado,
      avanceEquivDinero: presupuestoVenta != null && avancePctMostrado != null
        ? (avancePctMostrado / 100) * presupuestoVenta
        : null,
    }
  })

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-y-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_ANTICIPO_CLARO }} /> {en ? "Deposit" : "Anticipo"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_AMORTIZACION }} /> {en ? "Deposit amortized (cumulative)" : "Anticipo amortizado (acumulado)"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_COBRADO }} /> {en ? "Billed above deposit" : "Cobrado sobre el anticipo"}</span>
          <span className="flex items-center gap-1"><span className="inline-block" style={{ borderTop: `2px dashed ${COLOR_AVANCE}`, width: 12 }} /> {en ? "Actual site progress" : "Avance real de la obra"}</span>
        </div>
      </div>
      {presupuestoVenta != null && (
        <p className="text-[10px] text-slate-400 -mt-2 mb-2">
          {en ? "Scaled to the full contract: " : "Escalado al contrato completo: "}
          {presupuestoVenta.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
        </p>
      )}
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={conEquivalente} margin={{ top: 22, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={presupuestoVenta ? [0, presupuestoVenta] : undefined}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={formatoCortoMXN}
            />
            <Tooltip content={<TooltipFactura en={en} />} />
            {anticipoMonto != null && (
              <ReferenceLine y={anticipoMonto} stroke="#60A5FA" strokeDasharray="4 4" />
            )}
            <Bar dataKey="amortizacionAcumulada" stackId="factura" fill={COLOR_AMORTIZACION}>
              <LabelList dataKey="amortizacionAcumulada" content={crearEtiquetaSegmento("#ffffff")} />
            </Bar>
            <Bar dataKey="baseSinConsumir" stackId="factura" fill={COLOR_ANTICIPO_CLARO}>
              <LabelList dataKey="baseSinConsumir" content={crearEtiquetaTotalUltimo(conEquivalente, (r) => r.cobradoSobreAnticipo === 0)} />
            </Bar>
            <Bar dataKey="cobradoSobreAnticipo" stackId="factura" fill={COLOR_COBRADO} radius={[4, 4, 0, 0]}>
              <LabelList dataKey="cobradoSobreAnticipo" content={crearEtiquetaSegmento("#065F46")} />
              <LabelList dataKey="cobradoSobreAnticipo" content={crearEtiquetaTotalUltimo(conEquivalente, (r) => r.cobradoSobreAnticipo > 0)} />
            </Bar>
            {presupuestoVenta != null && (
              <Line
                type="monotone"
                dataKey="avanceEquivDinero"
                stroke={COLOR_AVANCE}
                strokeWidth={1.25}
                strokeDasharray="4 3"
                dot={{ r: 3, fill: COLOR_AVANCE, strokeWidth: 0 }}
                connectNulls
                label={crearEtiquetaPctUltimo(conEquivalente)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
