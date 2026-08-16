import { Building2, Lock } from "lucide-react"
import Link from "next/link"

export default function SinAccesoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[400px] text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 mb-6">
          <Lock className="h-10 w-10 text-white/70" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Acceso restringido</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
          Tu cuenta no tiene acceso a este sistema. Para obtener acceso,
          solicita una invitación al administrador de tu empresa.
        </p>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-left mb-6">
          <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">
            ¿Qué hacer?
          </p>
          <ol className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="font-bold text-slate-300 shrink-0">1.</span>
              Contacta al dueño o administrador de Vertikall Haus en tu empresa.
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-slate-300 shrink-0">2.</span>
              Pídele que te envíe un link de invitación desde Configuración → Equipo.
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-slate-300 shrink-0">3.</span>
              Abre el link y crea tu contraseña.
            </li>
          </ol>
        </div>

        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <Building2 className="h-4 w-4" />
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  )
}
