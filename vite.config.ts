import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En GitHub Pages la app vive en /<nombre-del-repo>/; el workflow define VITE_BASE.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
});
