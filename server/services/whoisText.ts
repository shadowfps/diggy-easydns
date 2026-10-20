/**
 * Parser für WHOIS-Klartext von Port 43 (#105), je Registry einer.
 *
 * Ausgewertet werden nur Daten über die Domain: Registrierung, Ablauf,
 * letzte Änderung, Status, Registrar (ein Unternehmen), Nameserver und
 * DNSSEC. Inhaber- und Kontaktblöcke (Namen, Anschriften, E-Mail-Adressen,
 * Telefonnummern) überspringen die Parser, statt sie zu lesen und
 * wegzuwerfen: .at und .it liefern sie mit, die Parser lesen dort nur den
 * Domain-Block bzw. die Abschnitte „Registrar“ und „Nameservers“.
 *
 * Jeder Parser kennt genau ein „gefunden“ (der Domain-Block nennt die
 * gefragte Domain) und genau ein „nicht gefunden“ (der feste Satz der
 * Registry). Alles andere — Sperre, Rate-Limit, ein geändertes Format —
 * wirft. Eine unbekannte Antwort darf nie als „frei“ durchgehen, auch keine,
 * die neben dem „nicht gefunden“ eine Sperre meldet.
 */

import type { WhoisInfo } from '../types.js';

export type WhoisFields = Pick<
  WhoisInfo,
  'registrar' | 'createdAt' | 'expiresAt' | 'updatedAt' | 'nameServers' | 'status' | 'dnssecDelegated'
>;

export type WhoisTextResult = { found: false } | { found: true; fields: WhoisFields };

export type WhoisTextParser = (text: string, domain: string) => WhoisTextResult;

/** Die Registry hat die Abfrage abgelehnt (Sperre, Rate-Limit) oder etwas Unbekanntes geschickt. */
export class WhoisTextError extends Error {
  constructor(
    message: string,
    readonly refused: boolean
  ) {
    super(message);
    this.name = 'WhoisTextError';
  }
}

/**
 * Typische Sätze für Sperren und Rate-Limits. Geprüft bei jeder Antwort, die
 * nicht „gefunden“ ist — bei .io nur vor der Zeile „>>> Last update“: Die
 * Nutzungsbedingungen danach erwähnen „too many queries“. Die Hinweise von
 * nic.at, Registro .it und EURid enthalten keinen der Sätze (Stand
 * 20.10.2026).
 */
const REFUSAL_PATTERNS = [
  /not permitted/i,
  /limit (?:exceeded|reached)/i,
  /exceeded/i,
  /excessive/i,
  /too many/i,
  /rate.?limit/i,
  /quota/i,
  /refused/i,
  /denied/i,
  /blocked/i,
  /try again later/i,
  /temporarily unavailable/i,
];

/**
 * Wirft für eine Antwort, die weder „gefunden“ noch „nicht gefunden“ ist. Ins
 * Log kommt nur das Stichwort der Sperre, nie der Text selbst — er könnte
 * Kontaktdaten enthalten.
 */
function rejectUnrecognized(text: string): never {
  rejectRefusal(text);
  throw new WhoisTextError(`unbekannte Antwort (${text.length} Zeichen)`, false);
}

function rejectRefusal(text: string): void {
  for (const pattern of REFUSAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) throw new WhoisTextError(`abgelehnt („${match[0]}“)`, true);
  }
}

/**
 * „Nicht gefunden“ — es sei denn, dieselbe Antwort meldet eine Sperre. Ein
 * Server, der drosselt und trotzdem den Satz für freie Domains schickt, darf
 * kein „frei“ ergeben.
 */
function notFound(response: string): WhoisTextResult {
  rejectRefusal(response);
  return { found: false };
}

/* ─── .io: ICANN-Format (Identity Digital) ───────────────────────────── */

/**
 * Das Format der ICANN-Registries („Domain Name:“, „Registry Expiry Date:“).
 * Kontaktfelder („Registrant …“, „Admin …“, „Tech …“) stehen im selben
 * Block; der Parser liest nur die Schlüssel unten.
 */
