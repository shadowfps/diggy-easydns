/**
 * Die autoritativen Nameserver einer Zone direkt fragen (#133).
 *
 * Nach einer DNS-Änderung ist die erste Frage: Ist sie am Nameserver der
 * Zone angekommen? Erst dann lohnt der Blick auf die Caches der Resolver.
 *
 * Ablauf:
 *  1. Zone finden: Von dem Namen aufwärts bis zur registrierbaren Domain je
 *     ein NS-Record über DoH (Cloudflare, sonst Google). Die tiefste Stufe
 *     mit eigenem NS-Set ist die Zone — `_dmarc.example.com` liegt in
 *     `example.com`, ein delegiertes `cloud.example.com` in sich selbst.
 *  2. Die Namen der Nameserver über DoH in Adressen auflösen.
 *  3. Jede gewählte Adresse direkt über Port 53 fragen (dnsPort53.ts): den
 *     gefragten Typ und das SOA der Zone — für Seriennummer und Primary.
 *
 * Schritt 1 und 2 gehen über DoH, also HTTPS: Auch wo ausgehendes DNS über
 * Port 53 gesperrt ist (der Container bei mittwald hinter Cloudflare hat dafür
 * keine Zusage), stehen so wenigstens Zone und Nameserver da, mit „nicht
 * prüfbar“ und Grund.
 *
 * Sicherheit: Wer eine Domain besitzt, bestimmt ihre NS-Records — und damit,
 * an welche Adressen diggy Pakete schickt. Damit daraus kein Werkzeug für
 * Anfragen an beliebige Ziele wird:
 *  - nur öffentliche Adressen (`isPublicIp`, dieselbe Liste wie für
 *    Tech-Stack und TLS), geprüft genau an der Adresse, die gefragt wird —
 *    aufgelöst über DoH, nie über den Resolver des Containers
 *  - nur Port 53, nur Opcode QUERY (lesen), keine Rekursion erbeten (RD aus),
 *    keinem Verweis wird gefolgt
 *  - höchstens 8 Nameserver-Namen, 8 Adressen und je Adresse 2 Fragen
 *  - je Ziel-Adresse höchstens 120 Fragen pro Minute, über alle Nutzer
 *  - die Route selbst mit eigenem Rate-Limit und Parallelitäts-Deckel
 *    (server/index.ts)
 */

import { getDomain } from 'tldts';
import { DOH_RESOLVERS, dohQuery } from './doh.js';
import { queryNameserver, type NameserverReply } from './dnsPort53.js';
import { isPublicIp } from '../lib/safeTarget.js';
import { cached } from '../lib/cache.js';
import { authoritativeReference, type AuthoritativeState } from '../../shared/authoritative.js';
import type {
  AuthoritativeFailure,
  AuthoritativeResult,
  AuthoritativeServer,
  DnsRecord,
  RecordType,
} from '../types.js';

export const AUTHORITATIVE_LIMITS = {
  /** Stufen von dem Namen bis zur registrierbaren Domain. */
  zoneCandidates: 8,
  /** Nameserver-Namen, deren Adressen ermittelt werden. */
  nameservers: 8,
  /** Adressen, die über Port 53 gefragt werden. */
  addresses: 8,
  /** Je DoH-Abfrage bei der Suche nach Zone und Adressen. */
  discoveryTimeoutMs: 2500,
  /** Je Frage über Port 53, UDP samt Wechsel auf TCP. */
  queryTimeoutMs: 2500,
  /** Fragen je Ziel-Adresse und Minute, über alle Nutzer zusammen. */
  perDestinationPerMinute: 120,
} as const;

/** Zone und Nameserver ändern sich selten — eine Minute wie die übrigen Lookups. */
const DELEGATION_TTL_MS = 60_000;

/* ─── Zone und Nameserver ─────────────────────────────────────────────── */

interface NameserverHost {
  host: string;
  v4: string[];
  v6: string[];
  /** Die Adressabfrage scheiterte (nicht: „hat keine“). */
  lookupFailed?: boolean;
}

export type Delegation =
  | { zone: string; hosts: NameserverHost[]; omitted: number; error?: undefined }
  | { error: 'no_zone' | 'lookup_failed' };

