import https from 'node:https';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CLOSED_BEFORE_RESPONSE, IDLE_MS, http2Get, openSessionCount } from './http2Get.js';
import { startH2Server, testCertificate, trustTestCertificate, type H2TestServer } from '../test/h2Server.js';

/**
 * Der DoH-Transport gegen einen echten lokalen HTTP/2-Server (#137) —
 * offline, auf der Node-Version der CI, die der des Produktions-Images
 * entspricht (siehe doh.http2.test.ts).
 */

let untrust: () => void;
beforeAll(() => {
  untrust = trustTestCertificate();
});
afterAll(() => untrust());

/** Bis eine ungenutzte Sitzung von selbst zugeht, mit Luft für langsame Runner. */
const UNTIL_IDLE = { timeout: IDLE_MS + 3000, interval: 50 };
/** Tests, die auf die Leerlaufzeit warten, brauchen mehr als die üblichen 5 s. */
const LONG_TEST = IDLE_MS + 10_000;

let server: H2TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
  // Kein Test hinterlässt eine Sitzung — und der nächste bekommt keine alte.
  await vi.waitFor(() => expect(openSessionCount()).toBe(0));
});

function get(url: string, headers?: Record<string, string>) {
  return http2Get(url, { headers, signal: AbortSignal.timeout(5000) });
}

/** Wie `fetch` meldet http2Get einen Netzwerkfehler: TypeError, Grund mit `code` in `cause`. */
async function failure(promise: Promise<unknown>): Promise<{ message: string; code: unknown }> {
  const error = await promise.then(
    () => expect.unreachable('sollte scheitern'),
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(TypeError);
  const { message, cause } = error as TypeError;
  return { message, code: (cause as { code?: unknown } | undefined)?.code };
}

/** Offene TCP-Sockets des Prozesses — Client und Testserver zusammen. */
const tcpSockets = () => process.getActiveResourcesInfo().filter((r) => r === 'TCPSocketWrap').length;

describe('http2Get — Protokoll', () => {
  it('spricht HTTP/2 mit einem Server, der per ALPN nur h2 anbietet (wie DNS4EU)', async () => {
    const seen: { path?: string; accept?: string; encoding?: string } = {};
    server = await startH2Server((req, res) => {
      Object.assign(seen, {
        path: req.url,
        accept: req.headers.accept,
        encoding: req.headers['accept-encoding'],
      });
      res.writeHead(200, { 'content-type': 'application/dns-message' });
      res.end(Buffer.from([1, 2, 3]));
    });

    const res = await get(`${server.origin}/dns-query?dns=AAAB`, { accept: 'application/dns-message' });

    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toBe('application/dns-message');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(server.httpVersions).toEqual(['2.0']);
    expect(seen).toEqual({ path: '/dns-query?dns=AAAB', accept: 'application/dns-message', encoding: 'identity' });
  });

  it('bekommt die Antwort auch von einem Server, der HTTP/1.1 mit 505 ablehnt (wie Quad9)', async () => {
    server = await startH2Server((_req, res) => res.end('{"Status":0}'), { allowHTTP1: true });

    const res = await get(`${server.origin}/resolve?name=example.com&type=1`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ Status: 0 });
    expect(server.httpVersions).toEqual(['2.0']);
  });

  it('liefert einen Fehlerstatus als Response, ohne zu werfen', async () => {
    server = await startH2Server((_req, res) => {
      res.writeHead(503);
      res.end('busy');
    });

    const res = await get(`${server.origin}/dns-query`);

    expect(res.status).toBe(503);
    expect(res.ok).toBe(false);
    expect(await res.text()).toBe('busy');
  });

  it('lehnt eine Antwort über 1 MiB ab, ohne die Verbindung für andere zu schließen', async () => {
    server = await startH2Server((req, res) => res.end(req.url === '/gross' ? Buffer.alloc(1024 * 1024 + 1) : 'klein'));

    await expect(get(`${server.origin}/gross`)).rejects.toThrow('Antwort größer als 1 MiB');
    expect(await (await get(`${server.origin}/klein`)).text()).toBe('klein');
    expect(server.sockets).toHaveLength(1);
  });
});

