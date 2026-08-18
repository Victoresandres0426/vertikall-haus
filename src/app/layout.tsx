import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  metadataBase: new URL("https://vertikall-haus.vercel.app"),
  title: "Vertikall Haus — Sistema de Gestión",
  description: "Centro de mando operativo y financiero para proyectos de construcción",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vertikall Haus",
  },
  openGraph: {
    title: "Vertikall Haus — Sistema de Gestión",
    description: "Centro de mando operativo y financiero para proyectos de construcción",
    url: "https://vertikall-haus.vercel.app",
    siteName: "Vertikall Haus",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "es_MX",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vertikall Haus — Sistema de Gestión",
    description: "Centro de mando operativo y financiero para proyectos de construcción",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#3b72d8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
