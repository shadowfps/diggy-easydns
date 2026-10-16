#!/usr/bin/env node
/**
 * Führt die E2E-Tests im offiziellen Playwright-Docker-Image aus — lokal und
 * in der CI mit demselben Befehl.
 *
 * Referenzbilder für den Pixelvergleich müssen überall gleich gerendert
 * werden. Das Image legt Ubuntu, Schriften und den Chromium-Build fest; das
 * Tag folgt der Playwright-Version aus package-lock.json und kann damit nicht
 * auseinanderlaufen.
 *
 * Fest auf linux/arm64: das ist auf Apple Silicon nativ, und die CI läuft auf
 * einem ARM-Runner (ubuntu-24.04-arm). Unter Emulation (amd64 auf dem Mac)
 * stürzt Chromium in Docker Desktop ab, und x86 rendert Kanten minimal
 * anders — die Architektur gehört also mit zur Referenz.
 *
 * Aufruf:
 *   npm run e2e:docker                          # alle Tests
 *   npm run e2e:docker -- --update-snapshots    # Referenzbilder neu erzeugen
 *
 * node_modules liegt im Container auf einem eigenen Volume: das `npm ci` dort
 * installiert Linux-Binaries und darf die des Hosts nicht überschreiben.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Aus dem Lockfile statt aus node_modules: die CI braucht so auf dem Host
// kein `npm ci`, und es ist immer die exakt installierte Version.
const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
const version = lock.packages['node_modules/@playwright/test']?.version;
if (!version) {
  console.error('@playwright/test fehlt in package-lock.json.');
  process.exit(1);
}
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

// Im Container läuft alles als root. Erzeugte Dateien (Build, Ergebnisse,
// Referenzbilder) gehen am Ende an den aufrufenden Nutzer zurück — auf einem
// Linux-Host (auch dem CI-Runner) gehörten sie sonst root.
const owner = process.getuid ? `${process.getuid()}:${process.getgid()}` : '';
const script = [
  `trap 'test -n "$OWNER" && chown -R "$OWNER" dist dist-server test-results playwright-report e2e/__screenshots__ 2>/dev/null' EXIT`,
  'npm ci --no-audit --no-fund',
  'npm run build',
  'npm run e2e -- "$@"',
].join(' && ');

console.log(`→ ${image} (linux/arm64)`);
const result = spawnSync(
  'docker',
  [
    'run', '--rm', '--platform', 'linux/arm64', '--ipc=host',
    '-v', `${ROOT}:/work`, '-v', '/work/node_modules', '-w', '/work',
    '-e', `OWNER=${owner}`,
    // Schaltet den Pixelvergleich ein (e2e/screenshots.spec.ts).
    '-e', 'E2E_DOCKER=1',
    // CI weiterreichen: steuert Reporter, forbidOnly und dass fehlende
    // Referenzbilder nicht still angelegt werden (playwright.config.ts).
    ...(process.env.CI ? ['-e', `CI=${process.env.CI}`] : []),
    image,
    'bash', '-c', script, 'e2e', ...process.argv.slice(2),
  ],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
