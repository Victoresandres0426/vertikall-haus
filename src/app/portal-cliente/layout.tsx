import { createClient } from "@/lib/supabase/server"
import { VistaPreviaBanner } from "@/components/layout/vista-previa-banner"

// Solo agrega el banner "Vista previa como ..." cuando el dueño está usando
// "Ver como" -- para clientes/colaboradores reales no cambia nada.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let rolPreview: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc("vista_previa_actual")
    rolPreview = (data as { rol?: string } | null)?.rol ?? null
  } catch {
    rolPreview = null
  }

  return (
    <>
      {rolPreview && <VistaPreviaBanner rol={rolPreview} />}
      {children}
    </>
  )
}