/**
 * Die Stufen, auf denen die Zone liegen kann, tiefste zuerst: der Name
 * selbst bis hinauf zur registrierbaren Domain (Public Suffix List, nur der
 * ICANN-Teil — `user.github.io` liegt in der Zone `github.io`).
 *
 * Mehr als acht Stufen hat kein üblicher Name; dann bleiben die sieben
 * tiefsten und die registrierbare Domain.
 */
export function zoneCandidates(name: string): string[] {
  const labels = name.toLowerCase().replace(/\.$/, '').split('.');
  const registrable =
    getDomain(name, { allowPrivateDomains: false, validateHostname: false }) ?? labels.slice(-2).join('.');
  const minimum = Math.max(1, Math.min(labels.length, registrable.split('.').length));
  const candidates: string[] = [];
  for (let i = 0; labels.length - i >= minimum; i++) candidates.push(labels.slice(i).join('.'));
  const max = AUTHORITATIVE_LIMITS.zoneCandidates;
  return candidates.length > max ? [...candidates.slice(0, max - 1), candidates[candidates.length - 1]] : candidates;
}

/**
 * Records über DoH — Cloudflare, bei einem Ausfall Google. `null`, wenn
 * keiner eine Antwort hatte (NOERROR oder NXDOMAIN).
 */
async function recursiveRecords(name: string, type: RecordType): Promise<DnsRecord[] | null> {
  for (const id of ['cloudflare', 'google']) {
    const resolver = DOH_RESOLVERS.find((r) => r.id === id);
    if (!resolver) continue;
    try {
      const response = await dohQuery(resolver, name, type, {
        timeoutMs: AUTHORITATIVE_LIMITS.discoveryTimeoutMs,
      });
      if (response.status === 0 || response.status === 3) return response.records;
    } catch {
      // nächster Resolver
    }
  }
  return null;
}

/**
 * Zone und Adressen ihrer Nameserver.
 *
 * Eine Stufe gilt als Zone, wenn sie NS-Records unter genau ihrem Namen hat
 * — ein CNAME auf eine andere Zone zählt nicht, auch wenn die Antwort dann
 * deren NS-Records enthält. Scheitert die Abfrage einer tieferen Stufe,
 * bleibt die Zone offen (`lookup_failed`): Die nächsthöhere zu nehmen hieße,
 * womöglich die Nameserver des Parents zu fragen, die für den Namen nur auf
 * andere verweisen.
 */
export async function discoverNameservers(name: string): Promise<Delegation> {
  const candidates = zoneCandidates(name);
  const answers = await Promise.all(candidates.map((candidate) => recursiveRecords(candidate, 'NS')));

  let zone: string | undefined;
  let hosts: string[] = [];
  for (const [i, records] of answers.entries()) {
    if (records === null) return { error: 'lookup_failed' };
    const ns = records
      .filter((r) => r.type === 'NS' && sameName(r.name, candidates[i]))
      .map((r) => hostName(r.value))
      .filter((host) => host !== '');
    if (ns.length > 0) {
      zone = candidates[i];
      hosts = [...new Set(ns)].sort();
      break;
    }
  }
  if (!zone) return { error: 'no_zone' };

  const asked = hosts.slice(0, AUTHORITATIVE_LIMITS.nameservers);
  const resolved = await Promise.all(
    asked.map(async (host): Promise<NameserverHost> => {
      const [a, aaaa] = await Promise.all([recursiveRecords(host, 'A'), recursiveRecords(host, 'AAAA')]);
      return {
        host,
        v4: (a ?? []).filter((r) => r.type === 'A').map((r) => r.value),
        v6: (aaaa ?? []).filter((r) => r.type === 'AAAA').map((r) => r.value),
        ...(a === null && aaaa === null && { lookupFailed: true }),
      };
    })
  );
  return { zone, hosts: resolved, omitted: hosts.length - asked.length };
}

export interface Target {
  host: string;
  ip?: string;
  /** Ohne Adresse: warum. */
  error?: Extract<AuthoritativeFailure, 'blocked' | 'no_address'>;
}

