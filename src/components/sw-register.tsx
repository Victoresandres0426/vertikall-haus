"use client"

import { useEffect } from "react"

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Si falla el registro, la app sigue funcionando normal en el navegador,
        // solo no se ofrecerá la instalación completa como PWA.
      })
    }
  }, [])

  return null
}
