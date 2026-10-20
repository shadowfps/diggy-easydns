/**
 * Lokaler HTTPS-Server mit HTTP/2 für Tests des DoH-Transports (#137).
 *
 * Bildet die beiden Anbieter nach, an denen `fetch` in Node 24 scheiterte:
 *  - ohne `allowHTTP1` bietet er per ALPN nur `h2` an — ein Client mit
 *    HTTP/1.1 bekommt den TLS-Alert no_application_protocol, wie bei DNS4EU;
 *  - mit `allowHTTP1` nimmt er HTTP/1.1 an und antwortet darauf mit 505,
 *    wie Quad9.
 * Er zählt Verbindungen und offene Sitzungen, damit Tests sehen, ob der
 * Client jede Verbindung wieder schließt.
 */

import http2 from 'node:http2';
import tls from 'node:tls';
import type { AddressInfo, Socket } from 'node:net';
import { selfSignedCert } from './selfSignedCert.js';

export const testCertificate = selfSignedCert();

/**
 * Lässt TLS-Clients im Prozess dem Testzertifikat vertrauen, zusätzlich zu
 * den üblichen. Gibt die Funktion zurück, die das wieder aufhebt. Vitest
 * startet jede Testdatei in einem eigenen Prozess; andere Dateien merken
 * davon nichts.
 */
export function trustTestCertificate(): () => void {
  const before = tls.getCACertificates('default');
  tls.setDefaultCACertificates([...before, testCertificate.cert]);
  return () => tls.setDefaultCACertificates(before);
}

export interface H2TestServer {
  /** `https://127.0.0.1:<port>` */
  origin: string;
  /** Angenommene TCP-Verbindungen, in der Reihenfolge ihres Eingangs. */
  sockets: Socket[];
  /** HTTP-Version jeder Anfrage, die beim Handler ankam. */
  httpVersions: string[];
  /** Gerade offene HTTP/2-Sitzungen. */
  openSessions(): number;
  close(): Promise<void>;
}

export interface H2TestServerOptions {
  /** HTTP/1.1 annehmen und mit 505 beantworten, wie Quad9. */
  allowHTTP1?: boolean;
  /** Vor dem TLS-Handshake zurücksetzen (RST), wie Quad9 aus manchen Netzen. `n` zählt ab 1. */
  resetConnection?: (n: number) => boolean;
  /** HTTP/2-Einstellungen des Servers, etwa `maxConcurrentStreams`. */
  settings?: http2.Settings;
}

export type H2Handler = (req: http2.Http2ServerRequest, res: http2.Http2ServerResponse) => void;

export async function startH2Server(handler: H2Handler, options: H2TestServerOptions = {}): Promise<H2TestServer> {
  const sockets: Socket[] = [];
  const httpVersions: string[] = [];
  const sessions = new Set<http2.ServerHttp2Session>();

  const server = http2.createSecureServer(
    {
      key: testCertificate.key,
      cert: testCertificate.cert,
      allowHTTP1: options.allowHTTP1 ?? false,
      settings: options.settings,
    },
    (req, res) => {
      httpVersions.push(req.httpVersion);
      if (req.httpVersionMajor !== 2) {
        res.writeHead(505);
        res.end();
        return;
      }
      handler(req, res);
    }
  );

  server.on('connection', (socket: Socket) => {
    sockets.push(socket);
    socket.on('error', () => {});
    if (options.resetConnection?.(sockets.length)) socket.resetAndDestroy();
  });
  server.on('session', (session) => {
    sessions.add(session);
    session.on('error', () => {});
    session.on('close', () => sessions.delete(session));
  });
  server.on('stream', (stream) => stream.on('error', () => {}));
  // Abgebrochene Handshakes sind hier gewollt.
  server.on('tlsClientError', () => {});

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `https://127.0.0.1:${port}`,
    sockets,
    httpVersions,
    openSessions: () => sessions.size,
    close: () =>
      new Promise<void>((resolve) => {
        for (const session of sessions) session.destroy();
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
