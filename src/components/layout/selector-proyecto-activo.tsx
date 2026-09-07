"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { ProyectoSelector, type ProyectoLigero } from "./header"
import { setProyectoActivo } from "@/lib/proyecto-activo-actions"

// Selector de proyecto "activo" para las páginas de Operación y Finanzas
// (Reporte Diario, Actividades, Materiales, Recursos, Presupuesto, Change
// Orders, Facturas, Flujo de Caja). Al cambiarlo, guarda la elección en una
// cookie que las demás páginas leen, para que todas muestren el mismo
// proyecto sin tener que volver a elegirlo cada vez.
export function SelectorProyectoActivo({
  proyectos,
  proyectoActualId,
}: {
  proyectos: ProyectoLigero[]
  proyectoActualId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <ProyectoSelector
      proyectos={proyectos}
      proyectoActualId={proyectoActualId}
      onSeleccionar={(id) => {
        startTransition(async () => {
          await setProyectoActivo(id)
          router.refresh()
        })
      }}
      className={isPending ? "opacity-60 pointer-events-none" : undefined}
    />
  )
}
