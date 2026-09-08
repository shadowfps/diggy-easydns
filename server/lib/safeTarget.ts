/**
 * Schutz gegen SSRF für alle Checks, die sich gegen ein nutzergewähltes Ziel
 * verbinden (Tech-Stack-Fetch, TLS-Handshake, IP-Details).
 *
 * Warum das nötig ist: `isValidDomain()` lehnt IP-Literale ab, aber nicht
 * Domains, die per A-/AAAA-Record auf interne Adressen zeigen. Ohne diese
 * Prüfung reicht ein `evil.example.com A 169.254.169.254`, um den Server als
 * Proxy ins interne Netz zu benutzen.
 *
 * Zwei Stufen, weil eine allein nicht reicht:
 *  1) Auflösen und JEDE zurückgegebene Adresse gegen die Blockliste prüfen.
 *  2) Die Verbindung auf genau die geprüften Adressen PINNEN (`lookup`-Option).
 *     Ohne Pinning bleibt ein DNS-Rebinding-Fenster: der Angreifer-DNS
 *     antwortet der Prüfung öffentlich und dem Connect intern.
 */

import { lookup as dnsLookupCb, promises as dnsPromises } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';

export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedTargetError';
  }
}

/* ─── IP-Klassifizierung ─────────────────────────────────────────────────── */

interface Cidr {
  /** Netzwerk-Bytes (4 bei IPv4, 16 bei IPv6) */
  bytes: number[];
  /** Präfix-Länge in Bits */
  bits: number;
}

function v4(a: number, b: number, c: number, d: number, bits: number): Cidr {
  return { bytes: [a, b, c, d], bits };
}

/**
 * Nicht-öffentliche IPv4-Bereiche nach IANA Special-Purpose Registry.
 * Bewusst breit: alles, was kein normales Internet-Ziel ist, wird geblockt.
 */
const BLOCKED_V4: Cidr[] = [
  v4(0, 0, 0, 0, 8), // "this host on this network"
  v4(10, 0, 0, 0, 8), // privat
  v4(100, 64, 0, 0, 10), // CGNAT
  v4(127, 0, 0, 0, 8), // Loopback
  v4(169, 254, 0, 0, 16), // Link-local (Cloud-Metadaten!)
  v4(172, 16, 0, 0, 12), // privat
  v4(192, 0, 0, 0, 24), // IETF Protocol Assignments
  v4(192, 0, 2, 0, 24), // TEST-NET-1
  v4(192, 88, 99, 0, 24), // 6to4-Relay-Anycast
  v4(192, 168, 0, 0, 16), // privat
  v4(198, 18, 0, 0, 15), // Benchmark
  v4(198, 51, 100, 0, 24), // TEST-NET-2
  v4(203, 0, 113, 0, 24), // TEST-NET-3
  v4(224, 0, 0, 0, 4), // Multicast
  v4(240, 0, 0, 0, 4), // reserviert (deckt 255.255.255.255 mit ab)
];

/** Nicht-öffentliche IPv6-Bereiche. */
const BLOCKED_V6: Cidr[] = [
  { bytes: bytes16('00000000000000000000000000000000'), bits: 128 }, // ::
  { bytes: bytes16('00000000000000000000000000000001'), bits: 128 }, // ::1
  { bytes: bytes16('01000000000000000000000000000000'), bits: 64 }, // 100::/64 Discard
  { bytes: bytes16('20010db8000000000000000000000000'), bits: 32 }, // Doku-Präfix
  { bytes: bytes16('fc000000000000000000000000000000'), bits: 7 }, // ULA
  { bytes: bytes16('fe800000000000000000000000000000'), bits: 10 }, // Link-local
  { bytes: bytes16('ff000000000000000000000000000000'), bits: 8 }, // Multicast
];

