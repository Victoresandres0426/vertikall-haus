import { CerrarSesionBoton } from "./cerrar-sesion-boton"

export function SinProyecto({ mensaje, contacto }: { mensaje: string; contacto: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-8 text-center">
      <div>
        <p className="text-slate-600">{mensaje}</p>
        <p className="text-sm text-slate-400 mt-1">{contacto}</p>
        <div className="mt-4"><CerrarSesionBoton /></div>
      </div>
    </div>
  )
}
