/**
 * Vergleichslogik für zwei Domains — rein, ohne React.
 *
 * Die Ansicht soll nur noch darstellen: was gleich ist, was abweicht und was
 * noch lädt, steht hier fest und ist ohne DOM testbar. Jede Seite kann
 * unabhängig laden oder scheitern, deshalb kennt jede Zeile neben „gleich“
 * und „Unterschied“ auch „lädt noch“ und „nicht vergleichbar“.
 */
import type { LoadStatus } from '@/hooks/useProgressiveLookup';
import type { DnsRecord, DnssecInfo, MailSecurity, RecordType, SslInfo } from '@/types/dns';

/**
 * - `same`: identisch.
 * - `equivalent`: gleich eingestuft, aber nicht wortgleich — z. B. zwei
 *   Zertifikate, die beide noch lange laufen, nur verschieden lange. Als
 *   Unterschied gezählt würde die Restlaufzeit fast immer anschlagen und die
 *   echten Abweichungen überdecken.
 * - `different`: abweichend, wird hervorgehoben und gezählt.
 * - `pending`: mindestens eine Seite lädt noch.
 * - `unknown`: mindestens eine Seite ist gescheitert, ein Urteil gibt es nicht.
 */
export type DiffStatus = 'same' | 'equivalent' | 'different' | 'pending' | 'unknown';

/* ─── Records je Typ ───────────────────────────────────────────────────── */

/**
 * Die Typen, die beim Umzug zählen. SOA fehlt bewusst: die Seriennummer
 * unterscheidet sich zwischen zwei Zonen immer und sagt nichts aus.
 */
export const COMPARED_RECORD_TYPES: readonly RecordType[] = [
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'NS',
  'TXT',
  'CAA',
];

/**
 * CNAME nur, wenn eine Seite einen hat. Bei Apex-Domains gibt es nie einen,
 * die Zeile wäre fast immer „keine | keine“. Spannend wird sie genau beim
 * Vergleich `domain.de` gegen `www.domain.de`.
 */
const OPTIONAL_TYPES = new Set<RecordType>(['CNAME']);

/** `both`: auf beiden Seiten, `only`: nur auf dieser, `unknown`: Gegenseite lädt noch. */
export type ValueMatch = 'both' | 'only' | 'unknown';

export interface RecordValue {
  value: string;
  match: ValueMatch;
}

export interface RecordRow {
  type: RecordType;
  /** null, solange diese Seite noch lädt. */
  left: RecordValue[] | null;
  right: RecordValue[] | null;
  status: DiffStatus;
}

function hostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Vergleichs- und Anzeigewert in einem.
 *
 * Hostnamen sind unabhängig von Groß-/Kleinschreibung und Schlusspunkt
 * gleich, TXT-Inhalte dagegen nicht (DKIM-Schlüssel, Verifizierungs-Tokens).
 * Beim MX gehört die Priorität dazu: derselbe Server mit anderer Priorität ist
 * ein Unterschied in der Zustellreihenfolge.
 */
export function recordValueKey(record: DnsRecord): string {
  switch (record.type) {
    case 'MX': {
      // Null-MX (RFC 7505: „diese Domain empfängt keine Mail“) zeigt auf die
      // Wurzel. Der Resolver liefert dafür einen leeren Namen — ohne den
      // Punkt stünde nur die Priorität da.
      const host = hostname(record.value) || '.';
      return record.priority !== undefined ? `${record.priority} ${host}` : host;
    }
    case 'NS':
    case 'CNAME':
    case 'AAAA':
    case 'CAA':
      return hostname(record.value);
    default:
      return record.value.trim();
  }
}

function valuesOf(records: DnsRecord[], type: RecordType): string[] {
  const seen = new Set<string>();
  for (const record of records) {
    if (record.type === type) seen.add(recordValueKey(record));
  }
  return [...seen];
}

/** Gemeinsame Werte zuerst — so stehen die Abweichungen gesammelt darunter. */
function markValues(own: string[], other: Set<string> | null): RecordValue[] {
  if (!other) return own.map((value) => ({ value, match: 'unknown' }));
  const shared = own.filter((value) => other.has(value));
  const only = own.filter((value) => !other.has(value));
  return [
    ...shared.map((value) => ({ value, match: 'both' as const })),
    ...only.map((value) => ({ value, match: 'only' as const })),
  ];
}

/**
 * Stellt die Records beider Seiten je Typ gegenüber. Eine Seite ist null,
 * solange sie lädt — die andere wird dann schon gezeigt, aber noch nicht
 * markiert.
 */
