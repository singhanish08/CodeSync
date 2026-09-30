import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vercel serves the built assets from the project root, so keep the base
  // relative so the static build works regardless of deployment path.
  base: './',
  server: {
    port: 5176,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Monaco is heavy; raise the warning threshold rather than split-hacking.
    chunkSizeWarningLimit: 3000,
  },
});