/**
 * Welche Adressen gefragt werden: reihum je Nameserver eine, erst IPv4
 * (die hat jeder Server), dann IPv6, bis acht verschiedene erreicht sind.
 * So kommt jeder Nameserver mindestens einmal dran, auch bei acht Namen.
 *
 * Nicht-öffentliche Adressen fallen heraus. Bleibt einem Nameserver keine,
 * steht er mit Grund in der Liste, gefragt wird er nicht.
 */
export function selectTargets(hosts: NameserverHost[], max: number = AUTHORITATIVE_LIMITS.addresses): Target[] {
  const queues = hosts.map((h) => {
    const v4 = h.v4.filter((ip) => isPublicIp(ip));
    const v6 = h.v6.filter((ip) => isPublicIp(ip));
    const order: string[] = [];
    for (let i = 0; i < Math.max(v4.length, v6.length); i++) {
      if (v4[i]) order.push(v4[i]);
      if (v6[i]) order.push(v6[i]);
    }
    return { host: h, order, picked: [] as string[] };
  });

  const used = new Set<string>();
  for (let round = 0; used.size < max; round++) {
    let more = false;
    for (const queue of queues) {
      const ip = queue.order[round];
      if (ip === undefined) continue;
      more = true;
      if (used.size >= max) break;
      // Eine Adresse unter zwei Namen: in der ersten Runde trotzdem eine
      // Zeile — der Name soll nicht fehlen —, gefragt wird sie einmal.
      if (used.has(ip) && round > 0) continue;
      used.add(ip);
      queue.picked.push(ip);
    }
    if (!more) break;
  }

  return queues.flatMap(({ host, picked }): Target[] => {
    // Je Nameserver IPv4 vor IPv6, sonst in der Reihenfolge der Auswahl.
    const ordered = [...picked].sort((a, b) => Number(a.includes(':')) - Number(b.includes(':')));
    if (ordered.length > 0) return ordered.map((ip) => ({ host: host.host, ip }));
    const hadAddresses = host.v4.length + host.v6.length > 0;
    return [{ host: host.host, error: hadAddresses ? 'blocked' : 'no_address' }];
  });
}

/* ─── Fragen über Port 53 ─────────────────────────────────────────────── */

interface Bucket {
  tokens: number;
  at: number;
}

/** Token Bucket je Ziel-Adresse — prozess-lokal wie lib/rateLimit.ts. */
const destinations = new Map<string, Bucket>();
const MAX_TRACKED_DESTINATIONS = 10_000;

/**
 * Bucht `cost` Fragen an eine Adresse. `false`, wenn sie in der letzten
 * Minute schon zu oft gefragt wurde — gleich von wem. Das Rate-Limit der
 * Route zählt je Nutzer; hier geht es um das Ziel: Viele Nutzer (oder viele
 * Domains mit denselben NS-Records) sollen eine fremde Adresse nicht über
 * diggy mit Anfragen eindecken können.
 */
export function takeDestinationBudget(ip: string, cost: number, now = Date.now()): boolean {
  const capacity = AUTHORITATIVE_LIMITS.perDestinationPerMinute;
  const rate = capacity / 60_000;
  if (destinations.size > MAX_TRACKED_DESTINATIONS) {
    for (const [key, bucket] of destinations) {
      if (bucket.tokens + (now - bucket.at) * rate >= capacity) destinations.delete(key);
    }
  }
  const bucket = destinations.get(ip) ?? { tokens: capacity, at: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * rate);
  bucket.at = now;
  destinations.set(ip, bucket);
  if (bucket.tokens < cost) return false;
  bucket.tokens -= cost;
  return true;
}

/** Nur für Tests: alle Zähler zurücksetzen. */
export function resetDestinationBudgets(): void {
  destinations.clear();
}

function replyFailure(reply: NameserverReply): AuthoritativeFailure | undefined {
  if (!reply.ok) return reply.failure;
  if (reply.rcode === 5) return 'refused';
  if (reply.rcode !== 0 && reply.rcode !== 3) return 'servfail';
  // NOERROR ohne AA-Bit: ein Verweis auf andere Server oder eine Antwort
  // aus dem Cache — der Server führt die Zone nicht.
  if (!reply.authoritative) return 'not_authoritative';
  return undefined;
}

/**
 * Eine Adresse fragen: den Typ für den Namen und das SOA der Zone. Beim SOA
 * des Apex genügt eine Frage.
 */
