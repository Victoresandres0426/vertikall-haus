"use client"

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"

export type PuntoAvance = { fecha: string; avance_pct: number; avance_plan_pct?: number | null }

function formatoCorto(iso: string, en: boolean) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short" })
}

// Muestra el valor exacto en el ULTIMO punto de cada linea (el punto
// de "hoy") -- pedido explicito del dueno: que se pueda leer el
// numero justo donde estamos parados ahora, no solo intuirlo del
// tamano de la barra.
function crearEtiquetaUltimoPunto(totalPuntos: number, color: string, dy: number) {
  return (props: { x?: number; y?: number; index?: number; value?: number }) => {
    const { x, y, index, value } = props
    if (index !== totalPuntos - 1 || x == null || y == null || value == null) return null
    return (
      <text x={x} y={y + dy} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
        {value}%
      </text>
    )
  }
}

export function AvanceChart({
  datos,
  en,
  label,
}: {
  datos: PuntoAvance[]
  en: boolean
  label: string
}) {
  if (datos.length < 2) return null

  const puntos = datos.map((d) => ({ ...d, fechaCorta: formatoCorto(d.fecha, en) }))
  const tienePlan = puntos.some((p) => p.avance_plan_pct != null)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        {tienePlan && (
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3B72D8]" /> {en ? "Actual" : "Real"}</span>
            <span className="flex items-center gap-1"><span className="inline-block" style={{ borderTop: "2px dashed #94a3b8", width: 12 }} /> {en ? "Planned" : "Plan"}</span>
          </div>
        )}
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={puntos} margin={{ top: 14, right: 18, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradAvancePortal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B72D8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3B72D8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="fechaCorta" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
            <Tooltip
              formatter={(value, name) => [`${value}%`, name === "avance_plan_pct" ? (en ? "Planned" : "Plan") : (en ? "Actual" : "Real")]}
              labelFormatter={() => ""}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Area
              type="monotone"
              dataKey="avance_pct"
              stroke="#3B72D8"
              fill="url(#gradAvancePortal)"
              strokeWidth={2}
              dot={false}
              label={crearEtiquetaUltimoPunto(puntos.length, "#3B72D8", -12)}
            />
            {tienePlan && (
              <Line
                type="monotone"
                dataKey="avance_plan_pct"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                label={crearEtiquetaUltimoPunto(puntos.length, "#64748b", 18)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
