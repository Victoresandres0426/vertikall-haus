"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export type Factura = {
  fecha_emision: string | null
  monto: number
  monto_cobrado: number
}

function agruparPorMes(facturas: Factura[], en: boolean) {
  const grupos = new Map<string, { mes: string; facturado: number; pagado: number; orden: string }>()
  for (const f of facturas) {
    if (!f.fecha_emision) continue
    const d = new Date(f.fecha_emision + "T00:00:00")
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const mes = d.toLocaleDateString(en ? "en-US" : "es-MX", { month: "short", year: "2-digit" })
    const actual = grupos.get(clave) ?? { mes, facturado: 0, pagado: 0, orden: clave }
    actual.facturado += Number(f.monto ?? 0)
    actual.pagado += Number(f.monto_cobrado ?? 0)
    grupos.set(clave, actual)
  }
  return Array.from(grupos.values()).sort((a, b) => a.orden.localeCompare(b.orden))
}

export function PagosChart({ facturas, en, label }: { facturas: Factura[]; en: boolean; label: string }) {
  const datos = agruparPorMes(facturas, en)
  if (datos.length < 2) return null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3B72D8]" /> {en ? "Invoiced" : "Facturado"}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {en ? "Paid" : "Pagado"}</span>
        </div>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={45}
              tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Bar dataKey="facturado" fill="#93b4ea" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pagado" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
