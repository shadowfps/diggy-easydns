import {
  RECORD_VALUE_LIMIT,
  TRACKED_RECORD_TYPES,
  normalizeRecordValue,
  type DmarcPolicy,
  type LookupHistoryEntry,
  type TrackedRecordType,
} from '@/lib/lookupHistory';

/**
 * Was sich zwischen zwei Checks derselben Domain geändert hat (#79).
 *
 * Beide Seiten sind History-Einträge: der letzte gespeicherte und der
 * laufende Lookup in derselben Form (createHistoryEntry). So vergleicht die
 * Funktion nie einen frischen Report gegen eine gekürzte Speicherform.
 *
 * Grundsatz: lieber eine Änderung verschweigen als eine erfinden. Was auf
 * einer Seite unbekannt ist — Sektion fehlgeschlagen, alter Eintrag ohne das
 * Feld, Liste gekürzt —, wird nicht verglichen.
 */
export type CheckChange =
  | { kind: 'score'; from: number; to: number }
  | { kind: 'ssl-renewed'; validTo: string }
  | { kind: 'ssl-replaced'; validTo: string }
  | { kind: 'ssl-invalid' }
  | { kind: 'ssl-valid'; validTo: string }
  | { kind: 'dnssec'; enabled: boolean }
  | { kind: 'dmarc'; present: boolean; policy?: DmarcPolicy }
  | { kind: 'dmarc-policy'; from: DmarcPolicy; to: DmarcPolicy }
  | {
      kind: 'records';
      type: TrackedRecordType;
      change: 'added' | 'removed';
      values: string[];
    };

/** Bewertung einer Änderung — dieselben Töne wie Badges und Icon-Kacheln. */
export type ChangeTone = 'neutral' | 'success' | 'warning' | 'danger';

const DAY_MS = 86_400_000;

/*
 * Kürzungen der History-Felder vor #79 (ips: A und AAAA zusammen). Erreicht
 * eine alte Liste diese Länge, fehlen womöglich Werte — dann wird der Typ
 * nicht verglichen.
 */
const LEGACY_IP_LIMIT = 6;
const LEGACY_LIMIT = 5;

interface ComparableState {
  score?: number;
  /** Nur Typen, deren Werte vollständig bekannt sind. */
  records: Partial<Record<TrackedRecordType, string[]>>;
  ssl?: { valid: boolean; validTo: number; approximate: boolean };
  dnssec?: boolean;
  dmarc?: { present: boolean; policy?: DmarcPolicy };
}

export function diffChecks(
  previous: LookupHistoryEntry,
  current: LookupHistoryEntry
): CheckChange[] {
  const before = comparableState(previous);
  const after = comparableState(current);

  // Reihenfolge = Anzeige: das Wichtigste zuerst, Records zuletzt.
  return [
    ...scoreChanges(before.score, after.score),
    ...sslChanges(before.ssl, after.ssl),
    ...dnssecChanges(before.dnssec, after.dnssec),
    ...dmarcChanges(before.dmarc, after.dmarc),
    ...recordChanges(before.records, after.records),
  ];
}

const POLICY_STRENGTH: Record<DmarcPolicy, number> = { none: 0, quarantine: 1, reject: 2 };

export function changeTone(change: CheckChange): ChangeTone {
  switch (change.kind) {
    case 'score':
      return change.to > change.from ? 'success' : 'warning';
    case 'ssl-renewed':
    case 'ssl-valid':
      return 'success';
    case 'ssl-invalid':
      return 'danger';
    case 'dnssec':
      return change.enabled ? 'success' : 'warning';
    case 'dmarc':
      return change.present ? 'success' : 'warning';
    case 'dmarc-policy':
      return POLICY_STRENGTH[change.to] > POLICY_STRENGTH[change.from] ? 'success' : 'warning';
    // Ein neuer Record oder ein anderes Zertifikat ist weder gut noch schlecht.
    case 'ssl-replaced':
    case 'records':
      return 'neutral';
  }
}

function comparableState(entry: LookupHistoryEntry): ComparableState {
  const failed = new Set<string>(entry.failedChecks ?? []);
  // Fehlt eine Sektion, fehlen auch ihre Findings — der Score wäre dann eine
  // andere Rechnung. Der Tech-Stack liefert keine Findings.
  const scoreComplete = [...failed].every((key) => key === 'techStack');

  return {
    score: scoreComplete && Number.isFinite(entry.score) ? entry.score : undefined,
    records: entry.records ? completeRecords(entry.records) : legacyRecords(entry),
    ssl: failed.has('ssl') || typeof entry.sslValid !== 'boolean' ? undefined : sslState(entry),
    dnssec:
      failed.has('dnssec') || typeof entry.dnssecValid !== 'boolean'
        ? undefined
        : entry.dnssecValid,
    dmarc:
      failed.has('mail') || typeof entry.dmarcPresent !== 'boolean'
        ? undefined
        : { present: entry.dmarcPresent, policy: entry.dmarcPolicy },
  };
}

