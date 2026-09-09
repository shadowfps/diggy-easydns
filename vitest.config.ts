import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const alias = {
  '@': path.resolve(import.meta.dirname, './src'),
  '@shared': path.resolve(import.meta.dirname, './shared'),
};

const excludeBuilds = ['dist/**', 'dist-server/**', 'node_modules/**'];

/**
 * Zwei Projekte, weil die Testarten unterschiedliche Umgebungen brauchen:
 *
 * - **server** prüft reine Logik (Parsing, Validierung, Scoring,
 *   IP-Klassifizierung) in `node`, dazu die Integrationstests gegen echtes
 *   Express und einen SMTP-Sink. Ein DOM wäre dort nur Ballast — jsdom
 *   aufzusetzen kostet pro Datei mehr Zeit als die Tests brauchen.
 * - **client** braucht ein DOM und ein eigenes Setup für die Browser-APIs,
 *   die jsdom nicht mitbringt (siehe src/test/setup.ts).
 *
 * Getrennt statt über `environmentMatchGlobs`, weil `setupFiles` global gilt
 * und in der Node-Umgebung an `window` scheitern würde.
 *
 * `exclude` ist nötig, weil der Glob `server/**` sonst auch nach
 * `dist-server/server/**` greift — die Tests liefen dann doppelt, einmal aus
 * dem Quelltext und einmal aus dem Kompilat.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          exclude: excludeBuilds,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: excludeBuilds,
          restoreMocks: true,
        },
      },
    ],
  },
});
