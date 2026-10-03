"use client"

// Relación entre lo facturado (acumulado, barras) y el % real de avance
// de la obra (línea, eje secundario), mes a mes. Responde la pregunta
// "¿lo que se me ha cobrado corresponde a lo que de verdad se ha
// construido?" -- si la barra de facturado crece mucho más rápido que
// la línea de avance, es una señal de alerta para el cliente.
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts"
// La lógica de armado de la serie vive en un archivo aparte, sin "use
// client" -- ver el comentario en facturado-avance-series.ts. Se
// reexporta aquí para no romper los imports existentes.
export { construirSerieFacturadoAvance, type PuntoFacturadoAvance } from "./facturado-avance-series"
import type { PuntoFacturadoAvance } from "./facturado-avance-series"

// Mismo formato corto que el gráfico de Pagos -- con decimales (ej.
// "$3.3k") en vez de redondear a miles enteros.
function formatoCortoMXN(n: number) {
  const v = Number(n)
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

function EtiquetaDentroDeBarra(props: any) {
  const { x, y, width, height, value } = props
  if (value == null || height == null || height < 18) return null
  return (
    <text x={x + width / 2} y={y + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="#ffffff">
      {formatoCortoMXN(value)}
    </text>
  )
}

// Mismo recurso que usa el gráfico "Avance en el tiempo" de Cronograma
// (avance-chart.tsx): el valor exacto se lee directo sobre el ÚLTIMO
// punto de la línea, arriba de ella, en vez de solo intuirlo por dónde
// cae el área.
function crearEtiquetaUltimoPunto(totalPuntos: number) {
  return (props: any) => {
    const { x, y, index, value } = props
    if (index !== totalPuntos - 1 || x == null || y == null || value == null) return null
    return (
      <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="#B45309">
        {value}%
      </text>
    )
  }
}

export function FacturadoAvanceChart({
  datos,
  en,
  label,
  presupuestoVenta,
}: {
  datos: PuntoFacturadoAvance[]
  en: boolean
  label: string
  // Monto total del contrato. Sin esto, el eje de dinero se autoescala
  // al valor más alto de la serie (ej. "$146k") mientras que el eje de
  // % de avance siempre va fijo de 0 a 100 -- dos escalas sin relación
  // entre sí, que hacían ver la línea de avance "achatada" cerca del
  // 0% aunque el facturado ya representara una porción grande del
  // contrato. Con el total del contrato, el eje de dinero va de $0 al
  // contrato completo (el "100%" de ese eje), igual que el eje de %, y
  // ambas series quedan comparables a simple vista.
  presupuestoVenta?: number | null
}) {
  if (datos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
        <p className="text-sm text-slate-400">{en ? "No data yet." : "Todavía no hay datos suficientes."}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#93b4ea]" /> {en ? "Invoiced (cumulative)" : "Facturado (acumulado)"}</span>
          <span className="flex items-center gap-1"><span className="inline-block" style={{ borderTop: "2px solid #F59E0B", width: 12 }} /> {en ? "Actual progress" : "Avance real"}</span>
        </div>
      </div>
      {presupuestoVenta != null && (
        <p className="text-[10px] text-slate-400 -mt-2 mb-2">
          {en ? "Both axes scaled to the full contract: " : "Ambos ejes escalados al contrato completo: "}
          {presupuestoVenta.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
        </p>
      )}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradAvanceFacturado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="monto"
              domain={presupuestoVenta ? [0, presupuestoVenta] : undefined}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={formatoCortoMXN}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={32}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(value, name) =>
                name === "avancePct"
                  ? [value == null ? "—" : `${value}%`, en ? "Actual progress" : "Avance real"]
                  : [Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }), en ? "Invoiced (cumulative)" : "Facturado (acumulado)"]
              }
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Bar yAxisId="monto" dataKey="facturadoAcumulado" fill="#93b4ea" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="facturadoAcumulado" content={EtiquetaDentroDeBarra} />
            </Bar>
            <Area
              yAxisId="pct"
              type="monotone"
              dataKey="avancePct"
              stroke="#F59E0B"
              fill="url(#gradAvanceFacturado)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#F59E0B" }}
              connectNulls
              label={crearEtiquetaUltimoPunto(datos.length)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
