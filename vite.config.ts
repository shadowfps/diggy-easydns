import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * Setzt den Pfad des englischen Wörterbuchs in index.html ein (#86).
 *
 * Das Inline-Script dort lädt den Chunk für englische Besucher vor, kennt
 * aber den Hash im Dateinamen nicht. Im Dev-Server ist es der Quellpfad —
 * derselbe, den `import('./en')` dort anfragt.
 */
function englishPreload(): Plugin {
  const PLACEHOLDER = '__DIGGY_EN_CHUNK__';
  return {
    name: 'diggy-english-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!html.includes(PLACEHOLDER)) return html;
        if (!ctx.bundle) return html.replace(PLACEHOLDER, '/src/i18n/en.ts');
        const chunk = Object.values(ctx.bundle).find(
          (output) => output.type === 'chunk' && output.facadeModuleId?.endsWith('/src/i18n/en.ts')
        );
        if (!chunk) throw new Error('[diggy-english-preload] Chunk für src/i18n/en.ts nicht gefunden.');
        return html.replace(PLACEHOLDER, `/${chunk.fileName}`);
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), englishPreload()],
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
         * den App-Chunk neu statt der kompletten 570 kB. React und Motion
         * ändern sich selten, der App-Code bei jedem Push.
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
          // Vier Pakete statt einem, und `framer-motion` gehört ausdrücklich
          // dazu: `motion` ist nur ein Wrapper, der von `framer-motion`
          // abhängt und es re-exportiert — dort liegt die Implementierung.
          // `motion-dom` und `motion-utils` bilden den Kern. Fehlt eines,
          // landen dessen Module im App-Chunk, und der ist genau der, der
          // bei jedem Push neu geladen wird (#33). Nachgemessen: ohne
          // `framer-motion` in dieser Liste wanderten 79 Module und 10,8 kB
          // dorthin.
          if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) {
            return 'motion';
          }
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