function bytes16(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < 32; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function inCidr(addr: number[], cidr: Cidr): boolean {
  if (addr.length !== cidr.bytes.length) return false;
  let remaining = cidr.bits;
  for (let i = 0; i < addr.length && remaining > 0; i++) {
    const take = Math.min(8, remaining);
    const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
    if ((addr[i] & mask) !== (cidr.bytes[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

function parseV4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/**
 * Expandiert eine IPv6-Adresse zu 16 Bytes. Behandelt `::`-Kompression und
 * IPv4-in-IPv6-Notation (`::ffff:127.0.0.1`, `64:ff9b::127.0.0.1`).
 */
function parseV6(ip: string): number[] | null {
  let text = ip.split('%')[0]; // Zone-ID abschneiden

  // Eingebettete IPv4-Notation in zwei Hextets umschreiben.
  const embedded = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) {
    const v = parseV4(embedded[1]);
    if (!v) return null;
    const hi = ((v[0] << 8) | v[1]).toString(16);
    const lo = ((v[2] << 8) | v[3]).toString(16);
    text = `${text.slice(0, embedded.index)}${hi}:${lo}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fillCount = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fillCount < 0) return null;

  const hextets = [...head, ...Array(fillCount).fill('0'), ...tail];
  if (hextets.length !== 8) return null;

  const out: number[] = [];
  for (const hextet of hextets) {
    if (!/^[0-9a-f]{1,4}$/i.test(hextet)) return null;
    const n = parseInt(hextet, 16);
    out.push((n >> 8) & 0xff, n & 0xff);
  }
  return out;
}

/**
 * true, wenn die Adresse ein reguläres, öffentlich routbares Internet-Ziel ist.
 * Unparsbare Eingaben gelten als nicht-öffentlich (fail closed).
 */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);

  if (family === 4) {
    const addr = parseV4(ip);
    return addr !== null && !BLOCKED_V4.some((c) => inCidr(addr, c));
  }

  if (family === 6) {
    const addr = parseV6(ip);
    if (!addr) return false;
    if (BLOCKED_V6.some((c) => inCidr(addr, c))) return false;

    // IPv4-mapped (::ffff:a.b.c.d) und NAT64 (64:ff9b::a.b.c.d) tragen eine
    // echte IPv4 im Rumpf — die muss gegen die IPv4-Liste geprüft werden,
    // sonst wäre ::ffff:127.0.0.1 ein Bypass.
    const isMapped =
      inCidr(addr, { bytes: bytes16('00000000000000000000ffff00000000'), bits: 96 }) ||
      inCidr(addr, { bytes: bytes16('0064ff9b000000000000000000000000'), bits: 96 });
    if (isMapped) {
      const embedded = addr.slice(12);
      return !BLOCKED_V4.some((c) => inCidr(embedded, c));
    }

    return true;
  }

  return false;
}

/* ─── Host-Auflösung mit Pinning ─────────────────────────────────────────── */

export interface ResolvedTarget {
  hostname: string;
  /** Alle geprüften, öffentlichen Adressen — Reihenfolge wie vom Resolver. */
  addresses: { address: string; family: 4 | 6 }[];
}

/**
 * Löst den Hostnamen auf und stellt sicher, dass ALLE Antworten öffentlich
 * sind. Ein einzelner interner Treffer blockt den ganzen Host — sonst könnte
 * ein Angreifer eine öffentliche und eine interne Adresse mischen und auf die
 * Auswahl des Betriebssystems hoffen.
 *
 * Nutzt `dns.lookup` (getaddrinfo), nicht den Cloudflare-Resolver aus
 * dnsLookup.ts: die Verbindung selbst geht auch über getaddrinfo, und geprüft
 * werden muss genau das, was danach verbunden wird.
 */
export async function resolvePublicHost(hostname: string): Promise<ResolvedTarget> {
  // IP-Literale können direkt geprüft werden — kein Lookup nötig.
  if (isIP(hostname) !== 0) {
    if (!isPublicIp(hostname)) {
      throw new BlockedTargetError(`Ziel ${hostname} ist keine öffentliche Adresse.`);
    }
    return {
      hostname,
      addresses: [{ address: hostname, family: isIP(hostname) === 4 ? 4 : 6 }],
    };
  }

  let resolved: { address: string; family: number }[];
  try {
    resolved = await dnsPromises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new BlockedTargetError(`Ziel ${hostname} ist nicht auflösbar.`);
  }

  if (resolved.length === 0) {
    throw new BlockedTargetError(`Ziel ${hostname} hat keine Adressen.`);
  }

  for (const entry of resolved) {
    if (!isPublicIp(entry.address)) {
      throw new BlockedTargetError(
        `Ziel ${hostname} zeigt auf eine nicht-öffentliche Adresse (${entry.address}).`
      );
    }
  }

  return {
    hostname,
    addresses: resolved.map((r) => ({
      address: r.address,
      family: r.family === 4 ? 4 : 6,
    })),
  };
}

/**
 * `lookup`-Ersatz für http/https/tls, der ausschließlich die vorab geprüften
 * Adressen zurückgibt. Damit kann zwischen Prüfung und Verbindung kein
 * anderer DNS-Stand mehr greifen (Rebinding).
 */
export function pinnedLookup(target: ResolvedTarget): LookupFunction {
  return ((hostname, options, callback) => {
    // Fremder Hostname → wir haben ihn nicht geprüft, also verweigern.
    if (hostname !== target.hostname) {
      dnsLookupCb(hostname, options as never, ((err: Error | null) => {
        callback(err ?? new BlockedTargetError(`Unerwarteter Host ${hostname}.`), '', 4);
      }) as never);
      return;
    }

    const wanted = options?.family;
    const matching =
      wanted === 4 || wanted === 6
        ? target.addresses.filter((a) => a.family === wanted)
        : target.addresses;

    if (matching.length === 0) {
      callback(new BlockedTargetError(`Keine geprüfte Adresse für ${hostname}.`), '', 4);
      return;
    }

    if (options?.all) {
      callback(
        null,
        matching.map((a) => ({ address: a.address, family: a.family })) as never,
        undefined as never
      );
      return;
    }

    callback(null, matching[0].address, matching[0].family);
  }) as LookupFunction;
}

/* ─── Abgesicherter HTTP-GET ─────────────────────────────────────────────── */

export interface SafeGetOptions {
  /** Gesamt-Budget über alle Redirects hinweg. */
  timeoutMs: number;
  /** Harte Obergrenze für den gelesenen Body. */
  maxBytes: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeGetResult {
  status: number;
  headers: Headers;
  body: Buffer;
  finalUrl: string;
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function toHeaders(raw: IncomingMessage['headers']): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.append(key, value);
  }
  return headers;
}

/**
 * GET auf ein nutzergewähltes Ziel — mit SSRF-Guard, IP-Pinning, eigener
 * Redirect-Verfolgung (jeder Hop wird neu geprüft) und Byte-Limit.
 *
 * Bewusst `node:http`/`node:https` statt `fetch`: nur dort gibt es die
 * `lookup`-Option, über die sich die Verbindung auf geprüfte Adressen pinnen
 * lässt. `fetch`/undici bietet das nicht, dort bliebe ein Rebinding-Fenster.
 *
 * Gibt `null` zurück, wenn das Ziel nicht erreichbar ist. Wirft
 * `BlockedTargetError`, wenn das Ziel nicht erlaubt ist — das ist eine
 * Aussage über die Eingabe und soll den Aufrufer erreichen.
 */
export async function safeGet(
  rawUrl: string,
  options: SafeGetOptions
): Promise<SafeGetResult | null> {
  const deadline = Date.now() + options.timeoutMs;
  const maxRedirects = options.maxRedirects ?? 3;

  let current = new URL(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new BlockedTargetError(`Protokoll ${current.protocol} ist nicht erlaubt.`);
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    // Pro Hop neu auflösen UND neu prüfen — ein Redirect ist ein neues Ziel.
    const target = await resolvePublicHost(current.hostname);

    const response = await singleGet(current, target, remaining, options);
    if (!response) return null;

    const { res, body } = response;
    const status = res.statusCode ?? 0;
    const location = res.headers.location;

    if (REDIRECT_CODES.has(status) && location) {
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return null;
      }
      current = next;
      continue;
    }

    return {
      status,
      headers: toHeaders(res.headers),
      body,
      finalUrl: current.toString(),
    };
  }

  // Redirect-Budget aufgebraucht.
  return null;
}

function singleGet(
  url: URL,
  target: ResolvedTarget,
  timeoutMs: number,
  options: SafeGetOptions
): Promise<{ res: IncomingMessage; body: Buffer } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { res: IncomingMessage; body: Buffer } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;

    const req = send(
      url,
      {
        method: 'GET',
        lookup: pinnedLookup(target),
        // Redirects verfolgen wir selbst, damit jeder Hop geprüft wird.
        headers: { host: url.host, ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;

        res.on('data', (chunk: Buffer) => {
          if (total >= options.maxBytes) return;
          const room = options.maxBytes - total;
          const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
          chunks.push(slice);
          total += slice.length;
          if (total >= options.maxBytes) {
            res.destroy();
            finish({ res, body: Buffer.concat(chunks) });
          }
        });

        res.on('end', () => finish({ res, body: Buffer.concat(chunks) }));
        res.on('error', () => finish(null));
        // Bei `res.destroy()` nach Byte-Limit kommt 'aborted'/'close' —
        // finish() ist idempotent, der bereits gelesene Body bleibt gültig.
        res.on('close', () => finish({ res, body: Buffer.concat(chunks) }));
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish(null);
    });
    req.on('error', () => finish(null));
    req.end();
  });
}
