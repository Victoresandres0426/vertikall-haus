"use client"

import { useState, useTransition } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input, Textarea } from "@/components/ui/input"
import { guardarDatosPago } from "./actions"
import type { DatosPago } from "@/components/pagos/datos-pago"

const CAMPOS: { key: keyof DatosPago; label: string; placeholder?: string }[] = [
  { key: "beneficiario", label: "Beneficiario (nombre en la cuenta)" },
  { key: "banco", label: "Banco" },
  { key: "tipo_cuenta", label: "Tipo de cuenta", placeholder: "Checking / Savings" },
  { key: "routing", label: "Routing number (ABA)" },
  { key: "cuenta", label: "Número de cuenta" },
  { key: "swift", label: "SWIFT / BIC (wires internacionales)" },
  { key: "direccion_banco", label: "Dirección del banco" },
  { key: "zelle", label: "Zelle (correo o teléfono para recibir)", placeholder: "pagos@tuempresa.com" },
  { key: "link_url", label: "Enlace de pago (opcional)", placeholder: "https://..." },
  { key: "link_etiqueta", label: "Texto del botón del enlace", placeholder: "Pay online" },
]

export function DatosPagoForm({ inicial, puedeEditar }: { inicial: DatosPago; puedeEditar: boolean }) {
  const [datos, setDatos] = useState<DatosPago>(inicial ?? {})
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const set = (k: keyof DatosPago, v: string) => setDatos((d) => ({ ...d, [k]: v }))

  const guardar = () => {
    setMsg(null)
    startTransition(async () => {
      const r = await guardarDatosPago(datos as Record<string, string>)
      setMsg(r.error ? { ok: false, texto: r.error } : { ok: true, texto: "Datos de pago guardados." })
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <p className="text-xs text-slate-500">
        El cliente verá estos datos al pulsar &quot;Pagar&quot; en cada factura del portal, junto con el número de factura como referencia.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CAMPOS.map((c) => (
          <div key={c.key} className={c.key === "direccion_banco" ? "col-span-2" : ""}>
            <label className="text-xs text-slate-500 block mb-1">{c.label}</label>
            <Input
              value={datos[c.key] ?? ""}
              onChange={(e) => set(c.key, e.target.value)}
              placeholder={c.placeholder}
              disabled={!puedeEditar}
            />
          </div>
        ))}
        <div className="col-span-2">
          <label className="text-xs text-slate-500 block mb-1">Notas para el cliente (español)</label>
          <Textarea value={datos.notas_es ?? ""} onChange={(e) => set("notas_es", e.target.value)} rows={2} disabled={!puedeEditar} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500 block mb-1">Notes for the client (English)</label>
          <Textarea value={datos.notas_en ?? ""} onChange={(e) => set("notas_en", e.target.value)} rows={2} disabled={!puedeEditar} />
        </div>
      </div>
      {puedeEditar ? (
        <div className="flex items-center gap-3">
          <Button onClick={guardar} disabled={isPending}>{isPending ? "Guardando..." : "Guardar datos de pago"}</Button>
          {msg && (
            <span className={`text-xs flex items-center gap-1 ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
              {msg.ok && <Check className="h-3 w-3" />}{msg.texto}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Solo dueño o administrador pueden editar estos datos.</p>
      )}
    </div>
  )
}