export function diffRecords(left: DnsRecord[] | null, right: DnsRecord[] | null): RecordRow[] {
  const rows: RecordRow[] = [];
  for (const type of COMPARED_RECORD_TYPES) {
    const leftValues = left ? valuesOf(left, type) : null;
    const rightValues = right ? valuesOf(right, type) : null;
    if (OPTIONAL_TYPES.has(type) && !leftValues?.length && !rightValues?.length) continue;

    const leftSet = leftValues ? new Set(leftValues) : null;
    const rightSet = rightValues ? new Set(rightValues) : null;
    const status: DiffStatus =
      !leftValues || !rightValues
        ? 'pending'
        : leftValues.length === rightValues.length && leftValues.every((v) => rightSet!.has(v))
          ? 'same'
          : 'different';

    rows.push({
      type,
      left: leftValues ? markValues(leftValues, rightSet) : null,
      right: rightValues ? markValues(rightValues, leftSet) : null,
      status,
    });
  }
  return rows;
}

/* ─── Fakten: Mail-Schutz, Zertifikat, DNSSEC, Nameserver ──────────────── */

/** Dieselben Töne wie im Report; `neutral` heißt „nicht bewertet“. */
export type FactTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface Fact {
  /** Angezeigter Wert. */
  value: string;
  tone: FactTone;
  /** Wonach verglichen wird — die Einstufung, nicht unbedingt der Wortlaut. */
  key: string;
  /** Rohwert unter dem Wert, z. B. der SPF-Record. */
  detail?: string;
  mono?: boolean;
}

export type FactCell =
  | { state: 'loading' }
  | { state: 'error'; message?: string }
  | { state: 'done'; fact: Fact };

/** Zellen einer Seite je Zeilen-ID. Fehlt eine ID, gilt sie als ladend. */
export type SideCells = Record<string, FactCell>;

export interface FactRowSpec {
  id: string;
  label: string;
}

export interface FactRow extends FactRowSpec {
  left: FactCell;
  right: FactCell;
  status: DiffStatus;
}

const LOADING: FactCell = { state: 'loading' };

export function compareFacts(
  rows: readonly FactRowSpec[],
  left: SideCells,
  right: SideCells
): FactRow[] {
  return rows.map((spec) => {
    const l = left[spec.id] ?? LOADING;
    const r = right[spec.id] ?? LOADING;
    let status: DiffStatus;
    if (l.state === 'error' || r.state === 'error') status = 'unknown';
    else if (l.state === 'loading' || r.state === 'loading') status = 'pending';
    else if (l.fact.key !== r.fact.key) status = 'different';
    else if (l.fact.value !== r.fact.value || l.fact.detail !== r.fact.detail) status = 'equivalent';
    else status = 'same';
    return { ...spec, left: l, right: r, status };
  });
}

/**
 * Macht aus dem Ladezustand einer Report-Sektion die Zellen einer Seite.
 * `skipped` (DNS-Eintrag ohne Host) ist erledigt, nicht ladend — `build`
 * bekommt dann `undefined` und entscheidet selbst, was das heißt.
 */
export function sectionCells<T>(
  rows: readonly FactRowSpec[],
  slice: { status: LoadStatus; data: T | undefined; error?: string },
  build: (data: T | undefined) => Record<string, Fact>
): SideCells {
  if (slice.status === 'error') {
    return Object.fromEntries(rows.map((r) => [r.id, { state: 'error', message: slice.error }]));
  }
  if (slice.status !== 'done' && slice.status !== 'skipped') {
    return Object.fromEntries(rows.map((r) => [r.id, LOADING]));
  }
  const facts = build(slice.data);
  return Object.fromEntries(rows.map((r) => [r.id, { state: 'done', fact: facts[r.id] }]));
}

/* Mail-Schutz — Töne wie in MailView: ohne MX ist Fehlendes nur ein Hinweis. */

export const MAIL_ROWS: readonly FactRowSpec[] = [
  { id: 'spf', label: 'SPF' },
  { id: 'dmarc', label: 'DMARC-Policy' },
  { id: 'dkim', label: 'DKIM' },
  { id: 'mtaSts', label: 'MTA-STS' },
];

