import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOH_RESOLVERS, dohQuery, type DohResolver } from './doh.js';
import { IDLE_MS, openSessionCount } from '../lib/http2Get.js';
import { parseQuery, response } from '../test/dnsMessage.js';
import { startH2Server, trustTestCertificate, type H2Handler, type H2TestServer } from '../test/h2Server.js';

/**
 * #137: Quad9 und DNS4EU antworteten in Produktion bei keiner Abfrage.
 * `fetch` spricht in Node 24, der Version im Image, nur HTTP/1.1; Quad9
 * lehnt das mit 505 ab, DNS4EU schon im TLS-Handshake. Lokal unter Node 26
 * fiel es nicht auf, und die Tests mockten `fetch`.
 *
 * Diese Tests schicken dohQuery an einen echten lokalen Server, der genau so
 * ablehnt — offline, also auch in `verify` der CI, und dort auf der
 * Node-Version des Images (letzter Test). Gegen die echten Anbieter prüft
 * scripts/check-propagation-live.mjs, aber nicht in der CI: Deren Ausfall
 * soll keinen PR rot machen.
 */

let untrust: () => void;
beforeAll(() => {
  untrust = trustTestCertificate();
});
afterAll(() => untrust());

let server: H2TestServer | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  server = undefined;
  await vi.waitFor(() => expect(openSessionCount()).toBe(0), { timeout: 3000 });
});

/** Ein Anbieter aus der Liste, mit dem lokalen Server als Endpunkt. */
function local(id: string): DohResolver {
  const resolver = DOH_RESOLVERS.find((r) => r.id === id)!;
  return { ...resolver, url: `${server!.origin}${new URL(resolver.url).pathname}` };
}

/** Beantwortet DoH in beiden Formaten: A-Record 192.0.2.1, TTL 300. */
const answerA: H2Handler = (req, res) => {
  const url = new URL(req.url, 'https://localhost');
  const dns = url.searchParams.get('dns');
  if (dns) {
    const question = parseQuery(Buffer.from(dns, 'base64url'));
    res.writeHead(200, { 'content-type': 'application/dns-message' });
    res.end(response({ question, answers: [{ name: question.name, type: 1, rdata: [192, 0, 2, 1] }] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/dns-json' });
  res.end(
    JSON.stringify({
      Status: 0,
      Answer: [{ name: `${url.searchParams.get('name')}.`, type: 1, TTL: 300, data: '192.0.2.1' }],
    })
  );
};

const A_RECORD = [{ type: 'A', name: 'example.com', value: '192.0.2.1', ttl: 300 }];

/** Wartet ein Test auf die Leerlaufzeit, braucht er mehr als die üblichen 5 s. */
const LONG_TEST = IDLE_MS + 10_000;

/**
 * Unter Node 26 handelt `fetch` HTTP/2 aus — ginge DoH wieder über `fetch`,
 * liefen die Tests dort durch, obwohl das Image (Node 24) scheitert. So fällt
 * es auch lokal auf.
 */
function forbidFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('DoH läuft über lib/http2Get.ts, nicht über fetch (#137)');
    })
  );
}

