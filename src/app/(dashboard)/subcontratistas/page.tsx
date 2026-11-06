import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Header } from "@/components/layout/header"
import {
  SubcontratistasClient,
  type Subcontratista,
  type Subcontrato,
  type ProyectoOpcion,
  type ActividadOpcion,
  type DocumentoSub,
} from "./subcontratistas-client"

const ROLES_GESTION = ["project_manager", "administrador", "dueno", "superadmin"]
const ROLES_BORRAN = ["administrador", "dueno", "superadmin"]

export default async function SubcontratistasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: perfil } = await supabase
    .from("perfiles_usuario")
    .select("rol, empresa_id")
    .eq("id", user.id)
    .single()
  if (!perfil || !ROLES_GESTION.includes(perfil.rol)) redirect("/sin-acceso")

  const [{ data: subs }, { data: contratos }, { data: proyectos }, { data: actividades }, { data: asignaciones }, { data: documentos }] =
    await Promise.all([
      supabase.from("subcontratistas").select("*").eq("empresa_id", perfil.empresa_id).order("nombre_compania"),
      supabase
        .from("subcontratos")
        .select("id, subcontratista_id, proyecto_id, alcance, monto_contrato, fecha_inicio, fecha_fin, estado, notas")
        .order("created_at", { ascending: false }),
      supabase
        .from("proyectos")
        .select("id, codigo, nombre")
        .eq("empresa_id", perfil.empresa_id)
        .eq("activo", true)
        .order("nombre"),
      supabase
        .from("actividades")
        .select("id, proyecto_id, codigo, nombre")
        .eq("activa", true)
        .order("codigo"),
      supabase.from("subcontrato_actividades").select("subcontrato_id, actividad_id"),
      supabase
        .from("subcontratista_documentos")
        .select("id, subcontratista_id, tipo, nombre_archivo, storage_path, fecha_vence, notas, created_at")
        .order("created_at", { ascending: false }),
    ])

  const actPorContrato = new Map<string, string[]>()
  for (const a of (asignaciones ?? []) as { subcontrato_id: string; actividad_id: string }[]) {
    const arr = actPorContrato.get(a.subcontrato_id) ?? []
    arr.push(a.actividad_id)
    actPorContrato.set(a.subcontrato_id, arr)
  }

  const contratosConActs: Subcontrato[] = ((contratos ?? []) as Omit<Subcontrato, "actividad_ids">[]).map((c) => ({
    ...c,
    monto_contrato: Number(c.monto_contrato ?? 0),
    actividad_ids: actPorContrato.get(c.id) ?? [],
  }))

  const activos = (subs ?? []).filter((s) => s.activo).length

  return (
    <div>
      <Header
        titulo="Subcontratistas"
        subtitulo={`${(subs ?? []).length} registrados · ${activos} activos · ${contratosConActs.filter((c) => c.estado === "activo").length} contratos activos`}
      />
      <SubcontratistasClient
        subcontratistas={(subs ?? []) as Subcontratista[]}
        contratos={contratosConActs}
        proyectos={(proyectos ?? []) as ProyectoOpcion[]}
        actividades={(actividades ?? []) as ActividadOpcion[]}
        documentos={(documentos ?? []) as DocumentoSub[]}
        empresaId={perfil.empresa_id}
        puedeBorrar={ROLES_BORRAN.includes(perfil.rol)}
      />
    </div>
  )
}
