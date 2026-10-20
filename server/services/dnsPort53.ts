/**
 * Klassisches DNS über Port 53 — für die Frage an die autoritativen
 * Nameserver einer Zone (#133).
 *
 * Warum nicht `node:dns` (`Resolver` mit `setServers`): Er sagt nicht, ob
 * eine Antwort autoritativ ist. Das AA-Bit ist aber der Kern der Prüfung —
 * ein Nameserver, der in der Delegation steht, die Zone aber nicht (mehr)
 * führt, antwortet mit einem Verweis oder aus seinem Cache. `node:dns` las
 * einen solchen Verweis als „kein Eintrag“, und diggy hätte einen
 * Nameserver als „uneinig“ gezeigt, der gar nicht zuständig ist. Dazu setzt
 * c-ares immer das RD-Bit (Rekursion erwünscht), liefert TTLs nur für
 * Adressen und keinen CNAME, dem eine Antwort folgt.
 *
 * Gelesen wird mit dnsWire.ts (aus #132); hier entstehen nur Anfrage und
 * Transport:
 *  - zufällige ID, RD aus — der Nameserver soll aus seiner Zone antworten,
 *    nicht für uns weiterfragen
 *  - EDNS mit 1232 Byte Puffer (DNS Flag Day 2020), ohne DO-Bit: groß genug
 *    für die meisten Antworten, ohne Fragmentierung, ohne Signaturen
 *  - UDP mit einer Wiederholung; ist die Antwort gekürzt (TC), dieselbe
 *    Frage über TCP
 *  - nur an IP-Adressen und nur an Port 53 — welche Adressen gefragt werden
 *    dürfen, entscheidet der Aufrufer (authoritative.ts, `isPublicIp`)
 */

import { createSocket } from 'node:dgram';
import { randomInt } from 'node:crypto';
import { connect, isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { parseDohTxt } from './doh.js';
import { decodeResponse, encodeQuery, type DnsAnswer, type DnsResponse } from './dnsWire.js';
import type { DnsRecord, RecordType } from '../types.js';

export const DNS_PORT = 53;

/** Puffer für UDP-Antworten nach DNS Flag Day 2020. */
const EDNS_UDP_SIZE = 1232;
const TYPE_OPT = 41;
/** Mehr kann über TCP nicht kommen (16-Bit-Länge). */
const MAX_TCP_MESSAGE = 65_535;

const TYPE_NUMBERS: Partial<Record<RecordType, number>> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  CAA: 257,
};

const TYPE_NAMES = new Map(Object.entries(TYPE_NUMBERS).map(([name, number]) => [number, name as RecordType]));

/**
 * `no_ipv6`: Die Frage an eine IPv6-Adresse scheiterte schon am Verbinden,
 * weil dieser Server keinen Weg ins IPv6-Netz hat — eine Aussage über diggy,
 * nicht über den Nameserver.
 */
export type Port53Failure = 'timeout' | 'network' | 'invalid_response' | 'no_ipv6';

export type NameserverReply =
  | {
      ok: true;
      /** AA-Bit: Der Server antwortet als zuständiger Server für die Zone. */
      authoritative: boolean;
      /** RCODE: 0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN, 5 REFUSED … */
      rcode: number;
      records: DnsRecord[];
      responseTimeMs: number;
    }
  | { ok: false; failure: Port53Failure; responseTimeMs: number };

class Port53Error extends Error {
  constructor(readonly failure: Port53Failure) {
    super(failure);
    this.name = 'Port53Error';
  }
}

/**
 * Fehler beim Verbinden, die heißen: Von hier führt kein Weg ins IPv6-Netz —
 * keine Route (ENETUNREACH, so in einem Docker-Container ohne IPv6), IPv6 im
 * Kernel abgeschaltet (EAFNOSUPPORT), keine passende Absenderadresse
 * (EADDRNOTAVAIL). Beim Verbinden eines UDP-Sockets geht noch kein Paket
 * hinaus; der Fehler kommt also von diesem Server, nicht von unterwegs.
 */
const NO_IPV6_CODES = new Set(['ENETUNREACH', 'EAFNOSUPPORT', 'EADDRNOTAVAIL']);