export function mailFacts(mail: MailSecurity | undefined): Record<string, Fact> {
  const hasMx = mail?.hasMx ?? false;
  const missingTone: FactTone = hasMx ? 'warning' : 'neutral';

  const spf = mail?.spf;
  // Der Record gehört in den Vergleich: zwei gültige SPF-Records mit
  // verschiedenen includes sind beim Umzug genau der Unterschied, um den es geht.
  const spfRecord = spf?.record?.replace(/\s+/g, ' ').trim();
  const spfFact: Fact = !spf?.present
    ? { value: 'fehlt', tone: missingTone, key: 'missing' }
    : !spf.valid
      ? { value: 'problematisch', tone: 'danger', key: `invalid|${spfRecord}`, detail: spfRecord }
      : spf.issues.length > 0
        ? { value: 'gültig, mit Hinweisen', tone: 'warning', key: `issues|${spfRecord}`, detail: spfRecord }
        : { value: 'gültig', tone: 'success', key: `valid|${spfRecord}`, detail: spfRecord };

  // Nur die Policy: die rua-Adresse enthält fast immer die eigene Domain und
  // wäre damit bei jedem Vergleich verschieden.
  const dmarc = mail?.dmarc;
  const dmarcFact: Fact = !dmarc?.present
    ? { value: 'fehlt', tone: missingTone, key: 'missing' }
    : dmarc.policy
      ? {
          value: dmarc.policy,
          tone: dmarc.policy === 'none' ? 'warning' : 'success',
          key: dmarc.policy,
          mono: true,
        }
      : { value: 'ohne Policy', tone: 'warning', key: 'unset' };

  const selectors = (mail?.dkim.selectors ?? [])
    .filter((s) => s.present)
    .map((s) => s.selector)
    .sort();
  const dkimFact: Fact =
    selectors.length > 0
      ? { value: selectors.join(', '), tone: 'success', key: selectors.join(','), mono: true }
      : { value: 'keine gefunden', tone: 'neutral', key: 'none' };

  const mtaStsFact: Fact = mail?.mtaSts.present
    ? { value: 'aktiv', tone: 'success', key: 'on' }
    : { value: 'nicht eingerichtet', tone: 'neutral', key: 'off' };

  return { spf: spfFact, dmarc: dmarcFact, dkim: dkimFact, mtaSts: mtaStsFact };
}

/* Zertifikat — Schwellen wie in SecurityView und den SSL-Findings. */

export const CERT_ROWS: readonly FactRowSpec[] = [
  { id: 'status', label: 'Status' },
  { id: 'expiry', label: 'Restlaufzeit' },
  { id: 'issuer', label: 'Aussteller' },
];

/** „noch 1 Tag“ / „noch 12 Tage“ / „seit 3 Tagen abgelaufen“. */
function expiryText(d: number): string {
  if (d < 0) return `seit ${d === -1 ? '1 Tag' : `${-d} Tagen`} abgelaufen`;
  if (d === 0) return 'läuft heute ab';
  return `noch ${d === 1 ? '1 Tag' : `${d} Tage`}`;
}

export function certFacts(ssl: SslInfo | null | undefined, applicable = true): Record<string, Fact> {
  const dash = (key: string): Fact => ({ value: '—', tone: 'neutral', key });

  if (!applicable) {
    // DNS-Einträge wie `_dmarc.…` haben keinen Webserver und damit kein Zertifikat.
    return {
      status: { value: 'nicht anwendbar', tone: 'neutral', key: 'n/a' },
      expiry: dash('n/a'),
      issuer: dash('n/a'),
    };
  }
  if (!ssl) {
    return {
      status: { value: 'kein TLS erreichbar', tone: 'warning', key: 'none' },
      expiry: dash('none'),
      issuer: dash('none'),
    };
  }

  const d = ssl.daysUntilExpiry;
  const [expiryTone, expiryKey]: [FactTone, string] =
    d < 0 ? ['danger', 'expired'] : d < 14 ? ['warning', 'soon'] : ['success', 'ok'];
  const expiry: Fact = { value: expiryText(d), tone: expiryTone, key: expiryKey };

  return {
    status: ssl.valid
      ? { value: 'gültig', tone: 'success', key: 'valid' }
      : { value: 'nicht vertrauenswürdig', tone: 'danger', key: 'invalid' },
    expiry,
    issuer: {
      value: ssl.issuer || '—',
      tone: 'neutral',
      key: ssl.issuer ? issuerOrganization(ssl.issuer) : '—',
    },
  };
}

/**
 * Die Organisation aus „CN (O)“ — so formatiert der Server den Aussteller.
 *
 * Verglichen wird die CA, nicht das Zwischenzertifikat: Let's Encrypt stellt
 * abwechselnd über R10, R11, E5, E6 … aus, Google über WR1, WE1 … Nach dem
 * vollen Namen stünde bei zwei Domains derselben CA fast immer „Unterschied“.
 * Gleiche CA, anderes Zwischenzertifikat heißt dann „gleichwertig“.
 */
