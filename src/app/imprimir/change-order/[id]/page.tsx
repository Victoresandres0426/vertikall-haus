import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { BotonImprimirPDF } from "../../boton-imprimir"
import { EstilosImpresion, EtiquetaEstado, fmt, fmtFecha } from "../../estilos"

const ESTADOS: Record<string, { label: string; color: string }> = {
  detectado: { label: "Detectado", color: "#64748B" },
  en_estimacion: { label: "En estimación", color: "#2563EB" },
  enviado_cliente: { label: "Enviado al cliente · esperando decisión", color: "#D97706" },
  aprobado: { label: "Aprobado por el cliente", color: "#059669" },
  rechazado: { label: "Rechazado", color: "#DC2626" },
  facturado: { label: "Facturado", color: "#7C3AED" },
  cobrado: { label: "Cobrado", color: "#047857" },
}

type Renglon = {
  id: string
  proceso_id: string
  nombre: string
  descripcion: string | null
  costo_material: number
  costo_mano_obra: number
  duracion_dias: number
  cantidad_objetivo: number | null
  unidad: string | null
  orden: number
}

export default async function ImprimirChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: co } = await supabase
    .from("change_orders")
    .select(`
      id, numero, titulo, descripcion, solicitado_por, estado, impacto_costo, impacto_dias,
      costo_directo, margen_pct_aplicado, costo_margen, motivo_rechazo,
      created_at, enviado_at, aprobado_at, decidido_at,
      proyectos ( nombre, codigo ),
      change_order_renglones ( id, proceso_id, nombre, descripcion, costo_material, costo_mano_obra, duracion_dias, cantidad_objetivo, unidad, orden )
    `)
    .eq("id", id)
    .single()

  if (!co) notFound()

  const proyecto = co.proyectos as unknown as { nombre: string; codigo: string } | null
  const renglones = ((co.change_order_renglones ?? []) as unknown as Renglon[]).sort((a, b) => a.orden - b.orden)

  const procIds = [...new Set(renglones.map((r) => r.proceso_id))]
  const { data: procs } = procIds.length
    ? await supabase.from("procesos").select("id, codigo, nombre").in("id", procIds)
    : { data: [] as { id: string; codigo: string; nombre: string }[] }
  const nombreProceso = new Map((procs ?? []).map((p) => [p.id, `${p.codigo} — ${p.nombre}`]))

  const est = ESTADOS[co.estado] ?? { label: co.estado, color: "#64748B" }
  const totalMat = renglones.reduce((s, r) => s + Number(r.costo_material), 0)
  const totalMo = renglones.reduce((s, r) => s + Number(r.costo_mano_obra), 0)

  return (
    <div className="min-h-screen bg-white p-8 text-slate-900 max-w-4xl mx-auto">
      <EstilosImpresion />

      <div className="flex justify-end mb-4 print:hidden"><BotonImprimirPDF /></div>

      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 mb-5 gap-4">
        <div>
          <p className="text-xs tracking-widest text-slate-400 font-semibold">VERTIKALL HAUS</p>
          <h1 className="text-2xl font-bold mt-1">Change Order</h1>
          <p className="text-sm text-slate-600 mt-1 font-mono">{co.numero ?? "Sin número"}</p>
        </div>
        <EtiquetaEstado texto={est.label} color={est.color} />
      </div>

      <h2 className="text-lg font-semibold">{co.titulo}</h2>
      <p className="text-sm text-slate-500 mb-3">{proyecto?.nombre} <span className="font-mono text-xs">({proyecto?.codigo})</span></p>
      {co.descripcion && <p className="text-sm text-slate-700 mb-4 whitespace-pre-line">{co.descripcion}</p>}

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-5">
        {co.solicitado_por && <p><span className="text-slate-400">Solicitado por:</span> {co.solicitado_por}</p>}
        <p><span className="text-slate-400">Impacto en cronograma:</span> {co.impacto_dias ? `+${co.impacto_dias} días` : "—"}</p>
        <p><span className="text-slate-400">Creado:</span> {fmtFecha(co.created_at)}</p>
        <p><span className="text-slate-400">Enviado al cliente:</span> {fmtFecha(co.enviado_at)}</p>
        <p><span className="text-slate-400">Decisión del cliente:</span> {fmtFecha(co.decidido_at ?? co.aprobado_at)}</p>
        {co.estado === "rechazado" && co.motivo_rechazo && <p className="col-span-2 text-red-600">Motivo del rechazo: {co.motivo_rechazo}</p>}
      </div>

      {renglones.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Desglose por actividad</p>
          <table className="w-full text-xs border border-slate-300 mb-5">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-2 py-1.5">Actividad</th>
                <th className="text-right px-2 py-1.5">Cantidad</th>
                <th className="text-right px-2 py-1.5">Días</th>
                <th className="text-right px-2 py-1.5">Material</th>
                <th className="text-right px-2 py-1.5">Mano de obra</th>
                <th className="text-right px-2 py-1.5">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {renglones.map((r) => (
                <tr key={r.id} className="border-t border-slate-200 align-top">
                  <td className="px-2 py-1.5">
                    <span className="block text-[10px] text-slate-400">{nombreProceso.get(r.proceso_id) ?? ""}</span>
                    {r.nombre}
                  </td>
                  <td className="text-right px-2 py-1.5">{r.cantidad_objetivo ? `${r.cantidad_objetivo} ${r.unidad ?? ""}` : "—"}</td>
                  <td className="text-right px-2 py-1.5">{r.duracion_dias}</td>
                  <td className="text-right px-2 py-1.5">{fmt(r.costo_material)}</td>
                  <td className="text-right px-2 py-1.5">{fmt(r.costo_mano_obra)}</td>
                  <td className="text-right px-2 py-1.5 font-medium">{fmt(Number(r.costo_material) + Number(r.costo_mano_obra))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                <td className="px-2 py-1.5" colSpan={3}>Total</td>
                <td className="text-right px-2 py-1.5">{fmt(totalMat)}</td>
                <td className="text-right px-2 py-1.5">{fmt(totalMo)}</td>
                <td className="text-right px-2 py-1.5">{fmt(totalMat + totalMo)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}

      <div className="ml-auto w-80 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-slate-500">Costo directo</span><span>{fmt(co.costo_directo)}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Indirectos + Contingencia + Margen ({co.margen_pct_aplicado ?? 0}%)</span><span>{fmt(co.costo_margen)}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1 text-base"><span className="font-semibold">Total (impacto en costo)</span><span className="font-bold">{fmt(co.impacto_costo)}</span></div>
      </div>

      <p className="text-[10px] text-slate-400 mt-8">Generado el {new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}</p>
    </div>
  )
}
