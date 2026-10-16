import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { DE_PLURALS, type DeKey, type Message } from './de';
import type { EnglishPack } from './en';
import type { Finding, FindingKey, SpfIssueKey, TextParams, TextRef } from '@/types/dns';

/**
 * Übersetzungsmodul (#86) — Deutsch ist die Quelle, Englisch wird nachgeladen.
 *
 * Bewusst eigenes, kleines Modul statt einer Bibliothek: index.js lag bei
 * 46 von 48 kB gzip, i18next und Co. bringen allein mehr mit.
 *
 * Der deutsche Text ist zugleich der Schlüssel: `t('Menü öffnen')`, nicht
 * `t('header.openMenu')`. Gemessen am Build war das der Unterschied zwischen
 * Machbar und Nicht-Machbar: jeder Schlüssel steht einmal im Wörterbuch und
 * einmal an der Aufrufstelle, und gzip findet die beiden nicht zueinander —
 * rund 12 Byte je Text, bei gut 400 Texten über 5 kB. Mit dem deutschen Text
 * als Schlüssel braucht das deutsche Bundle gar kein Wörterbuch; übrig bleibt
 * der Aufruf `t(…)` selbst. Welche Texte es gibt, legt `de.ts` als Typ fest,
 * `en.ts` muss genau diese Schlüssel haben — beides prüft der Compiler.
 *
 * Der Zustand liegt auf Modulebene und nicht in einem Context: so lässt sich
 * `t()` auch außerhalb von Komponenten aufrufen (Fehlertexte in lib/api.ts,
 * Dokumenttitel), und `main.tsx` kann vor dem ersten Render die Sprache
 * festlegen. Komponenten abonnieren Wechsel über `useI18n()`.
 */

export type Language = 'de' | 'en';
export type Params = Record<string, string | number>;
export type { DeKey } from './de';

const STORAGE_KEY = 'diggy-language';

let language: Language = 'de';
/** Die zuletzt gewählte Sprache — kann vor `language` liegen, solange Englisch lädt. */
let requested: Language = 'de';
let english: EnglishPack | null = null;
let englishRequest: Promise<EnglishPack> | null = null;
const listeners = new Set<() => void>();

/* ─── Sprache bestimmen und wechseln ──────────────────────────────────── */

function readStoredLanguage(): Language | null {
  // localStorage kann in privaten Fenstern werfen — dann zählt der Browser.
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'de' || stored === 'en' ? stored : null;
  } catch {
    return null;
  }
}