export function issuerOrganization(issuer: string): string {
  return issuer.match(/\(([^()]+)\)\s*$/)?.[1].trim() || issuer.trim();
}

/* Nameserver und DNSSEC */

/** Die Zeilen aus der DNSSEC-Sektion — sie lädt getrennt von den Records. */
export const DNSSEC_ROWS: readonly FactRowSpec[] = [
  { id: 'dnssec', label: 'DNSSEC' },
  { id: 'algorithm', label: 'Algorithmus' },
];

/** Der Anbieter kommt aus den NS-Records und steht, sobald diese da sind. */
export const DNS_ROWS: readonly FactRowSpec[] = [
  { id: 'provider', label: 'Nameserver-Anbieter' },
  ...DNSSEC_ROWS,
];

/**
 * Zweite Ebenen unter Länder-TLDs, unter denen Firmen registrieren
 * (`foo.co.uk`, `foo.com.au`). Eine Heuristik statt der vollständigen Public
 * Suffix List: tldts brächte für diese eine Zeile gut 30 kB in den Client.
 * Für Nameserver-Namen reicht das — die gehören fast immer großen Anbietern.
 */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);

/** Aus `ns1.example.net` wird `example.net` — der Betreiber hinter dem Nameserver. */
export function nameserverProvider(host: string): string {
  const labels = hostname(host).split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  const provider = labels.slice(-take).join('.');
  // Route 53 verteilt jede Zone auf vier nummerierte Domains
  // (awsdns-12.com, awsdns-40.net …). Ohne Zusammenfassen sähen zwei Zonen
  // beim selben Anbieter immer verschieden aus.
  return /^awsdns-\d+\./.test(provider) ? 'Amazon Route 53' : provider;
}

export function nameserverFact(records: DnsRecord[]): Fact {
  const providers = [
    ...new Set(records.filter((r) => r.type === 'NS').map((r) => nameserverProvider(r.value))),
  ].sort();
  // Ohne NS ist der Name meist ein CNAME-Alias — er hat keine eigene Zone.
  if (providers.length === 0) return { value: 'keine eigenen', tone: 'neutral', key: 'none' };
  return { value: providers.join(', '), tone: 'neutral', key: providers.join(','), mono: true };
}

export function dnssecFacts(dnssec: DnssecInfo | undefined): Record<string, Fact> {
  let status: Fact = { value: 'nicht aktiviert', tone: 'neutral', key: 'off' };
  if (dnssec?.enabled && dnssec.valid && dnssec.chainOfTrust === 'valid') {
    status = { value: 'aktiv & valide', tone: 'success', key: 'valid' };
  } else if (dnssec?.enabled && dnssec.chainOfTrust === 'incomplete') {
    status = { value: 'Chain unterbrochen', tone: 'danger', key: 'incomplete' };
  } else if (dnssec?.enabled && dnssec.chainOfTrust === 'invalid') {
    status = { value: 'Validierung fehlgeschlagen', tone: 'danger', key: 'invalid' };
  }
  const algorithm = dnssec?.enabled && dnssec.algorithm ? dnssec.algorithm : '—';
  return {
    dnssec: status,
    algorithm: { value: algorithm, tone: 'neutral', key: algorithm, mono: algorithm !== '—' },
  };
}

/* ─── Score und Zusammenfassung ────────────────────────────────────────── */

/** Dieselben Schwellen wie ScoreCard: gut ab 65, Warnung ab 40. */
export function scoreTone(score: number): Exclude<FactTone, 'neutral'> {
  if (score >= 65) return 'success';
  if (score >= 40) return 'warning';
  return 'danger';
}

export interface ScoreComparison {
  /** Abstand in Punkten, immer ≥ 0. */
  delta: number;
  leader: 'left' | 'right' | null;
}

export function compareScores(left: number, right: number): ScoreComparison {
  if (left === right) return { delta: 0, leader: null };
  return { delta: Math.abs(left - right), leader: left > right ? 'left' : 'right' };
}

export interface DiffSummary {
  /** Zeilen mit Urteil (gleich, gleichwertig oder Unterschied). */
  compared: number;
  differences: number;
  /** true, solange noch eine Zeile lädt. */
  pending: boolean;
}

export function summarize(statuses: readonly DiffStatus[]): DiffSummary {
  return {
    compared: statuses.filter((s) => s === 'same' || s === 'equivalent' || s === 'different').length,
    differences: statuses.filter((s) => s === 'different').length,
    pending: statuses.includes('pending'),
  };
}
