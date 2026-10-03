"use client"

// Relación entre lo facturado (acumulado, barras) y el % real de avance
// de la obra, mes a mes. Responde la pregunta "¿lo que se me ha
// cobrado corresponde a lo que de verdad se ha construido?".
//
// Ambos se grafican en UN SOLO eje de dinero (0 al contrato completo):
// la barra es el facturado acumulado tal cual, y el punto de avance se
// ubica a la altura en $ que le correspondería a ese % si el cobro
// fuera exactamente proporcional al avance (avance_pct/100 × contrato)
// -- aunque la etiqueta del punto siempre muestra el % real, no el $
// equivalente. Puesto así, en el mismo eje, un punto que cae muy por
// debajo de su barra es la señal visual directa de que se ha cobrado
// más de lo que se ha construido.
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
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

// Etiqueta de CADA punto de avance con su % real (no el $ equivalente
// que determina su altura) -- se lee del arreglo original por índice,
// porque el valor que recharts le pasa aquí ya es el $ equivalente.
function crearEtiquetaPct(datos: PuntoFacturadoAvance[]) {
  return (props: any) => {
    const { x, y, index } = props
    const pct = datos[index]?.avancePct
    if (pct == null || x == null || y == null) return null
    return (
      <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" fontSize={11} fontWeight={700} fill="#B45309">
        {pct}%
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
  // Monto total del contrato -- necesario para ubicar el punto de %
  // de avance en el mismo eje de dinero que las barras. Sin esto no
  // hay forma de convertir un % a una altura comparable, así que el
  // gráfico se cae de vuelta a un eje de dinero autoescalado sin la
  // línea de avance.
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

  // $ equivalente del % de avance sobre el contrato completo -- es lo
  // que de verdad se plotea en el eje (la etiqueta sigue mostrando el
  // % original, ver crearEtiquetaPct).
  const datosConEquivalente = datos.map((d) => ({
    ...d,
    avanceEquivDinero: presupuestoVenta != null && d.avancePct != null
      ? (d.avancePct / 100) * presupuestoVenta
      : null,
  }))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#93b4ea]" /> {en ? "Invoiced (cumulative)" : "Facturado (acumulado)"}</span>
          <span className="flex items-center gap-1"><span className="inline-block" style={{ borderTop: "2px dashed #F59E0B", width: 12 }} /> {en ? "Actual progress (% of contract)" : "Avance real (% del contrato)"}</span>
        </div>
      </div>
      {presupuestoVenta != null && (
        <p className="text-[10px] text-slate-400 -mt-2 mb-2">
          {en ? "Scaled to the full contract: " : "Escalado al contrato completo: "}
          {presupuestoVenta.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
        </p>
      )}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datosConEquivalente} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={presupuestoVenta ? [0, presupuestoVenta] : undefined}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={formatoCortoMXN}
            />
            <Tooltip
              formatter={(value, name, entry: any) =>
                name === "avanceEquivDinero"
                  ? [value == null ? "—" : `${entry?.payload?.avancePct ?? "—"}%`, en ? "Actual progress" : "Avance real"]
                  : [Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }), en ? "Invoiced (cumulative)" : "Facturado (acumulado)"]
              }
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Bar dataKey="facturadoAcumulado" fill="#93b4ea" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="facturadoAcumulado" content={EtiquetaDentroDeBarra} />
            </Bar>
            {presupuestoVenta != null && (
              <Line
                type="monotone"
                dataKey="avanceEquivDinero"
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 4, fill: "#F59E0B", strokeWidth: 0 }}
                connectNulls
                label={crearEtiquetaPct(datosConEquivalente)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