async function askServer(
  host: string,
  ip: string,
  domain: string,
  type: RecordType,
  zone: string
): Promise<AuthoritativeServer> {
  const soaInAnswer = type === 'SOA' && sameName(domain, zone);
  if (!takeDestinationBudget(ip, soaInAnswer ? 1 : 2)) {
    return { host, ip, records: [], responseTimeMs: 0, error: 'rate_limited' };
  }

  const timeoutMs = AUTHORITATIVE_LIMITS.queryTimeoutMs;
  const [answer, soaReply] = await Promise.all([
    queryNameserver(ip, domain, type, { timeoutMs }),
    soaInAnswer ? undefined : queryNameserver(ip, zone, 'SOA', { timeoutMs }),
  ]);
  const soa = soaReply ?? answer;

  const failure = replyFailure(answer) ?? replyFailure(soa);
  if (failure || !answer.ok || !soa.ok) {
    return { host, ip, records: [], responseTimeMs: answer.responseTimeMs, error: failure ?? 'invalid_response' };
  }

  const soaRecord = soa.records.find((r) => r.type === 'SOA' && sameName(r.name, zone));
  const [primary, , serial] = soaRecord?.value.trim().split(/\s+/) ?? [];
  if (!soaRecord || !serial) {
    return { host, ip, records: [], responseTimeMs: answer.responseTimeMs, error: 'invalid_response' };
  }

  return {
    host,
    ip,
    records: answer.records,
    serial,
    primary: hostName(primary ?? ''),
    responseTimeMs: answer.responseTimeMs,
  };
}

/**
 * Fragt die autoritativen Nameserver nach `type` für `domain`. Wirft nicht
 * bei Ausfällen: Was nicht prüfbar war, steht mit Grund im Ergebnis.
 */
export async function checkAuthoritative(domain: string, type: RecordType): Promise<AuthoritativeResult> {
  const delegation = await cached(`authoritative-ns:${domain}`, DELEGATION_TTL_MS, () => discoverNameservers(domain), {
    failed: (d) => d.error !== undefined,
  });
  if (delegation.error !== undefined) return { domain, type, nameservers: [], error: delegation.error };

  const { zone, hosts, omitted } = delegation;
  // Dieselbe Adresse unter zwei Namen nur einmal fragen.
  const asked = new Map<string, Promise<AuthoritativeServer>>();
  const nameservers = await Promise.all(
    selectTargets(hosts).map(async ({ host, ip, error }): Promise<AuthoritativeServer> => {
      if (!ip) return { host, records: [], responseTimeMs: 0, error };
      if (!asked.has(ip)) asked.set(ip, askServer(host, ip, domain, type, zone));
      return { ...(await asked.get(ip)!), host };
    })
  );

  return { domain, type, zone, nameservers, ...(omitted > 0 && { omitted }) };
}

/** Antwort von `/api/lookup/authoritative`: das Ergebnis und, für Skripte, die Auswertung. */
export interface AuthoritativeSection extends AuthoritativeResult {
  /** `authoritativeReference(…).state` — die Ansicht rechnet selbst, mit derselben Funktion. */
  state: AuthoritativeState;
  /** Bei `agreed` die Werte der Nameserver. */
  values: string[];
}

/**
 * Inhalt von `/api/lookup/authoritative`, kurz gecacht: Wer nach einer
 * Änderung neu prüft, will den Stand von jetzt sehen — 15 Sekunden fangen
 * nur Bursts ab (Tab-Wechsel, ein geteilter Link). Ist nichts prüfbar, nur
 * fünf (`cached`).
 */
export async function authoritativeSection(
  domain: string,
  type: RecordType,
  ttlMs: number
): Promise<AuthoritativeSection> {
  const result = await cached(`authoritative:${type}:${domain}`, ttlMs, () => checkAuthoritative(domain, type), {
    failed: (r) => r.error !== undefined || r.nameservers.every((s) => s.error !== undefined),
  });
  const reference = authoritativeReference(result);
  return { ...result, state: reference.state, values: reference.values };
}

function hostName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

function sameName(a: string, b: string): boolean {
  return hostName(a) === hostName(b);
}
