"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { GitMerge, CheckCircle, XCircle, Clock } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { ChangeOrder, PortalStrings } from "../_shared"

function formatoMoneda(n: number | null | undefined) {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatoFechaHora(iso: string, en: boolean) {
  const d = new Date(iso)
  return d.toLocaleString(en ? "en-US" : "es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

export function ChangeOrdersFeed({
  changeOrders,
  en,
  tf,
}: {
  changeOrders: ChangeOrder[]
  en: boolean
  tf: PortalStrings
}) {
  if (changeOrders.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 bg-white">
        <GitMerge className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">{tf.sinChangeOrders}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {changeOrders.map((co) => (
        <TarjetaChangeOrder key={co.id} co={co} en={en} tf={tf} />
      ))}
    </div>
  )
}

function TarjetaChangeOrder({ co, en, tf }: { co: ChangeOrder; en: boolean; tf: PortalStrings }) {
  const router = useRouter()
  const [procesando, setProcesando] = useState(false)
  const [mostrarRechazo, setMostrarRechazo] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [error, setError] = useState<string | null>(null)

  const decidir = async (aprobado: boolean) => {
    setProcesando(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: errRpc } = await supabase.rpc("decidir_change_order", {
        p_id: co.id,
        p_aprobado: aprobado,
        p_motivo: aprobado ? null : (motivo.trim() || null),
      })
      if (errRpc) throw errRpc
      if (data && typeof data === "object" && "ok" in data && !data.ok) {
        throw new Error("respuesta_invalida")
      }
      setMostrarRechazo(false)
      router.refresh()
    } catch (e) {
      console.error("decidir_change_order falló:", e)
      setError(en ? "Couldn't save your decision. Try again." : "No se pudo guardar tu decisión. Intenta de nuevo.")
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {co.numero && (
              <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{co.numero}</span>
            )}
            {co.estado === "enviado_cliente" && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                <Clock className="h-3 w-3" /> {tf.estadoCOEsperando}
              </span>
            )}
            {["aprobado", "facturado", "cobrado"].includes(co.estado) && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                <CheckCircle className="h-3 w-3" /> {tf.estadoCOAprobado}
              </span>
            )}
            {co.estado === "rechazado" && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                <XCircle className="h-3 w-3" /> {tf.estadoCORechazado}
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{co.titulo}</h3>
          {co.descripcion && <p className="text-xs text-slate-500 mt-1">{co.descripcion}</p>}
          {co.solicitado_por && (
            <p className="text-xs text-slate-400 mt-1">
              {en ? "Requested by" : "Solicitado por"}: {co.solicitado_por}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-300 shrink-0">{formatoFechaHora(co.enviado_at ?? co.created_at, en)}</p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs mt-3">
        {co.costo_directo != null && (
          <div className="flex justify-between text-slate-500">
            <span>{tf.costoDirecto}</span>
            <span className="font-medium text-slate-700">{formatoMoneda(co.costo_directo)}</span>
          </div>
        )}
        {co.costo_margen != null && (
          <div className="flex justify-between text-slate-500">
            <span>{tf.indirectosContingenciaMargen} — {co.margen_pct_aplicado}%</span>
            <span className="font-medium text-slate-700">{formatoMoneda(co.costo_margen)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900">
          <span>{tf.impactoTotalCosto}</span>
          <span>{formatoMoneda(co.impacto_costo)}</span>
        </div>
        {(co.impacto_dias ?? 0) !== 0 && (
          <div className="flex justify-between text-slate-500">
            <span>{tf.impactoEnDias}</span>
            <span className="font-medium text-slate-700">+{co.impacto_dias}d</span>
          </div>
        )}
      </div>

      {co.estado === "aprobado" && (
        <p className="text-xs text-emerald-600 mt-3">{tf.coAprobadoNota}</p>
      )}
      {co.estado === "rechazado" && (
        <p className="text-xs text-red-600 mt-3">
          {tf.coRechazadoNota}{co.motivo_rechazo ? ` ${co.motivo_rechazo}` : ""}
        </p>
      )}

      {co.estado === "enviado_cliente" && (
        <div className="mt-3">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {!mostrarRechazo ? (
            <div className="flex gap-2">
              <button
                onClick={() => decidir(true)}
                disabled={procesando}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg px-4 py-2"
              >
                <CheckCircle className="h-4 w-4" /> {procesando ? tf.aprobando : tf.aprobarCO}
              </button>
              <button
                onClick={() => setMostrarRechazo(true)}
                disabled={procesando}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg px-4 py-2"
              >
                <XCircle className="h-4 w-4" /> {tf.rechazarCO}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600">{tf.motivoRechazoLabel}</label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={procesando}
                placeholder={tf.motivoRechazoPlaceholder}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => decidir(false)}
                  disabled={procesando}
                  className="flex-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg px-4 py-2"
                >
                  {procesando ? tf.rechazando : tf.confirmarRechazo}
                </button>
                <button
                  onClick={() => { setMostrarRechazo(false); setMotivo("") }}
                  disabled={procesando}
                  className="flex-1 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg px-4 py-2"
                >
                  {tf.cancelar}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
