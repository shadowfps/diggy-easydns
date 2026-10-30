/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Kurzer Commit des Builds (vite.config.ts) — leer ohne git und CI, etwa in Tests. */
  readonly DIGGY_COMMIT?: string;
}
