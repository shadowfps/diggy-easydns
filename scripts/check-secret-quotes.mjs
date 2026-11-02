#!/usr/bin/env node
/**
 * Bricht einen Deploy ab, wenn ein Secret in Anführungszeichen steht.
 *
 * Am 31.10.2026 scheiterte das Kontaktformular mit „535 authentication
 * failed“: `SMTP_PASS` und `CONTACT_FROM` waren samt den `"…"` bzw. `'…'`
 * aus der `.env` als GitHub-Secrets angelegt. In der `.env` sind die Zeichen
 * Syntax, im Secret gehören sie zum Wert — der Deploy schreibt ihn
 * unverändert in die Env-Datei für `mw stack deploy`, und der Mailserver
 * bekam ein Passwort mit zwei Zeichen zu viel. Aufgefallen ist das erst
 * Monate später im Betrieb.
 *
 *   node scripts/check-secret-quotes.mjs SMTP_PASS CONTACT_FROM …
 *
 * Meldet je betroffenem Secret eine Fehlerzeile für GitHub Actions — mit
 * dem Namen, nie dem Wert — und endet dann mit Code 1. Ein Wert, der nur mit
 * einem Anführungszeichen beginnt (`"diggy" <noreply@…>`), ist in Ordnung.
 */

import { pathToFileURL } from 'node:url';

const QUOTES = new Set(['"', "'"]);

/** Die Namen der Secrets, deren Wert ganz in Anführungszeichen steht. */
export function quotedSecrets(names, env = process.env) {
  return names.filter((name) => {
    const value = (env[name] ?? '').trim();
    return value.length >= 2 && QUOTES.has(value[0]) && value.at(-1) === value[0];
  });
}

function main() {
  const names = process.argv.slice(2);
  const quoted = quotedSecrets(names);
  for (const name of quoted) {
    console.log(
      `::error title=Secret in Anführungszeichen::${name} steht in Anführungszeichen. ` +
        'Das Secret ohne die Anführungszeichen aus der .env setzen, z. B. ' +
        `node --env-file=.env -e 'process.stdout.write(process.env.${name})' | gh secret set ${name}`
    );
  }
  if (quoted.length > 0) process.exit(1);
  console.log(`${names.length} Secrets ohne umschließende Anführungszeichen.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
