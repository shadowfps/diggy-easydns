#!/usr/bin/env node
/**
 * Bundle-Budget für den kritischen Pfad.
 *
 * Anlass war der Umstieg auf React 19: der react-Chunk wuchs dabei von 43,09
 * auf 65,70 kB gzip. Das war eine bewusste Entscheidung — aufgefallen ist es
 * aber nur, weil beim Umstieg jemand hingesehen hat. Der nächste Zuwachs soll
 * sich von selbst melden.
 *
 * Welche Dateien zum kritischen Pfad gehören, wird nicht gepflegt, sondern aus
 * `dist/index.html` gelesen: das Entry-Script, alles mit `modulepreload` und
 * die Stylesheets. Genau das lädt der Browser, bevor er etwas zeigen kann.
 * Lazy geladene Chunks (GSAP, die Hero-Komponenten, PageSpeed- und
 * VirusScan-Ansicht) stehen dort nicht und zählen deshalb nicht mit — sie
 * werden am Ende nur zur Ansicht aufgelistet.
 *
 * Aufruf: `npm run size` (setzt einen Build in `dist/` voraus).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/**
 * Obergrenzen in kB gzip, je Chunk des kritischen Pfads.
 *
 * Die Werte in Klammern sind der Stand bei Einführung (21.09.2026, nach React
 * 19.3 und Motion 13.4). Der Abstand liegt bei rund 7 % — genug, damit eine
 * normale Patch-Runde nicht rot wird, eng genug, damit ein Sprung in der
 * Größenordnung des React-Upgrades (+22,6 kB) sicher auffällt.
 *
 * Wird eine Grenze überschritten, ist das kein Fehler, sondern eine Frage:
 * lohnt der Zuwachs? Lautet die Antwort ja, wird hier die Zahl angehoben —
 * mit dem Grund im Commit.
 */
const BUDGETS_KB = {
  'react.js': 68, // 63,36
  'motion.js': 48, // 44,43
  'index.js': 48, // 43,73
  'icons.js': 9, // 7,78
  'index.css': 9, // 8,12
  'rolldown-runtime.js': 1, // 0,39
};

/** Obergrenze für die Summe. Fängt auch einen neuen, ungebudgetierten Chunk. */
const CRITICAL_PATH_BUDGET_KB = 176; // 167,80

/**
 * Aus `react-BAgBMDim.js` wird `react.js` — der Hash wechselt bei jedem Build.
 *
 * Genau acht Zeichen, nicht "acht oder mehr": der Hash darf selbst Bindestriche
 * enthalten (`SplitText--rY3zq7E.js`), und eine gierige Regel fraß sonst einen
 * Teil des Namens mit — aus `rolldown-runtime-CbXtAM7H` wurde `rolldown`, und
 * dessen Budget griff stillschweigend nicht mehr.
 */
function logicalName(file) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  return `${base.replace(/-[A-Za-z0-9_-]{8}$/, '')}${ext}`;
}

const kb = (bytes) => bytes / 1024;
const fmt = (value) => value.toFixed(2).padStart(7);

function gzipSize(file) {
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html fehlt — erst `npm run build` ausführen.');
  process.exit(1);
}

// Das Entry-Script, die modulepreload-Hinweise und die Stylesheets. Alles
// andere in index.html (Inline-Script für die CSP, Meta-Tags) ist hier egal.
const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map(
  (match) => match[1]
);

if (referenced.length === 0) {
  console.error('Keine Assets in dist/index.html gefunden — hat sich das Build-Layout geändert?');
  process.exit(1);
}

const entries = [...new Set(referenced)].map((rel) => {
  const file = path.join(DIST, rel);
  if (!existsSync(file)) {
    console.error(`In index.html referenziert, aber nicht vorhanden: ${rel}`);
    process.exit(1);
  }
  const name = logicalName(rel);
  return { name, size: gzipSize(file), budget: BUDGETS_KB[name] };
});

entries.sort((a, b) => b.size - a.size);

/*
 * Ein Budget, das auf keine Datei mehr passt, prüft nichts mehr — und sagt es
 * niemandem. Benennt Vite seine Chunks um oder ändert sich die Hash-Länge,
 * soll das hier scheitern statt stillschweigend durchzuwinken.
 */
const orphaned = Object.keys(BUDGETS_KB).filter(
  (name) => !entries.some((entry) => entry.name === name)
);
if (orphaned.length > 0) {
  console.error(
    `Budget-Einträge ohne passende Datei: ${orphaned.join(', ')}.\n` +
      'Entweder ist der Chunk weg oder das Build-Layout hat sich geändert — ' +
      'in beiden Fällen gehört scripts/check-bundle-size.mjs nachgezogen.'
  );
  process.exit(1);
}

const total = entries.reduce((sum, entry) => sum + entry.size, 0);
const breaches = entries.filter((entry) => entry.budget !== undefined && kb(entry.size) > entry.budget);
const totalBreached = kb(total) > CRITICAL_PATH_BUDGET_KB;

console.log('Kritischer Pfad (gzip)\n');
for (const entry of entries) {
  const budget = entry.budget === undefined ? '      —' : `${entry.budget}`.padStart(7);
  const mark = entry.budget !== undefined && kb(entry.size) > entry.budget ? ' ÜBER BUDGET' : '';
  console.log(`  ${entry.name.padEnd(22)} ${fmt(kb(entry.size))} kB  Budget ${budget} kB${mark}`);
}
console.log(`  ${'—'.repeat(22)} ${'—'.repeat(10)}`);
console.log(
  `  ${'Summe'.padEnd(22)} ${fmt(kb(total))} kB  Budget ${`${CRITICAL_PATH_BUDGET_KB}`.padStart(7)} kB${
    totalBreached ? ' ÜBER BUDGET' : ''
  }`
);

// Nur zur Ansicht: was der Browser erst bei Bedarf nachlädt.
const lazy = readdirSync(path.join(DIST, 'assets'))
  .filter((file) => file.endsWith('.js') && !referenced.includes(`assets/${file}`))
  .map((file) => ({ name: logicalName(file), size: gzipSize(path.join(DIST, 'assets', file)) }))
  .sort((a, b) => b.size - a.size);

if (lazy.length > 0) {
  console.log('\nNachgeladen (ohne Budget)\n');
  for (const entry of lazy) {
    console.log(`  ${entry.name.padEnd(22)} ${fmt(kb(entry.size))} kB`);
  }
}

const unbudgeted = entries.filter((entry) => entry.budget === undefined);
if (unbudgeted.length > 0) {
  console.log(
    `\nHinweis: ${unbudgeted
      .map((entry) => entry.name)
      .join(', ')} liegt im kritischen Pfad, hat aber kein eigenes Budget.`
  );
}

if (breaches.length > 0 || totalBreached) {
  console.error(
    '\nBundle-Budget überschritten. Wenn der Zuwachs gewollt ist: Grenze in' +
      ' scripts/check-bundle-size.mjs anheben und im Commit begründen.'
  );
  process.exit(1);
}

console.log('\nBundle-Budget eingehalten.');
