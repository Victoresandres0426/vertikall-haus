import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { BotonImprimir } from "./boton-imprimir"

export default async function ImprimirQRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: proyecto, error } = await supabase
    .from("proyectos")
    .select("id, codigo, nombre, qr_token")
    .eq("id", id)
    .single()

  if (error || !proyecto) notFound()
  if (!proyecto.qr_token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-slate-500">
        Este proyecto todavía no tiene un código QR de asistencia generado.
      </div>
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vertikall-haus.vercel.app"
  const checkInUrl = `${appUrl}/check-in/${proyecto.qr_token}`
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(checkInUrl)}&size=400x400&bgcolor=ffffff&color=0f172a&margin=8`

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm font-medium text-slate-400 font-mono">{proyecto.codigo}</p>
        <h1 className="text-2xl font-bold text-slate-900">{proyecto.nombre}</h1>
        <p className="text-base text-slate-600">Escanea para registrar tu entrada o salida</p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrImgUrl}
          alt={`QR de asistencia — ${proyecto.nombre}`}
          width={400}
          height={400}
          className="border-2 border-slate-200 rounded-2xl p-4"
        />

        <p className="text-xs text-slate-400 max-w-xs">Vertikall Haus — Control de asistencia</p>

        <div className="print:hidden mt-2">
          <BotonImprimir />
        </div>
      </div>
    </div>
  )
}
