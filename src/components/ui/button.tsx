import * as React from "react"
import { cn } from "@/lib/utils"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link"
  size?: "sm" | "md" | "lg" | "icon"
  isLoading?: boolean
}

export function Button({
  className,
  variant = "default",
  size = "md",
  isLoading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-slate-900 text-white hover:bg-slate-800 shadow-sm": variant === "default",
          "bg-slate-100 text-slate-900 hover:bg-slate-200": variant === "secondary",
          "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700": variant === "outline",
          "hover:bg-slate-100 text-slate-700": variant === "ghost",
          "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
          "text-slate-900 underline-offset-4 hover:underline p-0 h-auto": variant === "link",
        },
        {
          "h-8 px-3 text-xs gap-1.5": size === "sm",
          "h-9 px-4 text-sm gap-2": size === "md",
          "h-11 px-6 text-base gap-2": size === "lg",
          "h-9 w-9 p-0": size === "icon",
        },
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
