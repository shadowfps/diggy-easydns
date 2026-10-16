#!/usr/bin/env node
/**
 * Findet deutsche Texte, die am Übersetzungsmodul vorbeilaufen (#86).
 *
 * Seit es eine englische Version gibt, muss jeder sichtbare Text durch `t()`.
 * Ein vergessener Text fällt sonst erst auf, wenn jemand die Seite auf
 * Englisch öffnet — mitten im englischen Satz steht dann Deutsch. Der
 * Compiler hilft dabei nicht: für ihn ist „Kein Eintrag“ in JSX ein String
 * wie jeder andere.
 *
 * Gemeldet wird, im Quelltext unter src/ (ohne i18n/, Tests und Setup):
 *
 * 1. JSX-Text und Attribute (aria-label, title, placeholder …), die deutsch
 *    aussehen. Die können nie übersetzt sein.
 * 2. Andere Strings, die deutsch aussehen, nicht direkt in `t()`/`tRich()`
 *    stehen und kein Schlüssel aus `src/i18n/de.ts` sind. Schlüssel dürfen
 *    in Tabellen stehen (`label: 'Verfügbar'`) — übersetzt wird beim Rendern,
 *    und dass der Typ stimmt, prüft der Compiler.
 * 3. Schlüssel in de.ts, die nirgends mehr vorkommen.
 *
 * „Deutsch aussehen“ heißt: Umlaut oder ß, ein typisch deutsches Wort
 * („und“, „nicht“, „keine“ …) oder eine typisch deutsche Endung (-ung, -keit,
 * -lich …). Das trifft nicht jedes einzelne deutsche Wort („Kalender“ rutscht
 * durch), meldet aber keine englischen Texte, Klassen oder Kennungen — es soll
 * in `npm run verify` laufen können, ohne Fehlalarme.
 *
 * Bewusst deutsch bleibt:
 * - ein Element mit `lang="de"` samt Inhalt (Rechtstexte im Impressum),
 * - eine Datei mit dem Kommentar `i18n-ignore-file` (Datenschutztext),
 * - Argumente von `console.*`.
 *
 * Aufruf: `npm run i18n`. Vorgehen beim Nachziehen: docs/I18N.md.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ─── Was ist deutsch? ────────────────────────────────────────────────── */

/**
 * Wörter, die es so nur im Deutschen gibt. Keine, die auch Englisch sind
 * („die“, „was“, „an“, „also“, „will“) — die würden englische Texte melden.
 */
const GERMAN_WORDS = new Set(
  `der das dem den des und oder nicht kein keine keinen keiner keinem ist sind
   wird werden wurde wurden mit auf von zu zum zur bei nach vor seit noch nur
   auch bitte dein deine deiner deinem deinen ich wir ein eine einen einem
   einer wie aus durch ohne hier jetzt alle alles gerade eben weitere fehlt
   gesetzt aktiv inaktiv erneut unbekannt vergeben unklar zuletzt geladen
   gesendet sekunden tage tagen monate jahre zeichen bereit
   schon sich sein seine dieser diese dieses diesem diesen gibt haben hat
   kann muss soll sollte wenn dann weil aber sowie bzw letzte letzten neu
   laden starten starte anzeigen suchen worum geht fehlgeschlagen
   abgeschlossen unterbrochen valide erstellt wichtigster hervorragend
   solides optimierbar sauber schlecht messe analysiere`.split(/\s+/)
);

/**
 * Hauptwörter zählen nur großgeschrieben: klein stehen sie als Kennung im
 * Code (`view === 'impressum'`, Pfad `/datenschutz`), groß nur im Text.
 */
const GERMAN_NOUNS = new Set(
  `Impressum Datenschutz Sprache Rechtliches Hinweis Aussteller Protokoll
   Algorithmus Standort Koordinaten Zeitzone Nachricht Beispiele`.split(/\s+/)
);

const GERMAN_SUFFIX =
  /\p{L}{3,}(?:ungen|ung|keit|heit|schaft|lich|liche|lichen|ieren|iert|isch|sperre|schutz|formular|projekt|bereiche?|werk|punkt|bezug)$/u;

export function looksGerman(text) {
  const oneWord = !/\s/.test(text.trim());
  // Pfade und Modulnamen (`/datenschutz`, `@/modules/impressum/…`) sind Code.
  if (oneWord && text.includes('/')) return false;
  if (/[äöüÄÖÜß]/.test(text)) return true;
  for (const word of text.match(/\p{L}+/gu) ?? []) {
    const lower = word.toLowerCase();
    if (GERMAN_WORDS.has(lower) || GERMAN_NOUNS.has(word)) return true;
    // Die Endung allein reicht nur im Satz oder großgeschrieben: ein einzelnes
    // kleines Wort wie `datenschutz` ist eine Kennung (Route, View).
    if (GERMAN_SUFFIX.test(lower) && (!oneWord || word[0] !== lower[0])) return true;
  }
  return false;
}

/* ─── Katalog aus de.ts ───────────────────────────────────────────────── */

/**
 * Alle Schlüssel: die String-Typen der Union `DeText` (auch aus Typen, die
 * de.ts importiert, etwa `Verdict`) und die Schlüssel von `DE_PLURALS`.
 */
