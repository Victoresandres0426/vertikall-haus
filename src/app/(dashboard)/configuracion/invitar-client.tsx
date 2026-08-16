"use client"

import { useState, useRef } from "react"
import { UserPlus, Copy, Check, X, Link as LinkIcon, Clock, Mail } from "lucide-react"
import { invitarUsuario, revocarInvitacion } from "./actions"
import { cn } from "@/lib/utils"

type Invitacion = {
  id: string
  email: string
  nombre_completo: string
  rol: string
  created_at: string
  expires_at: string
  used_at: string | null
  activa: boolean
}

type Props = {
  invitaciones: Invitacion[]
  appUrl: string
  puedeInvitar: boolean
}

const rolLabel: Record<string, string> = {
  capataz: "Capataz",
  administrador: "Administrador",
  project_manager: "Project Manager",
  dueno: "Dueño",
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `hace ${days} día${days !== 1 ? "s" : ""}`
  if (hours > 0) return `hace ${hours} hora${hours !== 1 ? "s" : ""}`
  return "hace un momento"
}

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
        copied
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 hover:bg-slate-200 text-slate-600"
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "¡Copiado!" : label}
    </button>
  )
}

export function InvitarUsuarioButton({ appUrl, puedeInvitar }: { appUrl: string; puedeInvitar: boolean }) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ token?: string; email?: string; error?: string } | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  if (!puedeInvitar) return null

  const inviteLink = result?.token ? `${appUrl}/invitacion/${result.token}` : null

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setResult(null)
    const fd = new FormData(e.currentTarget)
    const res = await invitarUsuario(fd)
    setResult(res)
    setIsLoading(false)
    if (!res.error) formRef.current?.reset()
  }

  const handleClose = () => {
    setOpen(false)
    setResult(null)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
      >
        <UserPlus className="h-4 w-4" />
        Invitar usuario
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Invitar nuevo usuario</h3>
              <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              {!inviteLink ? (
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Correo electrónico
                    </label>
                    <input
                      name="email"
                      type="email"
                      required
                      placeholder="nombre@email.com"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nombre completo
                    </label>
                    <input
                      name="nombre"
                      type="text"
                      required
                      placeholder="Juan García López"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Rol en el sistema
                    </label>
                    <select
                      name="rol"
                      required
                      defaultValue="capataz"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                    >
                      {Object.entries(rolLabel).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {result?.error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                      {result.error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? "Generando invitación..." : "Crear invitación"}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 mx-auto">
                    <Check className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-900 mb-0.5">¡Invitación creada!</p>
                    <p className="text-xs text-slate-500">Envía este link a {result?.email}</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <LinkIcon className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-xs font-medium text-slate-600">Link de activación</span>
                    </div>
                    <p className="text-xs text-slate-500 break-all mb-2 font-mono">{inviteLink}</p>
                    <CopyButton text={inviteLink} label="Copiar link" />
                  </div>

                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>El link expira en 7 días. Puedes generar uno nuevo desde Configuración.</span>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full border border-slate-200 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function InvitacionesPendientes({ invitaciones }: { invitaciones: Invitacion[] }) {
  const [revoking, setRevoking] = useState<string | null>(null)

  const pendientes = invitaciones.filter((i) => i.activa && !i.used_at)
  const usadas = invitaciones.filter((i) => i.used_at)

  if (invitaciones.length === 0) return null

  const handleRevoke = async (id: string) => {
    setRevoking(id)
    await revocarInvitacion(id)
    setRevoking(null)
  }

  return (
    <div className="space-y-4">
      {pendientes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Invitaciones pendientes
          </p>
          <div className="space-y-2">
            {pendientes.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{inv.nombre_completo}</p>
                  <p className="text-xs text-slate-500">{inv.email} · {rolLabel[inv.rol] ?? inv.rol}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{timeAgo(inv.created_at)}</span>
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    disabled={revoking === inv.id}
                    className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="Revocar invitación"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {usadas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Activadas recientemente
          </p>
          <div className="space-y-2">
            {usadas.slice(0, 5).map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                <Mail className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{inv.nombre_completo}</p>
                  <p className="text-xs text-slate-500">{inv.email} · {rolLabel[inv.rol] ?? inv.rol}</p>
                </div>
                <span className="text-xs text-emerald-600 font-medium shrink-0">Activada</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
