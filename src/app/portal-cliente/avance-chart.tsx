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
// La etiqueta va ARRIBA de su punto si esa línea queda más alta que la
// otra ahí (más avance), y ABAJO si queda más baja -- así siempre es
// la línea de arriba la que se lee arriba y la de abajo la que se lee
// abajo, sin importar si esa línea es Real o Plan (antes Real siempre
// se etiquetaba arriba y Plan siempre abajo, aunque el proyecto vaya
// adelantado y Plan quede arriba, quedando las etiquetas cruzadas).
// "empatePrefiereArriba" desempata cuando ambas líneas terminan en el
// mismo valor, para que no se encimen las dos etiquetas del mismo lado.
// Nota de tipos: recharts tipa "x"/"y"/"value" en el label render-prop
// como string | number (pueden venir en % para otros charts), así que
// anotar el parámetro como number aquí rompe el chequeo de tipos de
// TypeScript al pasar esta función al prop "label". Por eso el
// parámetro se recibe sin anotar y se convierte adentro con Number().
function crearEtiquetaUltimoPunto(totalPuntos: number, color: string, valorOtraLinea: number | null, empatePrefiereArriba: boolean) {
  return (props: any) => {
    const { x, y, index, value } = props
    if (index !== totalPuntos - 1 || x == null || y == null || value == null) return null
    const nx = Number(x)
    const ny = Number(y)
    const v = Number(value)
    const vaArriba = valorOtraLinea == null || v > valorOtraLinea || (v === valorOtraLinea && empatePrefiereArriba)
    const dy = vaArriba ? -12 : 18
    return (
      <text x={nx} y={ny + dy} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
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
  const ultimo = puntos[puntos.length - 1]
  const ultimoReal = ultimo?.avance_pct ?? null
  const ultimoPlan = tienePlan ? (ultimo?.avance_plan_pct ?? null) : null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        {tienePlan && (
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3B72D8]" /> {en ? "Actual" : "Real"}</span>
            <span className="flex items-center gap-1"><span className="inline-block" style={{ borderTop: "2px dashed #F59E0B", width: 12 }} /> {en ? "Planned" : "Plan"}</span>
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
              label={crearEtiquetaUltimoPunto(puntos.length, "#3B72D8", ultimoPlan, true)}
            />
            {tienePlan && (
              <Line
                type="monotone"
                dataKey="avance_plan_pct"
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                label={crearEtiquetaUltimoPunto(puntos.length, "#B45309", ultimoReal, false)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