function preferredTags(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/**
 * Gewählte Sprache, sonst die erste unterstützte aus den Browser-Vorlieben.
 *
 * Die erste *unterstützte*, nicht die erste überhaupt: wer `fr, de` eingestellt
 * hat, liest Deutsch lieber als Englisch. Ohne Treffer wird es Englisch —
 * das verstehen mehr Besucher als Deutsch.
 */
export function detectLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;
  for (const tag of preferredTags()) {
    const base = tag?.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

function loadEnglish(): Promise<EnglishPack> {
  englishRequest ??= import('./en').then(
    (module) => (english = module.default),
    (error: unknown) => {
      // Beim nächsten Versuch neu laden statt den Fehler zu cachen.
      englishRequest = null;
      throw error;
    }
  );
  return englishRequest;
}

function apply(next: Language): void {
  language = next;
  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

/**
 * Wechselt die Sprache — erst, wenn das Wörterbuch da ist.
 *
 * Bis dahin bleibt alles Deutsch. Die Alternative wäre ein Zwischenzustand,
 * in dem halb Deutsch, halb Englisch oder nur Schlüssel stehen; einmal sauber
 * umzuschalten ist ruhiger. Schlägt das Laden fehl, bleibt es bei Deutsch.
 */
export async function setLanguage(next: Language, options: { persist?: boolean } = {}): Promise<void> {
  requested = next;
  if (options.persist !== false) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ohne Storage gilt die Wahl eben nur für diesen Besuch.
    }
  }
  if (next === 'en') {
    try {
      await loadEnglish();
    } catch (error) {
      console.error('[diggy] Englisches Wörterbuch nicht geladen:', error);
      return;
    }
  }
  // Wer schnell hin- und herklickt, bekommt den letzten Klick — nicht den,
  // dessen Wörterbuch zuletzt ankam.
  if (requested === next) apply(next);
}

/**
 * Sprache für den Start. Liefert ein Promise, wenn erst Englisch geladen
 * werden muss — `main.tsx` wartet dann kurz mit dem ersten Render.
 *
 * Die erkannte Sprache wird nicht gespeichert: nur eine ausdrückliche Wahl im
 * Menü soll eine spätere Änderung der Browser-Sprache überstimmen.
 */
export function initLanguage(): Promise<void> | null {
  const detected = detectLanguage();
  // `<html lang="de">` steht schon in index.html.
  if (detected === 'de') return null;
  return setLanguage(detected, { persist: false });
}

export function getLanguage(): Language {
  return language;
}

/* ─── Texte ───────────────────────────────────────────────────────────── */

let pluralCache: { locale: string; rules: Intl.PluralRules } | null = null;

function pluralRules(): Intl.PluralRules {
  const current = locale();
  if (pluralCache?.locale !== current) {
    pluralCache = { locale: current, rules: new Intl.PluralRules(current) };
  }
  return pluralCache.rules;
}

/**
 * Setzt Platzhalter ein und wählt die Pluralform.
 *
 * Die Form richtet sich nach `count`. Zahlen werden im Format der Sprache
 * eingesetzt (1.234 / 1,234). Fehlt ein Wert, bleibt der Platzhalter stehen —
 * sichtbar falsch statt still leer.
 */
export function format(message: Message, params?: Params): string {
  const text =
    typeof message === 'string'
      ? message
      : ((message as unknown as Record<string, string | undefined>)[
          pluralRules().select(Number(params?.count ?? 0))
        ] ?? message.other);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

/**
 * Text in der aktiven Sprache. Ohne englischen Eintrag gilt der deutsche Text
 * — der Schlüssel selbst.
 */
export function t(key: DeKey, params?: Params): string {
  const singular = (DE_PLURALS as Record<string, string | undefined>)[key];
  const message: Message =
    (language === 'en' ? english?.ui[key] : undefined) ??
    (singular ? { one: singular, other: key } : key);
  return format(message, params);
}

/**
 * Wie `t()`, aber Platzhalter dürfen Elemente sein: ein Link, eine Hervorhebung.
 *
 * Ohne das müssten solche Sätze in Stücke zerfallen („Details unter“ + Link +
 * „.“), und im Englischen stimmt die Reihenfolge der Stücke oft nicht mehr.
 */
export function tRich(key: DeKey, values: Record<string, ReactNode>): ReactNode[] {
  const params: Params = {};
  const nodes: Record<string, ReactNode> = {};
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' || typeof value === 'number') params[name] = value;
    else nodes[name] = value;
  }
  // split() mit Gruppe: auf ungeraden Positionen stehen die Platzhalternamen.
  return t(key, params)
    .split(/\{(\w+)\}/)
    .map((part, index) =>
      index % 2 === 0
        ? part
        : part in nodes
          ? createElement(Fragment, { key: index }, nodes[part])
          : `{${part}}`
    );
}

/* ─── Texte des Servers ───────────────────────────────────────────────── */

/**
 * Lässt sich der Text vollständig füllen? Sonst bleibt es beim deutschen
 * Original: ein englischer Satz mit `{count}` darin wäre schlechter als ein
 * deutscher Satz, der stimmt. Passiert bei alten History-Einträgen oder einem
 * Server, der noch keine Werte mitschickt.
 */
function fillable(message: Message | undefined, params: TextParams): message is Message {
  if (message === undefined) return false;
  const forms = typeof message === 'string' ? [message] : [message.one, message.other];
  return forms.every((form) =>
    [...form.matchAll(/\{(\w+)\}/g)].every((match) => params[match[1]] !== undefined)
  );
}

export interface FindingTexts {
  title: string;
  description: string;
  fixExplanation?: string;
}

/**
 * Titel, Beschreibung und Fix-Erklärung eines Findings in der aktiven Sprache.
 *
 * Deutsch: die Texte des Servers, wie bisher. Englisch: nach Kennung und
 * Werten aus dem englischen Wörterbuch — unbekannte Kennung oder fehlender
 * Wert, und es bleibt beim Server-Text.
 */
export function findingText(finding: Finding): FindingTexts {
  const german: FindingTexts = {
    title: finding.title,
    description: finding.description,
    fixExplanation: finding.fix?.explanation,
  };
  const entry = language === 'en' ? english?.findings[(finding.key ?? finding.id) as FindingKey] : undefined;
  if (!entry) return german;

  const params = finding.params ?? {};
  const fix = german.fixExplanation === undefined ? undefined : entry.fix;
  if (
    !fillable(entry.title, params) ||
    !fillable(entry.description, params) ||
    (german.fixExplanation !== undefined && !fillable(fix, params))
  ) {
    return german;
  }
  return {
    title: format(entry.title, params),
    description: format(entry.description, params),
    fixExplanation: fix === undefined ? undefined : format(fix, params),
  };
}

/** Ein Problem des SPF-Records (Mail-Ansicht) — gleiche Regeln wie oben. */
export function spfIssueText(german: string, detail?: TextRef<SpfIssueKey>): string {
  const entry = language === 'en' && detail ? english?.findings[detail.key] : undefined;
  const params = detail?.params ?? {};
  return entry && fillable(entry.description, params) ? format(entry.description, params) : german;
}

/**
 * Meldung zu einem Fehler. Trägt er keine eigene Meldung, gilt `fallback`.
 *
 * Die Meldungen des Servers sind deutsch — für Deutsch sind sie der Text.
 * Auf Englisch zählt der Fehlercode (`ApiError.code`); unbekannter Code oder
 * fehlender Wert, und es bleibt bei der Meldung des Servers. Geprüft wird
 * per Duck-Typing statt `instanceof ApiError`: lib/api.ts importiert dieses
 * Modul, umgekehrt entstünde ein Zirkelbezug.
 */
export function errorText(error: unknown, fallback: DeKey): string {
  if (language === 'en' && english && error instanceof Error && 'code' in error) {
    const code = String(error.code) as keyof EnglishPack['apiErrors'];
    const params = ('params' in error ? (error.params as TextParams | undefined) : undefined) ?? {};
    const message = english.apiErrors[code];
    if (fillable(message, params)) return format(message, params);
  }
  if (error instanceof Error && error.message) return error.message;
  return t(fallback);
}

/* ─── Zahlen und Datum ────────────────────────────────────────────────── */

/**
 * Locale für Intl: Deutsch immer als de-DE, Englisch in der Variante des
 * Browsers (en-GB schreibt 16 Oct 2026, en-US Oct 16, 2026).
 */
export function locale(): string {
  if (language === 'de') return 'de-DE';
  return preferredTags().find((tag) => /^en(-|$)/i.test(tag)) ?? 'en-US';
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), options).format(value);
}

export function formatDate(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = new Date(value);
  // Intl wirft bei ungültigem Datum; toLocaleString() zeigte "Invalid Date".
  if (Number.isNaN(date.getTime())) return String(date);
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

/* ─── React ───────────────────────────────────────────────────────────── */

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface I18n {
  language: Language;
  t: typeof t;
  tRich: typeof tRich;
  formatDate: typeof formatDate;
  formatNumber: typeof formatNumber;
}

// Je Sprache ein festes Objekt: ändert sich die Sprache, ändert sich die
// Identität, und Memos mit `i18n` in den Dependencies rechnen neu.
const API: Record<Language, I18n> = {
  de: { language: 'de', t, tRich, formatDate, formatNumber },
  en: { language: 'en', t, tRich, formatDate, formatNumber },
};

/** Texte und Formate der aktiven Sprache; rendert bei einem Wechsel neu. */
export function useI18n(): I18n {
  return API[useSyncExternalStore(subscribe, getLanguage, getLanguage)];
}
