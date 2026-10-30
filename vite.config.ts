import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Der Commit, aus dem gebaut wird — für die Versionsanzeige im Footer. Im
 * Docker-Build fehlt .git (.dockerignore); dort reicht die CI ihn als
 * DIGGY_COMMIT durch (container.yml, deploy-dev.yml). Lokal fragt Vite git.
 * Geht beides nicht, bleibt er leer und der Footer zeigt nur die Version.
 */
function buildCommit(): string {
  const fromCi = process.env.DIGGY_COMMIT?.trim();
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Entfernt die Schriften, die Flow von cdn.mittwald.de lädt.
 *
 * Das Stylesheet von Flow bringt `@font-face`-Regeln für Inter und Fira Code
 * mit, deren Dateien auf cdn.mittwald.de liegen. Damit ginge bei jedem
 * Seitenaufruf die IP des Besuchers an einen Dritten — genau das, was diggy
 * mit den lokalen Schriften vermeidet (siehe src/styles/fonts.css), und die
 * CSP (`font-src 'self'`) würde die Dateien ohnehin blockieren. Dieselben
 * Familien liefert diggy selbst aus; hier verschwinden nur die fremden Regeln.
 *
 * Scheitert das Entfernen (Flow ändert das Format), bricht der Build ab,
 * statt still einen Drittanbieter einzubinden. `npm run size` prüft das
 * Ergebnis zusätzlich am gebauten CSS.
 */
function flowSelfHostedFonts(): Plugin {
  const FLOW_CSS = /@mittwald\/flow-react-components\/dist\/css\/[^/]+\.css$/;
  const CDN_FONT_FACE = /@font-face\s*\{[^}]*cdn\.mittwald\.de[^}]*\}/g;
  return {
    name: 'diggy-flow-self-hosted-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!FLOW_CSS.test(id.split('?')[0])) return null;
      const stripped = code.replace(CDN_FONT_FACE, '');
      if (stripped.includes('cdn.mittwald.de')) {
        throw new Error('[diggy-flow-self-hosted-fonts] Flow-CSS verweist weiter auf cdn.mittwald.de.');
      }
      return { code: stripped, map: null };
    },
  };
}

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
  plugins: [react(), flowSelfHostedFonts(), englishPreload()],
  define: {
    'import.meta.env.DIGGY_COMMIT': JSON.stringify(buildCommit()),
  },
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
         * den App-Chunk neu. React und Flow ändern sich selten, der App-Code
         * bei jedem Push.
         *
         * Funktionsform, nicht Objektform: Vite 8 bündelt mit rolldown, und
         * rolldown nimmt für `manualChunks` ausschließlich eine Funktion
         * ("manualChunks is not a function"). Die Objektform ließ rollup die
         * Abhängigkeiten eines Pakets mitziehen — hier muss jedes Modul selbst
         * matchen, deshalb steht `scheduler` (Abhängigkeit von react-dom)
         * ausdrücklich dabei. Ohne das läge es im App-Chunk und der
         * React-Chunk wäre nicht mehr für sich ladbar.
         *
         * Flow bekommt bewusst keinen eigenen Chunk: Sein Einstieg exportiert
         * alle Komponenten, ein Chunk für „alles aus Flow“ zöge auch List und
         * Form samt MobX-Tabellen, zod und Luxon in den ersten Aufruf, weil
         * nachgeladene Seiten sie von dort importierten (gemessen: 311 statt
         * rund 190 kB gzip). rolldown teilt Flow selbst nach Nutzung auf;
         * scripts/check-bundle-size.mjs budgetiert diese Chunks als Gruppe.
         */
        manualChunks(id: string) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
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
