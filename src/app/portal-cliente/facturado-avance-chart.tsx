"use client"

// Relación entre lo facturado (acumulado, barras) y el % real de avance
// de la obra (línea, eje secundario), mes a mes. Responde la pregunta
// "¿lo que se me ha cobrado corresponde a lo que de verdad se ha
// construido?" -- si la barra de facturado crece mucho más rápido que
// la línea de avance, es una señal de alerta para el cliente.
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"

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

export function FacturadoAvanceChart({
  datos,
  en,
  label,
}: {
  datos: PuntoFacturadoAvance[]
  en: boolean
  label: string
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
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="monto"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
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
            <Bar yAxisId="monto" dataKey="facturadoAcumulado" fill="#93b4ea" radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="avancePct"
              stroke="#F59E0B"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#F59E0B" }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
