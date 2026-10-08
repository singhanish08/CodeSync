import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Absolute base: the SPA rewrite serves index.html for nested routes like
  // /room/:roomId, where a relative base would resolve ./assets to /room/assets.
  base: '/',
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
