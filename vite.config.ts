import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  build: {
    rollupOptions: {
      output: {
        // Firebase changes rarely: keep it in its own long-lived cached chunk.
        manualChunks: (id) => (id.includes('node_modules/@firebase/') || id.includes('node_modules/firebase/') ? 'firebase' : undefined),
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
