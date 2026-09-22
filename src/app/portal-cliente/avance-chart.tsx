"use client"

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export type PuntoAvance = { fecha: string; avance_pct: number }

function formatoCorto(iso: string, en: boolean) {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short" })
}

export function AvanceChart({ datos, en, label }: { datos: PuntoAvance[]; en: boolean; label: string }) {
  if (datos.length < 2) return null

  const puntos = datos.map((d) => ({ ...d, fechaCorta: formatoCorto(d.fecha, en) }))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{label}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={puntos} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
              formatter={(value) => [`${value}%`, en ? "Progress" : "Avance"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Area type="monotone" dataKey="avance_pct" stroke="#3B72D8" fill="url(#gradAvancePortal)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
