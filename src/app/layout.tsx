import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vertikall Haus — Sistema de Gestión",
  description: "Centro de mando operativo y financiero para proyectos de construcción",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
