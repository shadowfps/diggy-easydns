import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    // Reine Logik-Tests, kein DOM nötig — die getesteten Funktionen sind
    // absichtlich I/O-frei (Parsing, Validierung, Scoring, Klassifizierung).
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
