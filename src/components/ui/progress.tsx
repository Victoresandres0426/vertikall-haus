import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps {
  value: number // 0-100
  className?: string
  colorClass?: string
  showLabel?: boolean
  size?: "sm" | "md" | "lg"
}

export function Progress({ value, className, colorClass, showLabel = false, size = "md" }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))

  const getAutoColor = () => {
    if (clamped >= 70) return "bg-emerald-500"
    if (clamped >= 40) return "bg-amber-500"
    return "bg-red-500"
  }

  const heights = { sm: "h-1.5", md: "h-2", lg: "h-3" }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("flex-1 overflow-hidden rounded-full bg-slate-100", heights[size])}>
        <div
          className={cn("h-full rounded-full transition-all duration-300", colorClass ?? getAutoColor())}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-slate-600 w-10 text-right">{clamped.toFixed(0)}%</span>
      )}
    </div>
  )
}

// Indicador circular para el IIDP
interface CircularProgressProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  className?: string
}

export function CircularProgress({ value, size = 80, strokeWidth = 8, className }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const strokeDashoffset = circumference - (value / 100) * circumference

  const getColor = () => {
    if (value >= 80) return "#10b981" // emerald
    if (value >= 65) return "#3b82f6" // blue
    if (value >= 50) return "#f59e0b" // amber
    return "#ef4444" // red
  }

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-slate-900">{Math.round(value)}</span>
      </div>
    </div>
  )
}
