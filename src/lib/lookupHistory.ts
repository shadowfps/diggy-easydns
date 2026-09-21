import { useSyncExternalStore } from 'react';
import type { LookupReport, RecordType } from '@/types/dns';

export interface LookupHistoryEntry {
  domain: string;
  lookedUpAt: string;
  score: number;
  verdict: string;
  recordCount: number;
  ips: string[];
  mx: string[];
  nameservers: string[];
  sslValid: boolean;
  sslDaysUntilExpiry?: number;
  dnssecValid: boolean;
  dmarcPresent: boolean;
  findingsCount: number;
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

function readLookupHistory(): LookupHistoryEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function saveLookupToHistory(report: LookupReport): void {
  const entry = toHistoryEntry(report);
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

function toHistoryEntry(report: LookupReport): LookupHistoryEntry {
  return {
    domain: report.domain,
    lookedUpAt: new Date().toISOString(),
    score: report.healthScore.score,
    verdict: report.healthScore.verdict,
    recordCount: report.records.length,
    ips: uniqueRecordValues(report, ['A', 'AAAA'], 6),
    mx: uniqueRecordValues(report, ['MX'], 5),
    nameservers: uniqueRecordValues(report, ['NS'], 5),
    sslValid: Boolean(report.ssl?.valid),
    sslDaysUntilExpiry: report.ssl?.daysUntilExpiry,
    dnssecValid: report.dnssec.enabled && report.dnssec.valid,
    dmarcPresent: report.mail.dmarc.present,
    findingsCount: report.findings.length,
  };
}

function uniqueRecordValues(
  report: LookupReport,
  types: RecordType[],
  limit: number
): string[] {
  const wanted = new Set(types);
  const values = report.records
    .filter((record) => wanted.has(record.type))
    .map((record) =>
      record.priority === undefined ? record.value : `${record.priority} ${record.value}`
    );

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
