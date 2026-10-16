import { useSyncExternalStore } from 'react';
import type { LookupReport, MailSecurity, RecordType } from '@/types/dns';
import { SECTION_KEYS, type SectionKey } from '@/hooks/useProgressiveLookup';

/**
 * Record-Typen, deren Werte für „Seit dem letzten Check“ (#79) vollständig
 * gespeichert werden. TXT bewusst nicht: DKIM-Schlüssel sind Kilobytes lang,
 * und die History soll klein bleiben.
 */
export const TRACKED_RECORD_TYPES = ['A', 'AAAA', 'MX', 'NS'] as const;
export type TrackedRecordType = (typeof TRACKED_RECORD_TYPES)[number];
export type TrackedRecords = Partial<Record<TrackedRecordType, string[]>>;
export type DmarcPolicy = NonNullable<MailSecurity['dmarc']['policy']>;

/**
 * Obergrenze je Typ. Wer sie erreicht, ist womöglich gekürzt — der Vergleich
 * überspringt den Typ dann, statt abgeschnittene Werte als „entfallen“ zu melden.
 */
export const RECORD_VALUE_LIMIT = 20;

export interface LookupHistoryEntry {
  domain: string;
  lookedUpAt: string;
  score: number;
  verdict: string;
  recordCount: number;
  /** Für die History-Ansicht: A und AAAA gemischt, auf 6 gekürzt. */
  ips: string[];
  /** Für die History-Ansicht: auf 5 gekürzt. */
  mx: string[];
  /** Für die History-Ansicht: auf 5 gekürzt. */
  nameservers: string[];
  sslValid: boolean;
  sslDaysUntilExpiry?: number;
  dnssecValid: boolean;
  dmarcPresent: boolean;
  findingsCount: number;

  /*
   * Ab #79, für den Vergleich mit dem letzten Check. Einträge von vorher
   * haben diese Felder nicht — alles Lesende muss mit undefined rechnen.
   */

  /** Alle Werte je Typ, normalisiert. Ein fehlender Typ heißt: keine Records. */
  records?: TrackedRecords;
  /** Ablaufdatum des Zertifikats. sslDaysUntilExpiry hängt vom Prüftag ab und taugt nur ungefähr. */
  sslValidTo?: string;
  dmarcPolicy?: DmarcPolicy;
  /**
   * Sektionen, deren Abfrage fehlschlug. sslValid, dnssecValid und
   * dmarcPresent sind dann nur Defaults (false) — ohne diese Liste meldete
   * der nächste Vergleich nach einem Timeout „DMARC entfernt“.
   */
  failedChecks?: SectionKey[];
}

const HISTORY_KEY = 'diggy-lookup-history';
const MAX_HISTORY_ITEMS = 10;

/*
 * Abonnierbarer Snapshot der History.
 *
 * App.tsx hielt den Inhalt vorher in einem useState und zog ihn an vier
 * Stellen von Hand nach: beim Mount, nach jedem fertigen Lookup, beim Wechsel
 * auf /history und beim Leeren. Die Stelle nach dem Lookup war ein synchrones
 * setState im Effect — ein zusätzlicher Render nur, um den Storage zu
 * spiegeln, und genau das, was react-hooks/set-state-in-effect beanstandet.
 *
 * localStorage ist die Quelle, React zeigt sie nur an: der Fall für
 * useSyncExternalStore. Dafür muss der Snapshot referenzstabil sein —
 * readLookupHistory() liefert bei jedem Aufruf ein frisches Array und würde
 * sonst endlos neu rendern. Also einmal halten und beim Schreiben ersetzen.
 */
const EMPTY_HISTORY: LookupHistoryEntry[] = [];
let snapshot: LookupHistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LookupHistoryEntry[] {
  snapshot ??= readLookupHistory();
  return snapshot;
}

/** Die History als Render-Quelle — aktualisiert sich bei jedem Schreibvorgang. */
export function useLookupHistory(): LookupHistoryEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_HISTORY);
}

/** Der gespeicherte Eintrag einer Domain — Groß-/Kleinschreibung egal, wie beim Speichern. */
export function findHistoryEntry(
  entries: readonly LookupHistoryEntry[],
  domain: string
): LookupHistoryEntry | null {
  const wanted = domain.toLowerCase();
  return entries.find((entry) => entry.domain.toLowerCase() === wanted) ?? null;
}

function readLookupHistory(): LookupHistoryEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).map(withValidExtras).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

/** `failed`: Sektionen, deren Abfrage fehlschlug (siehe `failedChecks`). */
export function saveLookupToHistory(
  report: LookupReport,
  failed: readonly SectionKey[] = []
): void {
  const entry = createHistoryEntry(report, failed);
  const previous = readLookupHistory();
  const next = [
    entry,
    ...previous.filter((item) => item.domain.toLowerCase() !== entry.domain.toLowerCase()),
  ].slice(0, MAX_HISTORY_ITEMS);

  writeHistory(next);
}

export function clearLookupHistory(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(HISTORY_KEY);
  }
  snapshot = EMPTY_HISTORY;
  notify();
}

/**
 * Der History-Eintrag zu einem Report. Exportiert, damit der Vergleich mit
 * dem letzten Check den laufenden Lookup in genau der Form sieht, in der er
 * gleich gespeichert wird — zwei getrennte Umwandlungen liefen auseinander.
 */
