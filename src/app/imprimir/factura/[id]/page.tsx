import { Fragment } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { BotonImprimirPDF } from "../../boton-imprimir"
import { EstilosImpresion, EtiquetaEstado, fmt, fmtFecha } from "../../estilos"

type Sub = { actividad_id: string; codigo: string | null; nombre: string; avance_actual_pct: number }
type Desglose = {
  actividad_id: string
  actividad_codigo: string | null
  actividad_nombre: string
  avance_pct: number
  monto_bruto: number
  monto_amortizado?: number
  monto_neto?: number
  disciplina?: string
  actividades?: Sub[]
  avance_desde_pct?: number
  avance_hasta_pct?: number
}

const ESTADOS: Record<string, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "#64748B" },
  aprobada: { label: "Aprobada · sin enviar", color: "#059669" },
  enviada: { label: "Enviada al cliente", color: "#2563EB" },
  parcialmente_pagada: { label: "Cobro parcial", color: "#D97706" },
  pagada: { label: "Cobrada", color: "#047857" },
  vencida: { label: "Vencida", color: "#DC2626" },
  en_disputa: { label: "En disputa", color: "#EA580C" },
}

export default async function ImprimirFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: f } = await supabase
    .from("facturas_cliente")
    .select(`
      id, numero, descripcion, monto, retencion, amortizacion_anticipo,
      periodo_inicio, periodo_fin, desglose_actividades,
      fecha_emision, fecha_vencimiento, fecha_cobro, estado, monto_cobrado,
      avance_acumulado_pct,
      proyectos ( nombre, codigo ),
      change_orders ( numero, titulo )
    `)
    .eq("id", id)
    .single()

  if (!f) notFound()

  const proyecto = f.proyectos as unknown as { nombre: string; codigo: string } | null
  const co = f.change_orders as unknown as { numero: string | null; titulo: string } | null
  const desglose = (f.desglose_actividades ?? []) as unknown as Desglose[]
  const est = ESTADOS[f.estado] ?? { label: f.estado, color: "#64748B" }

  const bruto = Number(f.monto) + Number(f.amortizacion_anticipo)
  const totalEjec = desglose.reduce((s, d) => s + d.monto_bruto, 0) || bruto
  const totalAmort = desglose.reduce((s, d) => s + (d.monto_amortizado ?? 0), 0) || Number(f.amortizacion_anticipo)
  const totalNeto = desglose.reduce((s, d) => s + (d.monto_neto ?? d.monto_bruto), 0) || Number(f.monto)
  const saldo = Number(f.monto) - Number(f.monto_cobrado ?? 0)

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900 max-w-4xl mx-auto">
      <EstilosImpresion />

      <div className="flex justify-end mb-4 print:hidden"><BotonImprimirPDF /></div>

      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5">
        <div>
          <p className="text-xs tracking-widest text-slate-400 font-semibold">VERTIKALL HAUS</p>
          <h1 className="text-2xl font-bold mt-1">{co ? "Factura de Change Order" : "Estimación de avance"}</h1>
          <p className="text-sm text-slate-600 mt-1 font-mono">{f.numero ?? "Sin número"}</p>
        </div>
        <EtiquetaEstado texto={est.label} color={est.color} />
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-5">
        <p><span className="text-slate-400">Proyecto:</span> {proyecto?.nombre} <span className="text-slate-400 font-mono text-xs">({proyecto?.codigo})</span></p>
        {co && <p><span className="text-slate-400">Change Order:</span> {co.numero} — {co.titulo}</p>}
        <p><span className="text-slate-400">Período:</span> {f.periodo_inicio ? `${fmtFecha(f.periodo_inicio)} al ${fmtFecha(f.periodo_fin)}` : "—"}</p>
        <p><span className="text-slate-400">Emisión:</span> {fmtFecha(f.fecha_emision)}</p>
        <p><span className="text-slate-400">Vencimiento:</span> {fmtFecha(f.fecha_vencimiento)}</p>
        <p><span className="text-slate-400">Cobro:</span> {fmtFecha(f.fecha_cobro)}</p>
        {f.avance_acumulado_pct != null && <p><span className="text-slate-400">Avance acumulado al emitir:</span> {f.avance_acumulado_pct}%</p>}
      </div>

      {f.descripcion && <p className="text-sm text-slate-600 mb-4">{f.descripcion}</p>}

      {desglose.length > 0 && (
        <table className="w-full text-xs border border-slate-300 mb-5">
          <thead className="bg-slate-100">
            <tr className="text-slate-600">
              <th className="text-left px-2 py-1.5">Renglón</th>
              <th className="text-right px-2 py-1.5">% avance</th>
              <th className="text-right px-2 py-1.5">Ejecutado</th>
              <th className="text-right px-2 py-1.5">Amort. anticipo</th>
              <th className="text-right px-2 py-1.5">A cobrar</th>
            </tr>
          </thead>
          <tbody>
            {desglose.map((d, i) => {
              const tieneAm = d.monto_amortizado !== undefined && d.monto_neto !== undefined
              const pct = d.avance_desde_pct !== undefined ? `${d.avance_desde_pct}%-${d.avance_hasta_pct}%` : `${d.avance_pct}%`
              return (
                <Fragment key={`${d.disciplina ?? d.actividad_id}-${i}`}>
                  <tr className={`border-t border-slate-200 ${d.actividades ? "font-semibold bg-slate-50" : ""}`}>
                    <td className="px-2 py-1.5">
                      {d.disciplina ?? `${d.actividad_codigo ? d.actividad_codigo + " — " : ""}${d.actividad_nombre}`}
                    </td>
                    <td className="text-right px-2 py-1.5">{pct}</td>
                    <td className="text-right px-2 py-1.5">{fmt(d.monto_bruto)}</td>
                    <td className="text-right px-2 py-1.5">{tieneAm && d.monto_amortizado! > 0 ? `−${fmt(d.monto_amortizado)}` : "—"}</td>
                    <td className="text-right px-2 py-1.5">{fmt(tieneAm ? d.monto_neto : d.monto_bruto)}</td>
                  </tr>
                  {d.actividades?.map((s) => (
                    <tr key={s.actividad_id} className="text-slate-500">
                      <td className="pl-5 pr-2 py-1">{s.codigo ? `${s.codigo} — ` : ""}{s.nombre}</td>
                      <td className="text-right px-2 py-1" colSpan={4}>{s.avance_actual_pct}% avance actual</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
              <td className="px-2 py-1.5" colSpan={2}>Total</td>
              <td className="text-right px-2 py-1.5">{fmt(totalEjec)}</td>
              <td className="text-right px-2 py-1.5">{totalAmort > 0 ? `−${fmt(totalAmort)}` : "—"}</td>
              <td className="text-right px-2 py-1.5">{fmt(totalNeto)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <div className="ml-auto w-72 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">Monto de la factura</span><span className="font-bold">{fmt(f.monto)}</span></div>
        {Number(f.retencion) > 0 && <div className="flex justify-between"><span className="text-slate-500">Retención</span><span>{fmt(f.retencion)}</span></div>}
        <div className="flex justify-between"><span className="text-slate-500">Cobrado</span><span>{fmt(f.monto_cobrado)}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1"><span className="font-semibold">Saldo pendiente</span><span className="font-bold">{fmt(saldo)}</span></div>
      </div>

      <p className="text-[10px] text-slate-400 mt-8">Generado el {new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</p>
    </div>
  )
}
