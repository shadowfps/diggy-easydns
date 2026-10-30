import { version } from '../../package.json';

/**
 * Was gerade läuft, für den Footer: die Version aus package.json — der
 * einzigen Stelle, an der sie steht — und der Commit des Builds, den Vite
 * einsetzt (vite.config.ts). Der Commit stimmt auch dann, wenn beim Release
 * das Hochzählen vergessen wurde, und sagt auf dev, welcher Stand zu testen ist.
 */
export function buildLabel(commit = import.meta.env.DIGGY_COMMIT): string {
  return commit ? `v${version} · ${commit}` : `v${version}`;
}
