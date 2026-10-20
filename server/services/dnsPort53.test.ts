import { afterEach, describe, expect, it } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { createServer, type Server } from 'node:net';
import { buildQuery, connectFailure, queryNameserver } from './dnsPort53.js';
import { QUESTION_NAME, ipv4, name, parseQuery, pointer, response, txt, u16, type ResponseSpec } from '../test/dnsMessage.js';

/**
 * #133: DNS über Port 53 an die autoritativen Nameserver. Getestet gegen
 * einen lokalen Server — die Port-Angabe gibt es nur dafür; produktiv geht
 * jede Frage an Port 53, und welche Adressen gefragt werden dürfen,
 * entscheidet authoritative.ts.
 */

const AA = 0x0400;
const TC = 0x0200;

type Reply = (query: Buffer) => Uint8Array | Uint8Array[] | null;

const sockets: Socket[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

/** Die ID der Anfrage in die Antwort übernehmen — der Testhelfer baut ID 0. */
function withId(query: Buffer, bytes: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(bytes);
  copy[0] = query[0];
  copy[1] = query[1];
  return copy;
}

/** UDP-Server auf einem freien Port. `reply` gibt keine, eine oder mehrere Antworten. */
async function udpServer(reply: Reply): Promise<{ port: number; received: Buffer[] }> {
  const socket = createSocket('udp4');
  sockets.push(socket);
  const received: Buffer[] = [];
  socket.on('message', (msg, rinfo) => {
    received.push(msg);
    const out = reply(msg);
    for (const bytes of out === null ? [] : Array.isArray(out) ? out : [out]) {
      socket.send(bytes, rinfo.port, rinfo.address);
    }
  });
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
  return { port: socket.address().port, received };
}

/** TCP-Server auf `port` (dieselbe Nummer wie UDP), mit Längenpräfix. */
async function tcpServer(port: number, reply: (query: Buffer) => Uint8Array): Promise<void> {
  const server = createServer((conn) => {
    let buffer = Buffer.alloc(0);
    conn.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 2 || buffer.length < 2 + buffer.readUInt16BE(0)) return;
      const out = reply(buffer.subarray(2, 2 + buffer.readUInt16BE(0)));
      const frame = Buffer.alloc(2 + out.length);
      frame.writeUInt16BE(out.length, 0);
      frame.set(out, 2);
      conn.end(frame);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
}

const answer = (query: Buffer, spec: Omit<ResponseSpec, 'question'>) =>
  withId(query, response({ question: parseQuery(query), ...spec }));

describe('buildQuery', () => {
  it('fragt nur lesend und ohne Rekursion, mit EDNS ohne DO-Bit', () => {
    const query = Buffer.from(buildQuery('_dmarc.example.com', 'TXT', 0x1234));
    expect(query.readUInt16BE(0)).toBe(0x1234);
    // QR 0, Opcode 0 (QUERY), RD 0
    expect(query.readUInt16BE(2)).toBe(0);
    expect(parseQuery(query)).toEqual({ name: '_dmarc.example.com', type: 16, arcount: 1 });
    // OPT am Ende: Root, Typ 41, 1232 Byte, keine Flags
    const opt = query.subarray(query.length - 11);
    expect([...opt]).toEqual([0, ...u16(41), ...u16(1232), 0, 0, 0, 0, ...u16(0)]);
  });

  it('kennt nur die Typen der Propagation', () => {
    expect(() => buildQuery('example.com', 'DNSKEY', 1)).toThrow();
  });
});

describe('queryNameserver', () => {
  it('liest eine autoritative Antwort in die Form der Resolver', async () => {
    const { port, received } = await udpServer((q) =>
      answer(q, {
        flags: AA,
        answers: [
          { name: pointer(QUESTION_NAME), type: 15, ttl: 300, rdata: [...u16(10), ...name('MX.example.net.')] },
          { name: pointer(QUESTION_NAME), type: 16, ttl: 60, rdata: txt('v=spf1 ', 'include:example.net -all') },
          { name: pointer(QUESTION_NAME), type: 5, ttl: 60, rdata: name('alias.example.net') },
        ],
      })
    );

    const reply = await queryNameserver('127.0.0.1', 'example.com', 'MX', { timeoutMs: 2000, port });
    expect(reply).toMatchObject({ ok: true, authoritative: true, rcode: 0 });
    expect(reply.ok && reply.records).toEqual([
      { type: 'MX', name: 'example.com', priority: 10, value: 'MX.example.net', ttl: 300 },
      { type: 'TXT', name: 'example.com', value: 'v=spf1 include:example.net -all', ttl: 60 },
      { type: 'CNAME', name: 'example.com', value: 'alias.example.net', ttl: 60 },
    ]);
    // Je Frage eine neue, zufällige ID.
    const second = await queryNameserver('127.0.0.1', 'example.com', 'A', { timeoutMs: 2000, port });
    expect(second.ok).toBe(true);
    expect(received[0].readUInt16BE(0)).not.toBe(received[1].readUInt16BE(0));
  });

  it('meldet, ob die Antwort autoritativ ist (AA-Bit) und den RCODE', async () => {
    const { port } = await udpServer((q) =>
      parseQuery(q).name === 'refused.example' ? answer(q, { rcode: 5 }) : answer(q, { answers: [] })
    );
    expect(await queryNameserver('127.0.0.1', 'lame.example', 'A', { timeoutMs: 2000, port })).toMatchObject({
      ok: true,
      authoritative: false,
      rcode: 0,
      records: [],
    });
    expect(await queryNameserver('127.0.0.1', 'refused.example', 'A', { timeoutMs: 2000, port })).toMatchObject({
      ok: true,
      rcode: 5,
    });
  });

  it('verwirft Antworten mit fremder ID und nimmt die passende', async () => {
    const { port } = await udpServer((q) => {
      const good = answer(q, { flags: AA, answers: [{ name: pointer(QUESTION_NAME), type: 1, rdata: ipv4('192.0.2.1') }] });
      const spoofed = Uint8Array.from(good);
      spoofed[0] ^= 0xff;
      return [spoofed, good];
    });
    const reply = await queryNameserver('127.0.0.1', 'example.com', 'A', { timeoutMs: 2000, port });
    expect(reply.ok && reply.records.map((r) => r.value)).toEqual(['192.0.2.1']);
  });

  it('wiederholt die Frage einmal und gibt dann mit Timeout auf', async () => {
    const { port, received } = await udpServer(() => null);
    const start = Date.now();
    const reply = await queryNameserver('127.0.0.1', 'example.com', 'A', { timeoutMs: 300, port });
    expect(reply).toMatchObject({ ok: false, failure: 'timeout' });
    expect(Date.now() - start).toBeLessThan(1500);
    expect(received).toHaveLength(2);
  });

  it('wechselt bei gekürzter Antwort (TC) auf TCP', async () => {
    const { port } = await udpServer((q) => answer(q, { flags: AA | TC }));
    const chunks = Array.from({ length: 12 }, (_, i) => `google-site-verification=${'x'.repeat(60)}${i}`);
    await tcpServer(port, (q) =>
      answer(q, {
        flags: AA,
        answers: chunks.map((chunk) => ({ name: pointer(QUESTION_NAME), type: 16, rdata: txt(chunk) })),
      })
    );
    const reply = await queryNameserver('127.0.0.1', 'example.com', 'TXT', { timeoutMs: 2000, port });
    expect(reply.ok && reply.records.map((r) => r.value)).toEqual(chunks);
  });

  it('meldet einen Netzwerkfehler, wenn TCP abgelehnt wird', async () => {
    const { port } = await udpServer((q) => answer(q, { flags: AA | TC }));
    // Kein TCP-Server auf dem Port.
    expect(await queryNameserver('127.0.0.1', 'example.com', 'TXT', { timeoutMs: 2000, port })).toMatchObject({
      ok: false,
      failure: 'network',
    });
  });

  it('nimmt keine unlesbare oder fremde Antwort', async () => {
    const { port } = await udpServer((q) =>
      parseQuery(q).name === 'garbage.example'
        ? withId(q, Uint8Array.from([0, 0, 0x84, 0, 0, 1]))
        : withId(q, response({ question: { name: 'other.example', type: 1 }, flags: AA }))
    );
    for (const asked of ['garbage.example', 'asked.example']) {
      expect(await queryNameserver('127.0.0.1', asked, 'A', { timeoutMs: 2000, port }), asked).toMatchObject({
        ok: false,
        failure: 'invalid_response',
      });
    }
  });

  it('fragt nie einen Hostnamen — der würde an der Prüfung vorbei neu aufgelöst', async () => {
    await expect(queryNameserver('ns1.example.net', 'example.com', 'A', { timeoutMs: 100 })).rejects.toThrow();
  });
});

describe('connectFailure', () => {
  const error = (code: string) => Object.assign(new Error(code), { code });

  /** So scheitert es in einem Docker-Container ohne IPv6 — sofort, beim Verbinden. */
  it('liest „kein Weg ins IPv6-Netz“ als Aussage über diggy, nicht über den Nameserver', () => {
    for (const code of ['ENETUNREACH', 'EAFNOSUPPORT', 'EADDRNOTAVAIL']) {
      expect(connectFailure('2606:4700:4700::1111', error(code)), code).toMatchObject({ failure: 'no_ipv6' });
    }
  });

  it('lässt andere Fehler und IPv4 unverändert', () => {
    const refused = error('ECONNREFUSED');
    expect(connectFailure('2606:4700:4700::1111', refused)).toBe(refused);
    const unreachable = error('ENETUNREACH');
    expect(connectFailure('1.1.1.1', unreachable)).toBe(unreachable);
  });
});