function completeRecords(
  records: NonNullable<LookupHistoryEntry['records']>
): ComparableState['records'] {
  const result: ComparableState['records'] = {};
  for (const type of TRACKED_RECORD_TYPES) {
    const stored = records[type];
    // null: Abfrage gescheitert, Werte unbekannt. Fehlt der Typ: keine Records.
    if (stored === null) continue;
    const values = stored ?? [];
    // Am Limit: womöglich gekürzt.
    if (values.length >= RECORD_VALUE_LIMIT) continue;
    result[type] = values.map(normalizeRecordValue);
  }
  return result;
}

/**
 * Einträge vor #79 kennen nur die gekürzten Felder der History-Ansicht.
 * Solange sie die Kürzung nicht erreichen, sind sie vollständig — und A und
 * AAAA lassen sich am Doppelpunkt der IPv6-Adressen trennen.
 */
function legacyRecords(entry: LookupHistoryEntry): ComparableState['records'] {
  const result: ComparableState['records'] = {};
  const strings = (values: unknown[]) =>
    values.filter((value): value is string => typeof value === 'string').map(normalizeRecordValue);

  if (entry.ips.length < LEGACY_IP_LIMIT) {
    const ips = strings(entry.ips);
    result.A = ips.filter((ip) => !ip.includes(':'));
    result.AAAA = ips.filter((ip) => ip.includes(':'));
  }
  if (entry.mx.length < LEGACY_LIMIT) result.MX = strings(entry.mx);
  if (entry.nameservers.length < LEGACY_LIMIT) result.NS = strings(entry.nameservers);
  return result;
}

/**
 * Zertifikatsstand — nur, wenn ein Zertifikat gelesen wurde. Ohne eines
 * (`ssl: null`) gibt es nichts zu vergleichen. Ein Timeout steht seit #101
 * eigens in `failedChecks`; Einträge davor trennen „kein TLS“ und „Handshake
 * im Timeout“ nicht.
 *
 * Alte Einträge haben statt des Ablaufdatums nur die Resttage zum
 * Prüfzeitpunkt — daraus lässt es sich auf etwa einen Tag genau schätzen.
 */
function sslState(entry: LookupHistoryEntry): ComparableState['ssl'] {
  if (entry.sslValidTo) {
    const validTo = Date.parse(entry.sslValidTo);
    if (Number.isFinite(validTo)) return { valid: entry.sslValid, validTo, approximate: false };
  }
  const checkedAt = Date.parse(entry.lookedUpAt);
  if (typeof entry.sslDaysUntilExpiry === 'number' && Number.isFinite(checkedAt)) {
    return {
      valid: entry.sslValid,
      validTo: checkedAt + entry.sslDaysUntilExpiry * DAY_MS,
      approximate: true,
    };
  }
  return undefined;
}

function scoreChanges(before?: number, after?: number): CheckChange[] {
  if (before === undefined || after === undefined || before === after) return [];
  return [{ kind: 'score', from: before, to: after }];
}

function sslChanges(before: ComparableState['ssl'], after: ComparableState['ssl']): CheckChange[] {
  if (!before || !after) return [];
  if (before.valid && !after.valid) return [{ kind: 'ssl-invalid' }];
  if (!before.valid && after.valid) {
    return [{ kind: 'ssl-valid', validTo: new Date(after.validTo).toISOString() }];
  }
  if (!after.valid) return [];

  // Ein geschätztes Datum kann um einen Tag danebenliegen. Echte Wechsel
  // verschieben das Ablaufdatum um Wochen, nicht um Stunden.
  const tolerance = before.approximate || after.approximate ? 2 * DAY_MS : 60_000;
  const shift = after.validTo - before.validTo;
  const validTo = new Date(after.validTo).toISOString();
  if (shift > tolerance) return [{ kind: 'ssl-renewed', validTo }];
  if (shift < -tolerance) return [{ kind: 'ssl-replaced', validTo }];
  return [];
}

function dnssecChanges(before?: boolean, after?: boolean): CheckChange[] {
  if (before === undefined || after === undefined || before === after) return [];
  return [{ kind: 'dnssec', enabled: after }];
}

function dmarcChanges(
  before: ComparableState['dmarc'],
  after: ComparableState['dmarc']
): CheckChange[] {
  if (!before || !after) return [];
  if (before.present !== after.present) {
    return [{ kind: 'dmarc', present: after.present, policy: after.policy }];
  }
  // Alte Einträge kennen keine Policy — dann nur an/aus vergleichen.
  if (after.present && before.policy && after.policy && before.policy !== after.policy) {
    return [{ kind: 'dmarc-policy', from: before.policy, to: after.policy }];
  }
  return [];
}

function recordChanges(
  before: ComparableState['records'],
  after: ComparableState['records']
): CheckChange[] {
  const changes: CheckChange[] = [];
  for (const type of TRACKED_RECORD_TYPES) {
    const was = before[type];
    const now = after[type];
    if (!was || !now) continue;

    const added = sorted(now.filter((value) => !was.includes(value)));
    const removed = sorted(was.filter((value) => !now.includes(value)));
    if (added.length > 0) changes.push({ kind: 'records', type, change: 'added', values: added });
    if (removed.length > 0) {
      changes.push({ kind: 'records', type, change: 'removed', values: removed });
    }
  }
  return changes;
}

/** Natürlich sortiert: „5 mx…“ vor „10 mx…“. */
function sorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