export const parseIcannWhois: WhoisTextParser = (text, domain) => {
  const fields: WhoisFields = { nameServers: [], status: [] };
  let name: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    // Danach folgen nur noch Stand der Datenbank und Nutzungsbedingungen.
    if (line.startsWith('>>>')) break;
    const entry = keyValue(line);
    if (!entry) continue;
    const [key, value] = entry;
    switch (key.toLowerCase()) {
      case 'domain name':
        name = value;
        break;
      case 'creation date':
        fields.createdAt = isoTimestamp(value);
        break;
      case 'registry expiry date':
        fields.expiresAt = isoTimestamp(value);
        break;
      case 'updated date':
        fields.updatedAt = isoTimestamp(value);
        break;
      case 'registrar':
        fields.registrar = value || undefined;
        break;
      case 'domain status':
        // „clientTransferProhibited https://icann.org/epp#…“
        if (value) fields.status!.push(value.split(/\s+/)[0]);
        break;
      case 'name server':
        addNameServer(fields, value);
        break;
      case 'dnssec':
        fields.dnssecDelegated = /^signed/i.test(value) ? true : /^unsigned/i.test(value) ? false : undefined;
        break;
    }
  }

  // Ab „>>>“ folgen Stand und Nutzungsbedingungen, nicht mehr die Antwort.
  const response = text.split(/^>>>/m)[0];
  if (sameDomain(name, domain)) return { found: true, fields };
  // whois.nic.io trennt Zeilen mit CRLF — `$` allein passt vor `\r` nicht.
  if (/^Domain not found\.\r?$/m.test(response)) return notFound(response);
  return rejectUnrecognized(response);
};

/* ─── .at: nic.at ────────────────────────────────────────────────────── */

/**
 * nic.at: Domain-Block von „domain:“ bis zur ersten Leerzeile, danach je
 * Kontakt ein Block mit personname, organization, Anschrift, phone und
 * e-mail — die liest der Parser nicht. Kein Ablaufdatum, kein Status.
 * Zeiten ohne Zone, gemeint ist österreichische Ortszeit.
 */
export const parseNicAt: WhoisTextParser = (text, domain) => {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^domain:/i.test(line));

  if (start >= 0) {
    const fields: WhoisFields = { nameServers: [], status: [] };
    let name: string | undefined;
    for (let i = start; i < lines.length && lines[i].trim() !== ''; i += 1) {
      const entry = keyValue(lines[i]);
      if (!entry) continue;
      const [key, value] = entry;
      switch (key.toLowerCase()) {
        case 'domain':
          name = value;
          break;
        case 'registrar':
          // „APA-IT Informations Technologie GmbH ( https://nic.at/registrar/658 )“
          fields.registrar = value.replace(/\s*\(\s*https?:\/\/[^)]*\)\s*$/, '') || undefined;
          break;
        case 'nserver':
          addNameServer(fields, value);
          break;
        case 'registered':
          fields.createdAt = compactLocalTime(value, 'Europe/Vienna');
          break;
        case 'changed':
          fields.updatedAt = compactLocalTime(value, 'Europe/Vienna');
          break;
        case 'dnssec':
          fields.dnssecDelegated = /^signed/i.test(value) ? true : /^unsigned/i.test(value) ? false : undefined;
          break;
      }
    }
    if (sameDomain(name, domain)) return { found: true, fields };
  }

  if (/^% nothing found\s*$/m.test(text)) return notFound(text);
  return rejectUnrecognized(text);
};

/* ─── .it: Registro .it ──────────────────────────────────────────────── */

/**
 * Registro .it: Kopf mit „Domain:“, „Status:“, „Signed:“, „Created:“,
 * „Last Update:“, „Expire Date:“, dann Abschnitte mit Überschrift ohne
 * Doppelpunkt und eingerückten Zeilen. Gelesen werden nur „Registrar“
 * (die Organisation) und „Nameservers“; „Registrant“, „Admin Contact“ und
 * „Technical Contacts“ nicht. Freie Domain: „Status: AVAILABLE“.
 */
export const parseNicIt: WhoisTextParser = (text, domain) => {
  const fields: WhoisFields = { nameServers: [], status: [] };
  let name: string | undefined;
  let available = false;
  let section: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      if (/^[A-Z][A-Za-z ]*$/.test(line.trim())) {
        section = line.trim().toLowerCase();
        continue;
      }
      // Kopfzeilen gibt es nur vor dem ersten Abschnitt.
      const entry = section === undefined ? keyValue(line) : undefined;
      if (!entry) continue;
      const [key, value] = entry;
      switch (key.toLowerCase()) {
        case 'domain':
          name = value;
          break;
        case 'status':
          if (/^available$/i.test(value)) available = true;
          // „pendingDelete / redemptionPeriod“, „inactive / dnsHold“
          else fields.status = value.split(/[\s,/]+/).filter(Boolean);
          break;
        case 'signed':
          fields.dnssecDelegated = /^yes$/i.test(value) ? true : /^no$/i.test(value) ? false : undefined;
          break;
        case 'created':
          fields.createdAt = isoLocalTime(value, 'Europe/Rome');
          break;
        case 'last update':
          fields.updatedAt = isoLocalTime(value, 'Europe/Rome');
          break;
        case 'expire date':
          fields.expiresAt = isoLocalTime(value, 'Europe/Rome');
          break;
      }
      continue;
    }

    if (section === 'registrar') {
      const entry = keyValue(line.trim());
      if (entry?.[0] === 'Organization') fields.registrar = entry[1] || undefined;
    } else if (section === 'nameservers') {
      addNameServer(fields, line.trim().split(/\s+/)[0]);
    }
  }

  if (sameDomain(name, domain)) return available ? notFound(text) : { found: true, fields };
  return rejectUnrecognized(text);
};