/** Ein Fehler beim Verbinden mit `ip` — bei IPv6 ohne Weg dorthin als `no_ipv6`. */
export function connectFailure(ip: string, error: Error): Error {
  const code = (error as NodeJS.ErrnoException).code;
  return isIP(ip) === 6 && code !== undefined && NO_IPV6_CODES.has(code) ? new Port53Error('no_ipv6') : error;
}

/**
 * Ob dieser Server überhaupt IPv6 hat: eine Schnittstelle mit einer
 * IPv6-Adresse außer Loopback und Link-local (fe80::/10). Ohne — etwa in
 * einem Docker-Container ohne IPv6 — scheiterte jede Frage an eine
 * IPv6-Adresse sofort; authoritative.ts fragt dann nur über IPv4.
 */
export function hasIpv6(): boolean {
  return Object.values(networkInterfaces()).some((addresses) =>
    (addresses ?? []).some((a) => a.family === 'IPv6' && !a.internal && !/^fe[89ab]/i.test(a.address))
  );
}

/**
 * Baut die Anfrage: eine Frage (Name, Typ, Klasse IN), Opcode QUERY — nur
 * lesen —, RD aus, dazu ein OPT-Record für EDNS. Ausgangspunkt ist die
 * DoH-Anfrage aus dnsWire.ts (ID 0, RD gesetzt, ohne OPT).
 */
export function buildQuery(name: string, type: RecordType, id: number): Uint8Array {
  const typeNumber = TYPE_NUMBERS[type];
  if (typeNumber === undefined) throw new Error(`Typ ${type} wird über Port 53 nicht gefragt.`);
  const base = encodeQuery(name, typeNumber);
  const msg = new Uint8Array(base.length + 11);
  msg.set(base);
  const view = new DataView(msg.buffer);
  view.setUint16(0, id);
  view.setUint16(2, 0); // QR 0, Opcode 0 (QUERY), RD 0
  view.setUint16(10, 1); // ARCOUNT: der OPT-Record

  const o = base.length;
  msg[o] = 0; // Name: Root
  view.setUint16(o + 1, TYPE_OPT);
  view.setUint16(o + 3, EDNS_UDP_SIZE);
  view.setUint32(o + 5, 0); // erweiterter RCODE, Version 0, kein DO-Bit
  view.setUint16(o + 9, 0); // keine Optionen
  return msg;
}

export interface QueryOptions {
  /** Gesamtzeit für UDP und einen nötigen Wechsel auf TCP. */
  timeoutMs: number;
  /** Nur für Tests gegen einen lokalen Server. Ohne Angabe immer 53. */
  port?: number;
}

/**
 * Fragt einen Nameserver direkt. Wirft nie: Ein Ausfall kommt als
 * `{ ok: false }` mit Grund zurück — ein stummer Nameserver soll den
 * übrigen nicht im Weg stehen.
 */
export async function queryNameserver(
  ip: string,
  name: string,
  type: RecordType,
  options: QueryOptions
): Promise<NameserverReply> {
  // Nie ein Hostname: Ein Name würde hier neu aufgelöst, an der Prüfung
  // der Adresse vorbei.
  if (isIP(ip) === 0) throw new Error('queryNameserver erwartet eine IP-Adresse.');

  const port = options.port ?? DNS_PORT;
  const start = Date.now();
  const deadline = start + options.timeoutMs;
  const id = randomInt(0, 0x10000);
  const query = buildQuery(name, type, id);
  const question = { name, type: TYPE_NUMBERS[type]! };

  try {
    let message = readReply(await udpExchange(ip, port, query, id, options.timeoutMs), id, question);
    if (message.TC) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Port53Error('timeout');
      message = readReply(await tcpExchange(ip, port, query, remaining), id, question);
      if (message.TC) throw new Port53Error('invalid_response');
    }
    return {
      ok: true,
      authoritative: message.AA,
      rcode: message.Status,
      records: (message.Answer ?? []).flatMap((answer) => toRecord(answer) ?? []),
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      ok: false,
      failure: error instanceof Port53Error ? error.failure : 'network',
      responseTimeMs: Date.now() - start,
    };
  }
}

/** Liest die Antwort und prüft, dass sie zu genau dieser Anfrage gehört. */
function readReply(
  bytes: Uint8Array,
  id: number,
  question: { name: string; type: number }
): DnsResponse & { AA: boolean } {
  if (bytes.length < 12 || ((bytes[0] << 8) | bytes[1]) !== id) throw new Port53Error('invalid_response');
  // Opcode muss QUERY bleiben.
  if ((bytes[2] & 0x78) !== 0) throw new Port53Error('invalid_response');
  try {
    return { ...decodeResponse(bytes, question), AA: (bytes[2] & 0x04) !== 0 };
  } catch {
    throw new Port53Error('invalid_response');
  }
}