describe('http2Get — Verbindungsfehler wie bei fetch', () => {
  it('meldet einen Reset im TLS-Handshake mit ECONNRESET', async () => {
    server = await startH2Server(() => {}, { resetConnection: () => true });

    expect(await failure(get(`${server.origin}/dns-query`))).toEqual({ message: 'fetch failed', code: 'ECONNRESET' });
  });

  it('meldet eine Verbindung, die ohne Antwort zugeht, als CLOSED_BEFORE_RESPONSE', async () => {
    // Die Gegenseite schließt die Verbindung (FIN), nachdem die Anfrage da ist.
    server = await startH2Server(() => server!.sockets.at(-1)!.end());
    expect(await failure(get(`${server.origin}/dns-query`))).toEqual({
      message: 'fetch failed',
      code: CLOSED_BEFORE_RESPONSE,
    });
  });

  it('meldet einen Stream, der ohne Fehlercode und ohne Antwort endet, ebenso', async () => {
    server = await startH2Server((req) => req.stream.close(0)); // RST_STREAM NO_ERROR
    expect((await failure(get(`${server.origin}/dns-query`))).code).toBe(CLOSED_BEFORE_RESPONSE);
  });

  it('meldet einen abgewiesenen Stream (REFUSED_STREAM) ebenso — er wurde nicht bearbeitet', async () => {
    server = await startH2Server((req) => req.stream.close(7)); // NGHTTP2_REFUSED_STREAM
    expect((await failure(get(`${server.origin}/dns-query`))).code).toBe(CLOSED_BEFORE_RESPONSE);
  });

  it('meldet einen Server ohne HTTP/2 mit dem TLS-Fehler, nicht als Abbruch', async () => {
    const h1 = https.createServer(testCertificate, (_req, res) => res.end('nur HTTP/1.1'));
    h1.on('tlsClientError', () => {});
    await new Promise<void>((resolve) => h1.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = h1.address() as AddressInfo;
      const { message, code } = await failure(get(`https://127.0.0.1:${port}/dns-query`));
      expect(message).toBe('fetch failed');
      expect(code).toBe('ERR_SSL_TLSV1_ALERT_NO_APPLICATION_PROTOCOL');
    } finally {
      h1.closeAllConnections();
      await new Promise((resolve) => h1.close(resolve));
    }
  });
});

