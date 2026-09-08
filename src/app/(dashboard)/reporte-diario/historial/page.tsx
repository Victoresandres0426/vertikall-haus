import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Header } from "@/components/layout/header"
import { ArrowRight, CalendarDays } from "lucide-react"

const ROLES_VEN_HISTORIAL = ["dueno", "superadmin", "administrador", "project_manager"]

type ReporteRow = {
  id: string
  fecha: string
  clima: string | null
  proyecto_id: string
  proyectos: { nombre: string } | null
  capataz_id: string
  perfiles_usuario: { nombre_completo: string } | null
}

async function getData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("id, empresa_id, rol")
    .eq("id", user.id)
    .single()

  if (!perfil || !ROLES_VEN_HISTORIAL.includes(perfil.rol)) redirect("/sin-acceso")

  const { data: reportesRaw } = await supabase
    .from("reportes_diarios")
    .select(`
      id, fecha, clima, proyecto_id,
      proyectos ( nombre ),
      capataz_id,
      perfiles_usuario!capataz_id ( nombre_completo )
    `)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)

  const reportes = (reportesRaw ?? []) as unknown as ReporteRow[]
  const reporteIds = reportes.map((r) => r.id)

  const resumenPorReporte: Record<string, { presentes: number; ausentes: number; horas: number; costo: number }> = {}
  for (const r of reportes) resumenPorReporte[r.id] = { presentes: 0, ausentes: 0, horas: 0, costo: 0 }

  if (reporteIds.length > 0) {
    const [{ data: asistRaw }, { data: costosRaw }] = await Promise.all([
      supabase
        .from("asistencia_diaria")
        .select("reporte_id, presente, horas_regulares, horas_extra")
        .in("reporte_id", reporteIds),
      supabase
        .from("costos_reales")
        .select("reporte_id, monto")
        .in("reporte_id", reporteIds),
    ])

    for (const a of (asistRaw ?? []) as { reporte_id: string; presente: boolean; horas_regulares: number; horas_extra: number }[]) {
      const s = resumenPorReporte[a.reporte_id]
      if (!s) continue
      if (a.presente) s.presentes += 1
      else s.ausentes += 1
      s.horas += Number(a.horas_regulares ?? 0) + Number(a.horas_extra ?? 0)
    }
    for (const c of (costosRaw ?? []) as { reporte_id: string | null; monto: number }[]) {
      if (!c.reporte_id) continue
      const s = resumenPorReporte[c.reporte_id]
      if (!s) continue
      s.costo += Number(c.monto ?? 0)
    }
  }

  return { reportes, resumenPorReporte }
}

function formatearFecha(f: string): string {
  const [y, m, d] = f.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-MX", {
    weekday: "long", day: "2-digit", month: "short", year: "numeric",
  })
}

export default async function HistorialReportesPage() {
  const { reportes, resumenPorReporte } = await getData()

  return (
    <div>
      <Header
        titulo="Historial de reportes"
        subtitulo={`${reportes.length} reporte${reportes.length !== 1 ? "s" : ""} registrado${reportes.length !== 1 ? "s" : ""}`}
      />
      <div className="p-6">
        {reportes.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Sin reportes todavía</p>
            <p className="text-sm mt-1">Los reportes diarios enviados van a aparecer aquí.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
            {reportes.map((r) => {
              const s = resumenPorReporte[r.id]
              return (
                <Link
                  key={r.id}
                  href={`/reporte-diario/historial/${r.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 capitalize">{formatearFecha(r.fecha)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.proyectos?.nombre ?? "—"} · Capataz: {r.perfiles_usuario?.nombre_completo ?? "—"}
                      {r.clima && ` · ${r.clima}`}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                    <span>{s.presentes} presentes</span>
                    {s.ausentes > 0 && <span className="text-red-500">{s.ausentes} ausentes</span>}
                    <span>{s.horas.toFixed(1)}h</span>
                    <span className="font-medium text-slate-700">
                      {s.costo > 0 ? `$${s.costo.toLocaleString("es-MX", { maximumFractionDigits: 0 })}` : "—"}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