/**
 * Ein Eintrag aus dem Answer-Abschnitt als DnsRecord — dieselbe Form wie bei
 * den DoH-Resolvern, damit beide gleich verglichen werden: Hostnamen ohne
 * Schlusspunkt, MX mit Priorität, TXT-Stücke zusammengesetzt.
 */
function toRecord(answer: DnsAnswer): DnsRecord | undefined {
  const type = TYPE_NAMES.get(answer.type);
  if (!type) return undefined;
  const name = stripDot(answer.name);
  switch (type) {
    case 'MX': {
      const [priority, ...target] = answer.data.trim().split(/\s+/);
      return { type, name, priority: Number(priority), value: stripDot(target.join(' ')), ttl: answer.TTL };
    }
    case 'TXT':
      return { type, name, value: parseDohTxt(answer.data), ttl: answer.TTL };
    case 'NS':
    case 'CNAME':
      return { type, name, value: stripDot(answer.data), ttl: answer.TTL };
    default:
      return { type, name, value: answer.data, ttl: answer.TTL };
  }
}

function stripDot(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

/**
 * Eine Frage über UDP, mit einer Wiederholung nach der halben Zeit —
 * verlorene Pakete sind bei UDP normal.
 *
 * Der Socket ist auf das Ziel „verbunden“: Der Kernel reicht nur Pakete von
 * genau dieser Adresse und diesem Port durch und meldet ein ICMP
 * „unreachable“ als Fehler, statt bis zum Timeout zu schweigen. Antworten
 * mit fremder ID werden verworfen.
 */
function udpExchange(
  ip: string,
  port: number,
  query: Uint8Array,
  id: number,
  timeoutMs: number
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(isIP(ip) === 6 ? 'udp6' : 'udp4');
    let settled = false;
    let connected = false;

    const finish = (error: Error | null, bytes?: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(retry);
      socket.close();
      if (error) reject(error);
      else resolve(bytes!);
    };
    const send = () => {
      if (settled || !connected) return;
      socket.send(query, (error) => error && finish(error));
    };

    const timer = setTimeout(() => finish(new Port53Error('timeout')), timeoutMs);
    const retry = setTimeout(send, Math.floor(timeoutMs / 2));

    socket.on('error', (error) => finish(connected ? error : connectFailure(ip, error)));
    socket.on('message', (msg) => {
      if (msg.length >= 2 && msg.readUInt16BE(0) === id) finish(null, msg);
    });
    // Scheitert das Verbinden, ruft Node den Callback mit dem Fehler auf
    // (statt `error` zu senden) — die Typen kennen das Argument nicht.
    socket.connect(port, ip, ((error?: Error) => {
      if (error) return finish(connectFailure(ip, error));
      connected = true;
      send();
    }) as () => void);
  });
}

/**
 * Dieselbe Frage über TCP (RFC 1035, 4.2.2: zwei Byte Länge vor der
 * Nachricht). Nötig, wenn die UDP-Antwort gekürzt war — etwa bei vielen
 * TXT-Records am Apex.
 */
function tcpExchange(ip: string, port: number, query: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buffer = Buffer.alloc(0);

    const socket = connect({ host: ip, port });
    const finish = (error: Error | null, bytes?: Uint8Array) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(bytes!);
    };
    const timer = setTimeout(() => finish(new Port53Error('timeout')), timeoutMs);

    socket.on('connect', () => {
      const frame = Buffer.alloc(2 + query.length);
      frame.writeUInt16BE(query.length, 0);
      frame.set(query, 2);
      socket.write(frame);
    });
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 2 + MAX_TCP_MESSAGE) return finish(new Port53Error('invalid_response'));
      if (buffer.length < 2) return;
      const length = buffer.readUInt16BE(0);
      if (buffer.length >= 2 + length) finish(null, buffer.subarray(2, 2 + length));
    });
    socket.on('error', (error) => finish(error));
    // Zu, bevor die Nachricht vollständig war.
    socket.on('close', () => finish(new Port53Error('invalid_response')));
  });
}
