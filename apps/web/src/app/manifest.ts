import type { MetadataRoute } from 'next';

// PWA instalable desde el día 1 (directrices, sección 22)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Agenda',
    short_name: 'Agenda',
    description: 'La agenda de tu negocio de servicios',
    lang: 'es-CL',
    start_url: '/panel',
    display: 'standalone',
    background_color: '#fbfaf8',
    theme_color: '#2b3445',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