export function readCatalog(deFile = path.join(ROOT, 'src/i18n/de.ts')) {
  const keys = new Set();
  const source = parse(deFile);

  const aliases = new Map();
  const collectAliases = (sourceFile) => {
    for (const statement of sourceFile.statements) {
      if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement.type);
    }
  };
  collectAliases(source);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier.text;
    const resolved = spec.startsWith('@shared/')
      ? path.join(ROOT, 'shared', `${spec.slice('@shared/'.length)}.ts`)
      : spec.startsWith('@/')
        ? path.join(ROOT, 'src', `${spec.slice(2)}.ts`)
        : null;
    if (resolved) collectAliases(parse(resolved));
  }

  const visitType = (node) => {
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) keys.add(node.literal.text);
    else if (ts.isUnionTypeNode(node)) node.types.forEach(visitType);
    else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
      const target = aliases.get(node.typeName.text);
      if (target) visitType(target);
    }
  };
  visitType(aliases.get('DeText'));

  const visitPlurals = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'DE_PLURALS') {
      let init = node.initializer;
      while (init && !ts.isObjectLiteralExpression(init)) init = init.expression;
      for (const property of init?.properties ?? []) {
        if (ts.isPropertyAssignment(property)) {
          const name = property.name;
          keys.add(ts.isStringLiteral(name) || ts.isIdentifier(name) ? name.text : name.getText(source));
        }
      }
    }
    ts.forEachChild(node, visitPlurals);
  };
  visitPlurals(source);

  return keys;
}

/* ─── Quelltext prüfen ────────────────────────────────────────────────── */

function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const TRANSLATE_CALLS = new Set(['t', 'tRich']);

function calleeName(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function isConsoleCall(call) {
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'console'
  );
}

/** Steht der Knoten in einem Element mit `lang="de"`? */
function insideGermanElement(node) {
  for (let current = node; current; current = current.parent) {
    const opening = ts.isJsxElement(current)
      ? current.openingElement
      : ts.isJsxSelfClosingElement(current)
        ? current
        : null;
    if (!opening) continue;
    const lang = opening.attributes.properties.find(
      (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'lang'
    );
    if (lang?.initializer && ts.isStringLiteral(lang.initializer) && lang.initializer.text === 'de') return true;
  }
  return false;
}

/**
 * Probleme in einer Quelldatei: `{ line, column, text, reason }`.
 * `catalog` sind die Schlüssel aus de.ts; `used` sammelt, welche vorkommen.
 */
export function checkSource(fileName, code, catalog, used = new Set()) {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const problems = [];
  const ignored = code.includes('i18n-ignore-file');

  const report = (node, text, reason) => {
    if (ignored || insideGermanElement(node)) return;
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    problems.push({ line: line + 1, column: character + 1, text: text.trim(), reason });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, ' ').trim();
      if (text && looksGerman(text)) report(node, text, 'JSX-Text');
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (catalog.has(text)) used.add(text);
      const parent = node.parent;
      if (looksGerman(text)) {
        if (ts.isJsxAttribute(parent)) {
          // Am HTML-Element landet der Text so im DOM. An einer eigenen
          // Komponente darf ein Schlüssel stehen, wenn sie selbst übersetzt
          // (ScoreCard: `<Stat label="Warnungen" />`).
          const tag = parent.parent.parent.tagName.getText(source);
          if (/^[a-z]/.test(tag) || !catalog.has(text)) {
            report(node, text, `Attribut ${parent.name.getText(source)}`);
          }
        } else if (ts.isCallExpression(parent) && isConsoleCall(parent)) {
          // Log-Ausgaben liest nur, wer die Konsole öffnet.
        } else if (ts.isCallExpression(parent) && TRANSLATE_CALLS.has(calleeName(parent) ?? '')) {
          // Übersetzt — dass der Schlüssel existiert, prüft der Compiler.
        } else if (!catalog.has(text)) {
          report(node, text, 'String');
        }
      }
    } else if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('…');
      const parent = node.parent;
      if (looksGerman(text) && !(ts.isCallExpression(parent) && isConsoleCall(parent))) {
        report(node, text, 'Template-String');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

/* ─── Aufruf ──────────────────────────────────────────────────────────── */

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['i18n', 'test'].includes(entry) && dir === path.join(ROOT, 'src')) continue;
      files.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const catalog = readCatalog();
  const used = new Set();
  let count = 0;

  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const problems = checkSource(file, readFileSync(file, 'utf8'), catalog, used);
    for (const problem of problems) {
      count += 1;
      console.error(
        `${path.relative(ROOT, file)}:${problem.line}:${problem.column}  ${problem.reason}: „${problem.text}“`
      );
    }
  }

  // Schlüssel, die nur in shared/ oder server/ vorkommen (Urteil zum Score,
  // Satzbausteine der Findings), zählen mit. Geprüft wird dort nichts: der
  // Server schreibt bewusst deutsch.
  for (const dir of ['shared', 'server']) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      checkSource(file, readFileSync(file, 'utf8'), catalog, used);
    }
  }
  const orphaned = [...catalog].filter((key) => !used.has(key));
  for (const key of orphaned) {
    console.error(`src/i18n/de.ts  Schlüssel wird nirgends benutzt: „${key}“`);
  }

  if (count > 0 || orphaned.length > 0) {
    console.error(
      `\n${count} deutsche Texte ohne Übersetzung, ${orphaned.length} verwaiste Schlüssel.` +
        '\nVorgehen: docs/I18N.md („Kurzfassung“).'
    );
    process.exit(1);
  }
  console.log(`Übersetzung vollständig: ${catalog.size} Schlüssel, keine deutschen Texte außerhalb von t().`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
