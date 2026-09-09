import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Gemeinsame Basis. Die Aufteilung in Umgebungen steht in
 * `vitest.workspace.ts` — Vitest 2 erwartet sie dort, nicht als
 * `test.projects` (das kam erst mit Vitest 3).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});
