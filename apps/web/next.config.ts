import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Paquetes del monorepo escritos en TypeScript
  transpilePackages: ['@agenda/core', '@agenda/db', '@agenda/auth', '@agenda/ui', '@agenda/notifications'],
  // Next.js estándar (sin funciones exclusivas de Vercel): puede correr en Docker/Cloud Run (sección 3.1)
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Fotos del catálogo (fase 3A): hasta 4 MB por foto (Vercel corta las peticiones de más de 4,5 MB)
  experimental: { serverActions: { bodySizeLimit: '4.5mb' } },
};

export default nextConfig;
