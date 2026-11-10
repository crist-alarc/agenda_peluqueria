import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Paquetes del monorepo escritos en TypeScript
  transpilePackages: ['@agenda/core', '@agenda/db', '@agenda/auth', '@agenda/ui'],
  // Next.js estándar (sin funciones exclusivas de Vercel): puede correr en Docker/Cloud Run (sección 3.1)
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

export default nextConfig;