export function createHistoryEntry(
  report: LookupReport,
  failed: readonly SectionKey[] = [],
  lookedUpAt: string = new Date().toISOString()
): LookupHistoryEntry {
  const dmarc = report.mail.dmarc;
  return {
    domain: report.domain,
    lookedUpAt,
    score: report.healthScore.score,
    verdict: report.healthScore.verdict,
    recordCount: report.records.length,
    ips: uniqueRecordValues(report, ['A', 'AAAA'], 6),
    mx: uniqueRecordValues(report, ['MX'], 5),
    nameservers: uniqueRecordValues(report, ['NS'], 5),
    sslValid: Boolean(report.ssl?.valid),
    sslDaysUntilExpiry: report.ssl?.daysUntilExpiry,
    dnssecValid: report.dnssec.enabled && report.dnssec.valid,
    dmarcPresent: dmarc.present,
    findingsCount: report.findings.length,
    records: trackedRecords(report),
    // Felder mit undefined lässt JSON.stringify weg — sie kosten keinen Platz.
    sslValidTo: report.ssl?.validTo || undefined,
    dmarcPolicy: dmarc.present ? dmarc.policy : undefined,
    failedChecks: failed.length > 0 ? [...failed] : undefined,
  };
}

/**
 * Vergleichbare Form eines Record-Werts. Resolver liefern Namen mal mit,
 * mal ohne Schlusspunkt und in wechselnder Schreibweise — das ist keine
 * Änderung.
 */
export function normalizeRecordValue(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function recordValue(record: LookupReport['records'][number]): string {
  return record.priority === undefined ? record.value : `${record.priority} ${record.value}`;
}

function trackedRecords(report: LookupReport): TrackedRecords {
  const result: TrackedRecords = {};
  for (const type of TRACKED_RECORD_TYPES) {
    const values = report.records
      .filter((record) => record.type === type)
      .map((record) => normalizeRecordValue(recordValue(record)));
    const unique = Array.from(new Set(values)).slice(0, RECORD_VALUE_LIMIT);
    // Leere Typen weglassen: spart Platz, und ein fehlender Typ heißt ohnehin
    // „keine Records“ (siehe `records`).
    if (unique.length > 0) result[type] = unique;
  }
  return result;
}

function uniqueRecordValues(
  report: LookupReport,
  types: RecordType[],
  limit: number
): string[] {
  const wanted = new Set(types);
  const values = report.records.filter((record) => wanted.has(record.type)).map(recordValue);

  return Array.from(new Set(values)).slice(0, limit);
}

function writeHistory(entries: LookupHistoryEntry[]): void {
  // Snapshot direkt mitziehen: `entries` ist bereits gefiltert und gekürzt,
  // ein Neu-Lesen aus dem Storage brächte dasselbe Ergebnis. Steht vor dem
  // Schreiben, damit der Zustand auch dann stimmt, wenn localStorage in
  // eingeschränkten Kontexten gar nicht verfügbar ist.
  snapshot = entries;
  notify();

  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

function isHistoryEntry(value: unknown): value is LookupHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LookupHistoryEntry>;
  return (
    typeof entry.domain === 'string' &&
    typeof entry.lookedUpAt === 'string' &&
    typeof entry.score === 'number' &&
    Array.isArray(entry.ips) &&
    Array.isArray(entry.mx) &&
    Array.isArray(entry.nameservers)
  );
}

const DMARC_POLICIES: readonly string[] = ['none', 'quarantine', 'reject'] satisfies DmarcPolicy[];

/**
 * Prüft die Zusatzfelder aus #79 einzeln und lässt kaputte weg, statt den
 * ganzen Eintrag zu verwerfen: ein beschädigtes Zusatzfeld soll nicht die
 * History-Ansicht leeren, sondern nur den Vergleich für dieses Feld aussetzen.
 */
function withValidExtras(entry: LookupHistoryEntry): LookupHistoryEntry {
  const { records, sslValidTo, dmarcPolicy, failedChecks, ...base } = entry;
  const result: LookupHistoryEntry = base;

  const cleanRecords = validRecords(records);
  if (cleanRecords) result.records = cleanRecords;
  if (typeof sslValidTo === 'string' && Number.isFinite(Date.parse(sslValidTo))) {
    result.sslValidTo = sslValidTo;
  }
  if (typeof dmarcPolicy === 'string' && DMARC_POLICIES.includes(dmarcPolicy)) {
    result.dmarcPolicy = dmarcPolicy;
  }
  if (Array.isArray(failedChecks)) {
    result.failedChecks = failedChecks.filter((key): key is SectionKey =>
      (SECTION_KEYS as readonly unknown[]).includes(key)
    );
  }
  return result;
}

function validRecords(records: unknown): TrackedRecords | undefined {
  if (!records || typeof records !== 'object' || Array.isArray(records)) return undefined;
  const source = records as Record<string, unknown>;
  const clean: TrackedRecords = {};
  for (const type of TRACKED_RECORD_TYPES) {
    const values = source[type];
    if (values === undefined) continue;
    // Ein kaputter Typ verwirft alle: fehlte nur er, meldete der Vergleich
    // „alle Records dieses Typs entfallen“.
    if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) {
      return undefined;
    }
    clean[type] = values;
  }
  return clean;
}
