import * as React from "react"
import { cn } from "@/lib/utils"
import { type NivelAlerta } from "@/types/database"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "bg-slate-900 text-white": variant === "default",
          "bg-slate-100 text-slate-700": variant === "secondary",
          "bg-red-100 text-red-700": variant === "destructive",
          "border border-slate-200 text-slate-700": variant === "outline",
          "bg-emerald-100 text-emerald-700": variant === "success",
        },
        className
      )}
      {...props}
    />
  )
}

// Badge de alerta (semáforo)
interface AlertaBadgeProps {
  nivel: NivelAlerta
  className?: string
}

export function AlertaBadge({ nivel, className }: AlertaBadgeProps) {
  const estilos = {
    verde: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    amarillo: "bg-amber-100 text-amber-700 border border-amber-200",
    rojo: "bg-red-100 text-red-700 border border-red-200",
  }
  const labels = {
    verde: "Verde",
    amarillo: "Amarillo",
    rojo: "Rojo",
  }
  const dots = {
    verde: "bg-emerald-500",
    amarillo: "bg-amber-500",
    rojo: "bg-red-500",
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", estilos[nivel], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[nivel])} />
      {labels[nivel]}
    </span>
  )
}
