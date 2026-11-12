import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Permite subir PDFs/fotos de formularios a las acciones del servidor
    // (la plataforma limita igual a ~4.5 MB por petición).
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