/* ─── .eu: EURid ─────────────────────────────────────────────────────── */

/**
 * EURid: Kopf „Domain:“, „Script:“, bei freier Domain „Status: AVAILABLE“,
 * dann Abschnitte mit Überschrift und Doppelpunkt („Registrar:“, „Name
 * servers:“ …). Den Inhaber gibt EURid über Port 43 nie heraus, der
 * Abschnitt „Technical:“ nennt eine Organisation und eine E-Mail — gelesen
 * werden nur „Registrar“ und „Name servers“. Keine Daten zu Registrierung
 * oder Ablauf. Der Abschnitt „Keys:“ taugt nicht als DNSSEC-Angabe: Er war
 * für eurid.eu leer, obwohl die Zone einen DS-Eintrag hat.
 */
export const parseEurid: WhoisTextParser = (text, domain) => {
  const fields: WhoisFields = { nameServers: [], status: [] };
  let name: string | undefined;
  let available = false;
  let section: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('%')) continue;
    if (!/^\s/.test(line)) {
      const heading = line.match(/^([^:]+):\s*$/);
      if (heading) {
        section = heading[1].trim().toLowerCase();
        continue;
      }
      const entry = section === undefined ? keyValue(line) : undefined;
      if (!entry) continue;
      const [key, value] = entry;
      if (key === 'Domain') name = value;
      else if (key === 'Status') {
        if (/^available$/i.test(value)) available = true;
        else fields.status!.push(value);
      }
      continue;
    }

    if (section === 'registrar') {
      const entry = keyValue(line.trim());
      if (entry?.[0] === 'Name') fields.registrar = entry[1] || undefined;
    } else if (section === 'name servers') {
      // „ns1.example.eu (192.0.2.1)“ — je Adresse eine Zeile
      addNameServer(fields, line.trim().split(/\s+/)[0]);
    }
  }

  if (sameDomain(name, domain)) return available ? notFound(text) : { found: true, fields };
  return rejectUnrecognized(text);
};

/* ─── Bausteine ──────────────────────────────────────────────────────── */

function keyValue(line: string): [string, string] | undefined {
  const match = line.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
  return match ? [match[1], match[2]] : undefined;
}

function sameDomain(name: string | undefined, domain: string): boolean {
  return !!name && name.toLowerCase().replace(/\.$/, '') === domain.toLowerCase();
}

function addNameServer(fields: WhoisFields, value: string): void {
  const ns = value.toLowerCase().replace(/\.$/, '');
  if (ns && !fields.nameServers!.includes(ns)) fields.nameServers!.push(ns);
}

/** ISO-Zeitstempel mit Zone (ICANN-Format) → normalisiertes ISO in UTC. */
function isoTimestamp(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** nic.at: „20000825 20:31:02“ in österreichischer Ortszeit. */
function compactLocalTime(value: string, timeZone: string): string | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  return m ? zonedToIso(m.slice(1).map(Number), timeZone) : undefined;
}

/** Registro .it: „1996-05-15 00:00:00“ oder nur „2027-01-16“, italienische Ortszeit. */
function isoLocalTime(value: string, timeZone: string): string | undefined {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/);
  return m ? zonedToIso(m.slice(1).map((part) => Number(part ?? 0)), timeZone) : undefined;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Abstand der Zone zu UTC in ms zum Zeitpunkt `ts`. */
function zoneOffset(ts: number, timeZone: string): number {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  const part = Object.fromEntries(format.formatToParts(new Date(ts)).map((p) => [p.type, Number(p.value)]));
  const asUtc = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Ortszeit [Jahr, Monat, Tag, Stunde, Minute, Sekunde] in `timeZone` → ISO in UTC. */
function zonedToIso([year, month, day, hour, minute, second]: number[], timeZone: string): string | undefined {
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(local);
  // Date.UTC rechnet 2026-02-31 still in den März um — das ist kein Datum.
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }
  // Zweiter Durchgang für Zeiten nahe der Sommerzeit-Umstellung.
  const first = local - zoneOffset(local, timeZone);
  return new Date(local - zoneOffset(first, timeZone)).toISOString();
}
