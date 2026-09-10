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
         *
         * Funktionsform, nicht Objektform: Vite 8 bündelt mit rolldown, und
         * rolldown nimmt für `manualChunks` ausschließlich eine Funktion
         * ("manualChunks is not a function"). Die Objektform ließ rollup die
         * Abhängigkeiten eines Pakets mitziehen — hier muss jedes Modul selbst
         * matchen, deshalb steht `scheduler` (Abhängigkeit von react-dom)
         * ausdrücklich dabei. Ohne das läge es im App-Chunk und der
         * React-Chunk wäre nicht mehr für sich ladbar.
         */
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (/node_modules\/framer-motion\//.test(id)) return 'motion';
          if (/node_modules\/lucide-react\//.test(id)) return 'icons';
          return undefined;
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
