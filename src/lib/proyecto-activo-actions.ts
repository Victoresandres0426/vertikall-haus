"use server"

import { cookies } from "next/headers"
import { PROYECTO_ACTIVO_COOKIE } from "@/lib/proyecto-activo"

export async function setProyectoActivo(proyectoId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(PROYECTO_ACTIVO_COOKIE, proyectoId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 año
    sameSite: "lax",
  })
}
