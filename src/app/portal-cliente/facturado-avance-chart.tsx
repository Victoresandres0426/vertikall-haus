"use client"

// Cada columna es UNA FACTURA real (no un mes agrupado), ubicada en el
// eje X según su fecha de emisión real. Por factura se ve: cuánto del
// anticipo ya cobrado se consumió en esa factura puntual (verde),
// cuánto es dinero nuevo facturado -- o el anticipo cobrado, si es la
// factura de anticipo -- (celeste/naranja), el total reconocido en esa
// factura (arriba del todo), y el % de avance real de la obra al
// momento de emitirla (punto morado punteado). Diseño pedido
// explícitamente por el usuario via boceto a mano.
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts"
// La lógica de armado de los puntos vive en un archivo aparte, sin
// "use client" -- ver el comentario en facturado-avance-series.ts. Se
// reexporta aquí para no romper los imports existentes.
export { construirPuntosPorFactura, type FacturaParaGrafico, type PuntoFacturaChart } from "./facturado-avance-series"
import type { PuntoFacturaChart } from "./facturado-avance-series"

const COLOR_ANTICIPO_COBRADO = "#38BDF8"
const COLOR_ANTICIPO_CONSUMIDO = "#15803D"
const COLOR_DINERO_NUEVO = "#F97316"
const COLOR_AVANCE = "#7C3AED"

function formatoCortoMXN(n: number) {
  const v = Number(n)
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

// Etiqueta dentro de un segmento del stack -- solo si mide lo
// suficiente para que quepa el texto sin encimarse con el borde.
function crearEtiquetaSegmento(color: string) {
  return (props: any) => {
    const { x, y, width, height, value } = props
    if (!value || height == null || height < 16) return null
    return (
      <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
        {formatoCortoMXN(value)}
      </text>
    )
  }
}

// Total reconocido en ESA factura (anticipo consumido + valor
// principal) -- se escribe arriba de toda la columna, no solo del
// segmento superior. Se calcula del dato original por índice, no del
// "value" que entrega recharts (que solo trae el del propio segmento).
function crearEtiquetaTotal(datos: PuntoFacturaChart[]) {
  return (props: any) => {
    const { x, y, width, index } = props
    const row = datos[index]
    if (!row || x == null || y == null) return null
    const total = row.anticipoConsumido + row.valorPrincipal
    if (total <= 0) return null
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155">
        {formatoCortoMXN(total)}
      </text>
    )
  }
}

function crearEtiquetaPct(datos: { avancePct: number | null }[]) {
  return (props: any) => {
    const { x, y, index } = props
    const pct = datos[index]?.avancePct
    if (pct == null || x == null || y == null) return null
    return (
      <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill={COLOR_AVANCE}>
        {pct}%
      </text>
    )
  }
}

function TooltipFactura({ active, payload, label, en }: any) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload as (PuntoFacturaChart & { avanceEquivDinero?: number | null }) | undefined
  if (!row) return null
  const total = row.anticipoConsumido + row.valorPrincipal

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-xs space-y-0.5">
      <p className="font-semibold text-slate-700">{row.numero ?? label}</p>
      <p className="text-slate-400 mb-1">{label}</p>
      {row.esAnticipo ? (
        <p style={{ color: COLOR_ANTICIPO_COBRADO }}>
          {en ? "Deposit collected" : "Anticipo cobrado"}: {formatoCortoMXN(row.valorPrincipal)}
        </p>
      ) : (
        <>
          {row.anticipoConsumido > 0 && (
            <p style={{ color: COLOR_ANTICIPO_CONSUMIDO }}>
              {en ? "Deposit consumed" : "Anticipo consumido"}: {formatoCortoMXN(row.anticipoConsumido)}
            </p>
          )}
          <p style={{ color: COLOR_DINERO_NUEVO }}>
            {en ? "New money invoiced" : "Dinero nuevo facturado"}: {formatoCortoMXN(row.valorPrincipal)}
          </p>
          <p className="text-slate-500">{en ? "Total this invoice" : "Total facturado"}: {formatoCortoMXN(total)}</p>
        </>
      )}
      {row.avancePct != null && (
        <p className="pt-0.5 mt-0.5 border-t border-slate-100" style={{ color: COLOR_AVANCE }}>
          {en ? "Actual progress" : "Avance real"}: {row.avancePct}%
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
}: {
  datos: PuntoFacturaChart[]
  en: boolean
  label: string
  // Monto total del contrato -- necesario para ubicar el punto de %
  // de avance en el mismo eje de dinero que las barras (avance_pct/100
  // × contrato). Sin esto, el punto de avance simplemente no se dibuja.
  presupuestoVenta?: number | null
}) {
  if (datos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
        <p className="text-sm text-slate-400">{en ? "No invoices yet." : "Todavía no hay facturas registradas."}</p>
      </div>
    )
  }

  const conEquivalente = datos.map((d) => ({
    ...d,
    avanceEquivDinero: presupuestoVenta != null && d.avancePct != null
      ? (d.avancePct / 100) * presupuestoVenta
      : null,
  }))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-y-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_ANTICIPO_COBRADO }} /> {en ? "Deposit collected" : "Anticipo cobrado"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_ANTICIPO_CONSUMIDO }} /> {en ? "Deposit consumed" : "Anticipo consumido"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_DINERO_NUEVO }} /> {en ? "New money invoiced" : "Dinero nuevo facturado"}</span>
          <span className="flex items-center gap-1"><span className="inline-block" style={{ borderTop: `2px dashed ${COLOR_AVANCE}`, width: 12 }} /> {en ? "Actual progress" : "Avance real"}</span>
        </div>
      </div>
      {presupuestoVenta != null && (
        <p className="text-[10px] text-slate-400 -mt-2 mb-2">
          {en ? "Scaled to the full contract: " : "Escalado al contrato completo: "}
          {presupuestoVenta.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
        </p>
      )}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={conEquivalente} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
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
            <Bar dataKey="anticipoConsumido" stackId="factura" fill={COLOR_ANTICIPO_CONSUMIDO}>
              <LabelList dataKey="anticipoConsumido" content={crearEtiquetaSegmento("#ffffff")} />
            </Bar>
            <Bar dataKey="valorPrincipal" stackId="factura" radius={[4, 4, 0, 0]}>
              {conEquivalente.map((d, i) => (
                <Cell key={i} fill={d.esAnticipo ? COLOR_ANTICIPO_COBRADO : COLOR_DINERO_NUEVO} />
              ))}
              <LabelList dataKey="valorPrincipal" content={crearEtiquetaSegmento("#ffffff")} />
              <LabelList dataKey="valorPrincipal" content={crearEtiquetaTotal(conEquivalente)} />
            </Bar>
            {presupuestoVenta != null && (
              <Line
                type="monotone"
                dataKey="avanceEquivDinero"
                stroke={COLOR_AVANCE}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 4, fill: COLOR_AVANCE, strokeWidth: 0 }}
                connectNulls
                label={crearEtiquetaPct(conEquivalente)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
