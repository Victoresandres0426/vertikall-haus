"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts"

export type Factura = {
  fecha_emision: string | null
  monto: number
  monto_cobrado: number
}

// Formato corto para el eje y las etiquetas dentro de las barras --
// con decimales cuando hace falta (ej. "$3.3k") en vez de redondear a
// miles enteros, que con montos chicos (un solo mes, pocas facturas)
// terminaba mostrando el mismo "$0k"/"$3k" para valores bien distintos.
function formatoCortoMXN(n: number) {
  const v = Number(n)
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v)}`
}

// Las etiquetas dentro de la barra solo caben si la barra mide lo
// suficiente -- si no, recharts las dejaría encimadas con el borde.
function EtiquetaDentroDeBarra(props: any) {
  const { x, y, width, height, value } = props
  if (value == null || height == null || height < 18) return null
  return (
    <text x={x + width / 2} y={y + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill="#ffffff">
      {formatoCortoMXN(value)}
    </text>
  )
}

// "oct 26" (mes + año de 2 dígitos sin separador) se leía como "26 de
// octubre" -- un día del mes, no un año -- lo que confundía justo
// cuando ese día calendario todavía no había llegado. Se le agrega un
// apóstrofe antes del año ("oct '26") para que quede claro que es el
// año, como la abreviatura de toda la vida.
function formatoMesAnio(d: Date, en: boolean) {
  const mes = d.toLocaleDateString(en ? "en-US" : "es-MX", { month: "short" })
  const anio = String(d.getFullYear()).slice(-2)
  return `${mes} '${anio}`
}

function agruparPorMes(facturas: Factura[], en: boolean) {
  const grupos = new Map<string, { mes: string; facturado: number; pagado: number; orden: string }>()
  for (const f of facturas) {
    if (!f.fecha_emision) continue
    const d = new Date(f.fecha_emision + "T00:00:00")
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const mes = formatoMesAnio(d, en)
    const actual = grupos.get(clave) ?? { mes, facturado: 0, pagado: 0, orden: clave }
    actual.facturado += Number(f.monto ?? 0)
    actual.pagado += Number(f.monto_cobrado ?? 0)
    grupos.set(clave, actual)
  }
  return Array.from(grupos.values()).sort((a, b) => a.orden.localeCompare(b.orden))
}

export function PagosChart({ facturas, en, label }: { facturas: Factura[]; en: boolean; label: string }) {
  const datos = agruparPorMes(facturas, en)

  // Antes este gráfico se ocultaba del todo (return null) si había menos
  // de 2 meses con facturas -- eso lo hacía "desaparecer" justo cuando
  // un proyecto apenas arranca o cuando se reconstruyen facturas (como
  // pasó con los Change Orders), que es precisamente cuando más se
  // quiere ver esta relación. Ahora el panel siempre está presente: con
  // 1 mes muestra esa única barra, y con 0 facturas muestra un estado
  // vacío en vez de no renderizar nada.
  if (datos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
        <p className="text-sm text-slate-400">{en ? "No invoices yet." : "Todavía no hay facturas registradas."}</p>
      </div>
    )
  }

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
          <BarChart data={datos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56}
              tickFormatter={formatoCortoMXN} />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            />
            <Bar dataKey="facturado" fill="#93b4ea" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="facturado" content={EtiquetaDentroDeBarra} />
            </Bar>
            <Bar dataKey="pagado" fill="#10b981" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="pagado" content={EtiquetaDentroDeBarra} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