describe('dohQuery über HTTP/2 (#137)', () => {
  it('bekommt eine Antwort von einem Anbieter, der per ALPN nur h2 anbietet (wie DNS4EU)', async () => {
    forbidFetch();
    server = await startH2Server(answerA);

    const result = await dohQuery(local('dns4eu'), 'example.com', 'A');

    expect(result.records).toEqual(A_RECORD);
    expect(server.httpVersions).toEqual(['2.0']);
  });

  it('bekommt eine Antwort von einem Anbieter, der HTTP/1.1 mit 505 ablehnt (wie Quad9)', async () => {
    forbidFetch();
    server = await startH2Server(answerA, { allowHTTP1: true });

    const result = await dohQuery(local('quad9'), 'example.com', 'A');

    expect(result.records).toEqual(A_RECORD);
    expect(server.httpVersions).toEqual(['2.0']);
  });

  it('fragt die Anbieter mit JSON-API ebenso über HTTP/2', async () => {
    forbidFetch();
    server = await startH2Server(answerA, { allowHTTP1: true });

    for (const id of DOH_RESOLVERS.filter((r) => r.format === 'json').map((r) => r.id)) {
      expect((await dohQuery(local(id), 'example.com', 'A')).records, id).toEqual(A_RECORD);
    }
    expect(new Set(server.httpVersions)).toEqual(new Set(['2.0']));
  });

  /** Quad9 setzt aus manchen Netzen neue TLS-Verbindungen zurück — auch mit HTTP/2. */
  it('versucht es nach einem Reset im TLS-Handshake über eine neue Verbindung erneut', async () => {
    server = await startH2Server(answerA, { resetConnection: (n) => n <= 2 });

    const result = await dohQuery(local('quad9'), 'example.com', 'A');

    expect(result.records).toEqual(A_RECORD);
    expect(server.sockets).toHaveLength(3);
  });

  it('gibt nach vier Verbindungsversuchen auf', async () => {
    server = await startH2Server(answerA, { resetConnection: () => true });

    await expect(dohQuery(local('quad9'), 'example.com', 'A')).rejects.toMatchObject({
      message: 'fetch failed',
      cause: { code: 'ECONNRESET' },
    });
    expect(server.sockets).toHaveLength(4);
  });

  /** Vorher kam der halbe Body als Antwort an: „Nachricht endet vorzeitig“ statt eines neuen Versuchs. */
  it('versucht es nach einer mittendrin abgebrochenen Antwort erneut', async () => {
    let requests = 0;
    server = await startH2Server((req, res) => {
      if (++requests > 1) return answerA(req, res);
      res.writeHead(200, { 'content-type': 'application/dns-message' });
      res.write(Buffer.from([0, 0, 0x81, 0x80, 0, 1, 0, 1]));
      setTimeout(() => server!.sockets.at(-1)!.end(), 20);
    });

    const result = await dohQuery(local('quad9'), 'example.com', 'A');

    expect(result.records).toEqual(A_RECORD);
    expect(requests).toBe(2);
  });

  it('wiederholt eine HTTP-Fehlerantwort nicht', async () => {
    server = await startH2Server((_req, res) => {
      res.writeHead(503);
      res.end();
    });

    await expect(dohQuery(local('dns4eu'), 'example.com', 'A')).rejects.toThrow('dns4eu HTTP 503');
    expect(server.sockets).toHaveLength(1);
  });

  it('bricht nach dem Timeout mit AbortError ab, die Verbindung geht danach zu', async () => {
    server = await startH2Server(() => {}); // antwortet nie

    await expect(dohQuery(local('dns4eu'), 'example.com', 'A', { timeoutMs: 200 })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(server!.openSessions()).toBe(0), { timeout: IDLE_MS + 3000 });
  }, LONG_TEST);

  /**
   * Die erste Welle geht los, bevor die Grenze des Servers bekannt ist; was
   * er abweist (REFUSED_STREAM), hat er nicht bearbeitet und kommt im
   * nächsten Versuch dran.
   */
  it('bekommt alle Antworten von einem Server, der nur zwei Streams gleichzeitig zulässt', async () => {
    server = await startH2Server(answerA, { settings: { maxConcurrentStreams: 2 } });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => dohQuery(local('quad9'), 'example.com', 'A'))
    );

    expect(results.map((r) => r.records)).toEqual(Array.from({ length: 20 }, () => A_RECORD));
  });
});

describe('Node-Version der Tests', () => {
  /**
   * Wie ein Anbieter auf `fetch` reagiert, hing an der Node-Version: Node 26
   * handelt HTTP/2 aus, Node 24 nicht. Die Tests oben sagen über Produktion
   * nur etwas, wenn die CI dieselbe Version nutzt wie das Image — exakt,
   * denn auch Patch-Releases tauschen undici aus (so der Sicherheitspatch
   * 24.22.1). Hebt Dependabot nur das Dockerfile, fällt das hier auf.
   */
  it('nutzt in der CI dieselbe Node-Version wie das Produktions-Image', () => {
    const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    const image = [...read('Dockerfile').matchAll(/^FROM node:([\d.]+\d)\b/gm)].map((m) => m[1]);
    const ci = [...read('.github/workflows/container.yml').matchAll(/node-version:\s*['"]?([\d.]+\d)/g)].map((m) => m[1]);

    expect(image.length, 'FROM node:… im Dockerfile').toBeGreaterThan(0);
    expect(ci.length, 'node-version in container.yml').toBeGreaterThan(0);
    expect([...new Set([...image, ...ci])]).toEqual([image[0]]);
  });
});
