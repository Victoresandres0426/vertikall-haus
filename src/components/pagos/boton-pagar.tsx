"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { CreditCard, X, Copy, Check, ExternalLink, Landmark } from "lucide-react"
import { tieneDatosPago, type DatosPago } from "./datos-pago"

function Fila({ etiqueta, valor }: { etiqueta: string; valor?: string }) {
  const [copiado, setCopiado] = useState(false)
  if (!valor) return null
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400">{etiqueta}</p>
        <p className="text-sm text-slate-800 font-medium break-words">{valor}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(valor)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1500)
        }}
        className="shrink-0 text-slate-400 hover:text-slate-700"
        aria-label="Copy"
      >
        {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function BotonPagar({
  datos,
  referencia,
  monto,
  en,
  className,
}: {
  datos: DatosPago | null
  referencia: string
  monto?: string
  en: boolean
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  if (!tieneDatosPago(datos)) return null
  const d = datos as DatosPago
  const notas = en ? (d.notas_en || d.notas_es) : (d.notas_es || d.notas_en)
  const hayWire = Boolean(d.cuenta || d.routing || d.beneficiario || d.banco)

  const t = en
    ? { pagar: "Pay", titulo: "How to pay", ref: "Payment reference", refAviso: "Include this invoice number in your transfer so we can match your payment.", wire: "Wire / ACH transfer", beneficiario: "Beneficiary", banco: "Bank", tipo: "Account type", routing: "Routing number", cuenta: "Account number", swift: "SWIFT / BIC", dir: "Bank address", link: "Pay online", monto: "Amount" }
    : { pagar: "Pagar", titulo: "Cómo pagar", ref: "Referencia de pago", refAviso: "Incluye este número de factura en tu transferencia para identificar tu pago.", wire: "Transferencia wire / ACH", beneficiario: "Beneficiario", banco: "Banco", tipo: "Tipo de cuenta", routing: "Routing number", cuenta: "Número de cuenta", swift: "SWIFT / BIC", dir: "Dirección del banco", link: "Pagar en línea", monto: "Monto" }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierto(true) }}
        className={className ?? "inline-flex items-center gap-1 text-xs font-medium text-white bg-[#3B72D8] hover:bg-[#3163C2] px-2.5 py-1 rounded-md"}
      >
        <CreditCard className="h-3.5 w-3.5" /> {t.pagar}
      </button>

      {abierto && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { e.stopPropagation(); setAbierto(false) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900">{t.titulo}</h3>
              <button type="button" onClick={() => setAbierto(false)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
              <p className="text-[11px] text-amber-700">{t.ref}</p>
              <p className="text-sm font-semibold text-amber-900">{referencia}</p>
              {monto && <p className="text-xs text-amber-800 mt-0.5">{t.monto}: {monto}</p>}
              <p className="text-[11px] text-amber-700 mt-1">{t.refAviso}</p>
            </div>

            {hayWire && (
              <div className="mb-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1"><Landmark className="h-3.5 w-3.5" /> {t.wire}</p>
                <div className="rounded-lg border border-slate-200 px-3">
                  <Fila etiqueta={t.beneficiario} valor={d.beneficiario} />
                  <Fila etiqueta={t.banco} valor={d.banco} />
                  <Fila etiqueta={t.tipo} valor={d.tipo_cuenta} />
                  <Fila etiqueta={t.routing} valor={d.routing} />
                  <Fila etiqueta={t.cuenta} valor={d.cuenta} />
                  <Fila etiqueta={t.swift} valor={d.swift} />
                  <Fila etiqueta={t.dir} valor={d.direccion_banco} />
                </div>
              </div>
            )}

            {d.link_url && (
              <a
                href={d.link_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-[#3B72D8] hover:bg-[#3163C2] text-white text-sm font-semibold py-2.5 mb-3"
              >
                <ExternalLink className="h-4 w-4" /> {d.link_etiqueta || t.link}
              </a>
            )}

            {notas && <p className="text-xs text-slate-500 whitespace-pre-line">{notas}</p>}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