describe('http2Get — Abbruch', () => {
  it('bricht über das Signal sofort ab, mit dessen Grund', async () => {
    server = await startH2Server(() => {}); // antwortet nie
    const ctrl = new AbortController();
    const pending = http2Get(`${server.origin}/dns-query`, { signal: ctrl.signal });
    await vi.waitFor(() => expect(server!.openSessions()).toBe(1));

    ctrl.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('bricht nur die eigene Anfrage ab, nicht andere auf derselben Verbindung', async () => {
    server = await startH2Server((req, res) => {
      if (req.url === '/schnell') res.end('ok');
    });
    const ctrl = new AbortController();
    const slow = http2Get(`${server.origin}/langsam`, { signal: ctrl.signal });
    await vi.waitFor(() => expect(server!.openSessions()).toBe(1));

    ctrl.abort();

    await expect(slow).rejects.toMatchObject({ name: 'AbortError' });
    expect(await (await get(`${server.origin}/schnell`)).text()).toBe('ok');
    expect(server.sockets).toHaveLength(1);
  });

  /**
   * Ein Server, der TCP annimmt, den TLS-Handshake aber nie beendet. Ohne
   * Abbruch hielte der Client den Socket unbegrenzt offen — Node kennt für
   * den Handshake keinen Timeout, und close() wartet auf ihn.
   */
  async function silentServer() {
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => {
      sockets.push(socket);
      socket.resume(); // liest mit, sonst sähe er das Schließen nicht
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as AddressInfo;
    return {
      url: `https://127.0.0.1:${port}/dns-query`,
      sockets,
      close: async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => silent.close(resolve));
      },
    };
  }

  it('schließt eine Verbindung, deren Aufbau beim Abbruch noch hängt', async () => {
    const silent = await silentServer();
    try {
      const ctrl = new AbortController();
      const pending = http2Get(silent.url, { signal: ctrl.signal });
      await vi.waitFor(() => expect(silent.sockets).toHaveLength(1));

      ctrl.abort();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(openSessionCount()).toBe(0);
      await vi.waitFor(() => expect(silent.sockets[0].closed).toBe(true));
    } finally {
      await silent.close();
    }
  });

  it('lässt einen hängenden Aufbau offen, solange noch eine Anfrage darauf wartet', async () => {
    const silent = await silentServer();
    try {
      const first = new AbortController();
      const second = new AbortController();
      const pending = [first, second].map((ctrl) =>
        http2Get(silent.url, { signal: ctrl.signal }).catch((e: Error) => e.name)
      );
      await vi.waitFor(() => expect(silent.sockets).toHaveLength(1));

      first.abort();
      expect(await pending[0]).toBe('AbortError');
      // Eine neue Anfrage wartet nicht mit, sie baut eine eigene Verbindung auf.
      expect(openSessionCount()).toBe(0);
      expect(silent.sockets[0].closed).toBe(false);

      second.abort();
      expect(await pending[1]).toBe('AbortError');
      await vi.waitFor(() => expect(silent.sockets[0].closed).toBe(true));
    } finally {
      await silent.close();
    }
  });

  it('verbindet gar nicht erst, wenn das Signal schon abgebrochen ist', async () => {
    server = await startH2Server((_req, res) => res.end());
    await expect(http2Get(`${server.origin}/dns-query`, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(server.sockets).toHaveLength(0);
  });
});

describe('http2Get — Verbindungen', () => {
  it('teilt eine Verbindung für gleichzeitige und kurz folgende Anfragen', async () => {
    server = await startH2Server((req, res) => res.end(req.url));

    const parallel = await Promise.all(['/a', '/aaaa'].map((path) => get(`${server!.origin}${path}`)));
    const later = await get(`${server.origin}/mx`);

    expect(await Promise.all([...parallel, later].map((res) => res.text()))).toEqual(['/a', '/aaaa', '/mx']);
    expect(server.sockets).toHaveLength(1);
  });

  it('schließt eine Verbindung nach der Leerlaufzeit und öffnet danach eine neue', async () => {
    server = await startH2Server((_req, res) => res.end());

    await get(`${server.origin}/eins`);
    await vi.waitFor(() => expect(server!.openSessions()).toBe(0), UNTIL_IDLE);
    expect(openSessionCount()).toBe(0);
    await get(`${server.origin}/zwei`);

    expect(server.sockets).toHaveLength(2);
  }, LONG_TEST);

  it('öffnet nach einem GOAWAY der Gegenseite eine neue Verbindung', async () => {
    server = await startH2Server((req, res) => {
      res.end();
      if (req.url === '/letzte') req.stream.session?.goaway();
    });

    await get(`${server.origin}/letzte`);
    await vi.waitFor(() => expect(openSessionCount()).toBe(0));
    await get(`${server.origin}/neu`);

    expect(server.sockets).toHaveLength(2);
  });

  /**
   * Kennt die Sitzung die Grenze des Servers, wartet Node mit weiteren
   * Streams, bis einer frei wird. Was vor ihren SETTINGS losgeht und
   * abgewiesen wird (REFUSED_STREAM), wiederholt doh.ts.
   */
  it('hält sich an die Zahl gleichzeitiger Streams, die der Server erlaubt', async () => {
    server = await startH2Server((req, res) => setTimeout(() => res.end(req.url), 20), {
      settings: { maxConcurrentStreams: 2 },
    });
    await get(`${server.origin}/erste`);

    const bodies = await Promise.all(
      Array.from({ length: 20 }, (_, i) => get(`${server!.origin}/q${i}`).then((res) => res.text()))
    );

    expect(bodies).toEqual(Array.from({ length: 20 }, (_, i) => `/q${i}`));
  });

  /**
   * Eine Propagation-Abfrage schickt bis zu 18 Anfragen auf einmal (neun
   * Resolver, zwei Typen), mehrere Abfragen gleichzeitig entsprechend mehr.
   * Danach muss alles zu sein — sonst wüchse mit jeder Prüfung die Zahl
   * offener Sockets im Container.
   */
  it('schickt 200 gleichzeitige Anfragen über eine Verbindung und schließt sie danach', async () => {
    server = await startH2Server((req, res) => res.end(req.url));
    const before = tcpSockets();

    const bodies = await Promise.all(
      Array.from({ length: 200 }, (_, i) => get(`${server!.origin}/q${i}`).then((res) => res.text()))
    );

    expect(bodies).toEqual(Array.from({ length: 200 }, (_, i) => `/q${i}`));
    expect(server.sockets).toHaveLength(1);
    expect(tcpSockets()).toBe(before + 2); // ein Socket je Seite, bis zur Leerlaufzeit
    await vi.waitFor(() => {
      expect(server!.openSessions()).toBe(0);
      expect(openSessionCount()).toBe(0);
      expect(tcpSockets()).toBe(before);
    }, UNTIL_IDLE);
  }, LONG_TEST);
});
