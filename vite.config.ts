import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Vendor-Code in eigene, langlebig cachebare Chunks.
         *
         * Ändert die Gesamtgröße kaum, aber Folgebesuche und Deploys laden nur
         * den App-Chunk neu statt der kompletten 570 kB. React und
         * framer-motion ändern sich selten, der App-Code bei jedem Push.
         */
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
