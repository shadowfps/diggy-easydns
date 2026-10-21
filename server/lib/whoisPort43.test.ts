import { createServer, Socket, type AddressInfo, type Server } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_WHOIS_BYTES, queryPort43 } from './whoisPort43.js';

// connect bleibt echt; nur der Test zum Verbindungsaufbau ersetzt ihn einmal.
vi.mock('node:net', async (importOriginal) => {
  const net = await importOriginal<typeof import('node:net')>();
  return { ...net, connect: vi.fn(net.connect) };
});
const net = await import('node:net');

/** Lokaler WHOIS-Server auf Port 0 — kein Netzzugriff nach außen. */
interface TestServer {
  port: number;
  /** Was die Clients geschickt haben, je Verbindung. */
  received: string[];
  /** Löst auf, sobald die n-te Verbindung geschlossen ist. */
  closed: (n?: number) => Promise<void>;
  connections: () => number;
}

let server: Server | undefined;

async function startServer(onConnection: (socket: Socket, query: Promise<string>) => void): Promise<TestServer> {
  const received: string[] = [];
  let connections = 0;
  let closedCount = 0;
  const waiters: { n: number; resolve: () => void }[] = [];

  server = createServer((socket) => {
    connections += 1;
    let data = '';
    const query = new Promise<string>((resolve) => {
      socket.on('data', (chunk) => {
        data += chunk.toString('latin1');
        if (data.includes('\r\n')) {
          received.push(data);
          resolve(data);
        }
      });
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      closedCount += 1;
      for (const w of waiters.filter((w) => w.n <= closedCount)) w.resolve();
    });
    onConnection(socket, query);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));

  return {
    port: (server.address() as AddressInfo).port,
    received,
    connections: () => connections,
    closed: (n = 1) =>
      n <= closedCount ? Promise.resolve() : new Promise((resolve) => waiters.push({ n, resolve })),
  };
}

// Nur setTimeout/clearTimeout: Sockets laufen echt über Loopback.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(async () => {
  // Jeder Ausgang räumt seine Timer ab.
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
  vi.mocked(net.connect).mockClear();
});

describe('queryPort43', () => {
  it('schickt die Domain mit CRLF und liefert den Text, wenn der Server schließt', async () => {
    const srv = await startServer(async (socket, query) => {
      await query;
      socket.write('Domain Name: example.io\r\n');
      socket.end('>>> Last update <<<\r\n');
    });

    const text = await queryPort43('127.0.0.1', 'example.io', { port: srv.port });
    expect(srv.received).toEqual(['example.io\r\n']);
    expect(text).toBe('Domain Name: example.io\r\n>>> Last update <<<\r\n');
    await srv.closed();
  });

  it('liest Latin-1, wenn die Antwort kein gültiges UTF-8 ist', async () => {
    const srv = await startServer(async (socket, query) => {
      await query;
      socket.end(Buffer.from('registrar: Österreich GmbH\n', 'latin1'));
    });
    expect(await queryPort43('127.0.0.1', 'example.at', { port: srv.port })).toBe('registrar: Österreich GmbH\n');
  });

  it('bricht ab, wenn der Server nach der Frage schweigt (Gesamt-Timeout)', async () => {
    let asked!: Promise<string>;
    const srv = await startServer((_socket, query) => {
      asked = query;
    });
    const lookup = queryPort43('127.0.0.1', 'example.it', { port: srv.port, timeoutMs: 5_000 });
    const outcome = expect(lookup).rejects.toThrow(/^Timeout$/);
    await vi.waitFor(() => expect(srv.received).toHaveLength(1));
    await asked;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(srv.connections()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    // Die Verbindung ist zu, nicht nur aufgegeben.
    await srv.closed();
  });

  it('bricht ab, wenn die Verbindung nicht zustande kommt (Timeout beim Aufbau)', async () => {
    // Ein Socket ohne Ziel meldet nie „connect“ — wie ein Host, der SYNs verschluckt.
    let socket: Socket | undefined;
    vi.mocked(net.connect).mockImplementationOnce((() => (socket = new Socket())) as typeof net.connect);
    const outcome = expect(
      queryPort43('whois.example', 'example.eu', { connectTimeoutMs: 3_000, timeoutMs: 5_000 })
    ).rejects.toThrow('Timeout beim Verbindungsaufbau');
    await vi.advanceTimersByTimeAsync(3_000);
    await outcome;
    expect(socket?.destroyed).toBe(true);
  });

  it(`bricht nach ${MAX_WHOIS_BYTES} Bytes ab und schließt die Verbindung`, async () => {
    const srv = await startServer(async (socket, query) => {
      await query;
      // Mehr als erlaubt, und der Server hört nicht von selbst auf.
      socket.write(Buffer.alloc(MAX_WHOIS_BYTES + 1024, 'a'));
    });
    await expect(queryPort43('127.0.0.1', 'example.io', { port: srv.port })).rejects.toThrow(
      `Antwort größer als ${MAX_WHOIS_BYTES} Bytes`
    );
    await srv.closed();
  });

  it('meldet einen Abbruch durch den Server als Fehler, nicht als leere Antwort', async () => {
    const srv = await startServer(async (socket, query) => {
      await query;
      socket.write('Domain Name: exa');
      socket.resetAndDestroy();
    });
    await expect(queryPort43('127.0.0.1', 'example.io', { port: srv.port })).rejects.toThrow(/ECONNRESET/);
  });

  it('meldet eine abgelehnte Verbindung als Fehler', async () => {
    const srv = await startServer(() => {});
    const { port } = srv;
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    await expect(queryPort43('127.0.0.1', 'example.io', { port })).rejects.toThrow(/ECONNREFUSED/);
  });

  it.each([
    'example.io\r\nhelp',
    'example.io other',
    '-h example.io',
    'example.io\u0000',
    '',
    'exämple.io',
  ])('baut für %j gar keine Verbindung auf', async (query) => {
    const srv = await startServer(() => {});
    await expect(queryPort43('127.0.0.1', query, { port: srv.port })).rejects.toThrow('ungültige Abfrage');
    expect(srv.connections()).toBe(0);
    expect(net.connect).not.toHaveBeenCalled();
  });
});
