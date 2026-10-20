/**
 * GET über HTTP/2 — der Transport für die DoH-Abfragen in doh.ts (#137).
 *
 * Warum nicht `fetch`: In Node 24, der Version im Produktions-Image, bietet
 * `fetch` beim TLS-Handshake per ALPN nur `http/1.1` an. Quad9 antwortet
 * darauf mit `505 HTTP Version Not Supported`, DNS4EU bricht schon den
 * Handshake ab (TLS-Alert 120, no_application_protocol). Node 26 handelt mit
 * `fetch` HTTP/2 aus — auf dem Mac fiel es deshalb nicht auf. RFC 8484 nennt
 * HTTP/2 die empfohlene Mindestversion für DoH; alle neun Anbieter sprechen
 * es. `node:http2` spricht es in jeder Node-Version gleich, ohne neue
 * Abhängigkeit.
 *
 * Nach außen wie `fetch`, damit doh.ts gleich weiterarbeitet:
 *  - Jede HTTP-Antwort, auch ein Fehlerstatus, kommt als `Response`.
 *  - Ein Netzwerkfehler kommt als `TypeError('fetch failed')`, der Grund mit
 *    `code` in `cause` (ECONNRESET, ENOTFOUND, CERT_HAS_EXPIRED …).
 *  - Der Abbruch über `signal` wirft `signal.reason` — beim Timeout in doh.ts
 *    also einen AbortError.
 * Anders als `fetch` liegt der Body schon vollständig vor (höchstens 1 MiB),
 * wenn die `Response` kommt. Weiterleitungen werden nicht verfolgt.
 *
 * Verbindungen: höchstens eine Sitzung je Anbieter, die alle gleichzeitigen
 * Anfragen dorthin teilen (HTTP/2-Streams); nach 2 s ohne Anfrage geht sie
 * zu. Eine Verbindung je Anfrage — so arbeitete auch `fetch` mit HTTP/1.1 —
 * öffnete im Lasttest (40 Propagation-Abfragen auf einmal, 360 Anfragen) 360
 * Sockets. Die TLS-Handshakes hielten die Event-Loop bis zu 400 ms auf, und
 * Happy Eyeballs brach Verbindungsaufbauten nach 250 ms mit ETIMEDOUT ab,
 * bei einzelnen Anbietern alle 40 Abfragen. Geteilt sind es neun Sockets und
 * unter 20 ms Verzögerung. Eine Folgeabfrage im selben Report (A und AAAA,
 * DNSSEC, TTL) spart außerdem den Handshake, rund 40 ms.
 *
 * Begrenzt bleibt es so: eine Sitzung je Anbieter, und 2 s sind kürzer als
 * übliche Leerlauf-Grenzen von Servern und NAT — keine Anfrage hängt an einer
 * Verbindung, die die Gegenseite schon still verworfen hat. Was die
 * Gegenseite schließt, zurücksetzt oder per GOAWAY beendet, wird sofort
 * ausgetragen; der nächste Versuch (doh.ts) läuft über eine neue Verbindung.
 */

import http2 from 'node:http2';

/** DNS-Nachrichten enden bei 64 KiB, die JSON-Form liegt etwas darüber. */
const MAX_BODY_BYTES = 1024 * 1024;

/** Statuscodes ohne Body — `new Response` nimmt dort keinen an. */
const NULL_BODY_STATUS = new Set([204, 205, 304]);

/** So lange bleibt eine Sitzung ohne Anfrage offen. */
export const IDLE_MS = 2_000;

/**
 * `cause.code`, wenn eine Anfrage ohne vollständige Antwort endet, ohne dass
 * Node einen Netzwerkfehler meldet: Die Gegenseite schließt die Verbindung
 * (FIN), beendet den Stream ohne Fehlercode oder weist ihn ab, bevor sie ihn
 * bearbeitet (REFUSED_STREAM, GOAWAY). Ein neuer Versuch ist sicher.
 */
export const CLOSED_BEFORE_RESPONSE = 'CLOSED_BEFORE_RESPONSE';

export interface Http2GetInit {
  headers?: Record<string, string>;
  /** Pflicht: Ohne Abbruch hätte die Anfrage keinen Timeout. */
  signal: AbortSignal;
}

/** Die offene Sitzung je Origin (`https://host[:port]`). */
const sessions = new Map<string, http2.ClientHttp2Session>();

/** Neue Anfragen an diesen Origin bekommen danach eine neue Sitzung. */
function forget(origin: string, session: http2.ClientHttp2Session) {
  if (sessions.get(origin) === session) sessions.delete(origin);
}

function sessionFor(origin: string): http2.ClientHttp2Session {
  const current = sessions.get(origin);
  if (current && !current.closed && !current.destroyed) return current;

  const session = http2.connect(origin, { settings: { enablePush: false } });
  sessions.set(origin, session);
  const drop = () => forget(origin, session);
  // Fehler der Sitzung erreichen die Anfragen über ihre Streams. Ohne
  // Listener beendete ein 'error'-Event hier den Prozess.
  session.on('error', drop);
  // Die Gegenseite nimmt keine neuen Streams mehr an; laufende enden noch.
  session.on('goaway', drop);
  session.on('close', drop);
  // close() lässt laufende Streams zu Ende laufen und schließt dann. Die
  // Leerlaufzeit zählt erst, wenn die Verbindung steht: Ein close() während
  // des Aufbaus brach jede wartende Anfrage ab, sobald sie stand
  // (ERR_HTTP2_GOAWAY_SESSION) — bei einem Aufbau über 2 s, obwohl ihr
  // Timeout noch lief. Bis dahin begrenzen ihn die Anfragen (release).
  session.once('connect', () => session.setTimeout(IDLE_MS, () => session.close()));
  return session;
}

/** Laufende Anfragen je Sitzung. */
const inFlight = new WeakMap<http2.ClientHttp2Session, number>();

/**
 * Nach dem Ende einer Anfrage. Eine Sitzung, die keine neuen Anfragen mehr
 * bekommt und keine mehr trägt, braucht niemand: Sie geht sofort zu — mitten
 * im Verbindungsaufbau per destroy(), denn close() wartet dort, bis die
 * Verbindung steht, und ein Server, der den TLS-Handshake nie beendet, hielte
 * den Socket sonst unbegrenzt offen.
 */
function release(origin: string, session: http2.ClientHttp2Session) {
  const left = (inFlight.get(session) ?? 1) - 1;
  inFlight.set(session, left);
  const reusable = sessions.get(origin) === session && !session.closed && !session.destroyed;
  if (left > 0 || reusable) return;
  if (session.connecting) session.destroy();
  else session.close();
}

/** Offene Sitzungen — für Tests, ob alles wieder zugeht. */
export function openSessionCount(): number {
  return sessions.size;
}

export function http2Get(url: string, { headers = {}, signal }: Http2GetInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const target = new URL(url);
    const session = sessionFor(target.origin);
    inFlight.set(session, (inFlight.get(session) ?? 0) + 1);
    let stream: http2.ClientHttp2Stream;
    try {
      stream = session.request({
        ...headers,
        ':method': 'GET',
        ':path': `${target.pathname}${target.search}`,
        // Ohne Angabe dürfte der Server komprimieren; die Antworten sind klein.
        'accept-encoding': 'identity',
      });
    } catch (error) {
      // Die Sitzung nimmt nichts mehr an; die nächste Anfrage bekommt eine neue.
      forget(target.origin, session);
      release(target.origin, session);
      reject(new TypeError('fetch failed', { cause: error }));
      return;
    }

    let settled = false;
    /**
     * Genau ein Ausgang. Bei Fehler und Abbruch geht nur der eigene Stream
     * zu; die Sitzung teilen sich parallele Anfragen.
     */
    const settle = (outcome: () => void, success = false) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (!success && !stream.closed) stream.close(http2.constants.NGHTTP2_CANCEL);
      release(target.origin, session);
      outcome();
    };
    const fail = (error: unknown) =>
      settle(() => reject(new TypeError('fetch failed', { cause: rootCause(error) })));
    const onAbort = () => {
      // Hängt noch der Verbindungsaufbau, bekommt die nächste Anfrage eine
      // neue Verbindung. Wer schon auf diese wartet, wartet weiter; mit der
      // letzten Anfrage geht sie zu (release).
      if (session.connecting) forget(target.origin, session);
      settle(() => reject(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    stream.on('error', (error) =>
      fail(stream.rstCode === http2.constants.NGHTTP2_REFUSED_STREAM ? closedBeforeResponse() : error)
    );
    // Kommt nach 'end' — nur ohne vollständige Antwort ist hier noch etwas offen.
    stream.on('close', () => fail(closedBeforeResponse()));
    stream.on('response', (responseHeaders) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
        else settle(() => reject(new Error(`${target.host}: Antwort größer als 1 MiB`)));
      });
      stream.on('end', () => {
        if (truncated(stream, responseHeaders, size)) {
          fail(closedBeforeResponse());
          return;
        }
        let response: Response;
        try {
          response = toResponse(responseHeaders, Buffer.concat(chunks));
        } catch (error) {
          settle(() => reject(error));
          return;
        }
        settle(() => resolve(response), true);
      });
    });
    stream.end();
  });
}

/**
 * Ob die Antwort vor ihrem Ende abbrach. Node meldet 'end' auch dann, wenn
 * die Verbindung mittendrin zugeht oder der Server den Stream abbricht — der
 * halbe Body sähe sonst aus wie ein ganzer. In diesen Fällen ist der Stream
 * hier schon zerstört oder trägt einen RST-Code; nach einer vollständigen
 * Antwort nicht, Node zerstört ihn erst nach 'end'. Ein RST_STREAM mit
 * NO_ERROR mitten im Body verrät sich nur über content-length.
 */
function truncated(stream: http2.ClientHttp2Stream, headers: http2.IncomingHttpHeaders, size: number): boolean {
  if (stream.destroyed || stream.rstCode !== http2.constants.NGHTTP2_NO_ERROR) return true;
  const declared = headers['content-length'];
  return declared !== undefined && Number(declared) !== size;
}

/**
 * Bricht Node einen offenen Stream ab, weil die Verbindung zuging, hängt der
 * eigentliche Grund in `cause` — ECONNRESET oder ein TLS-Fehler. Ohne Grund
 * ging sie ohne Fehler zu. Danach entscheidet doh.ts, ob ein neuer Versuch
 * lohnt.
 */
function rootCause(error: unknown): unknown {
  const { code, cause } = (error ?? {}) as { code?: unknown; cause?: unknown };
  if (code !== 'ERR_HTTP2_STREAM_CANCEL') return error;
  return cause ?? closedBeforeResponse();
}

function closedBeforeResponse(): Error {
  return Object.assign(new Error('Verbindung geschlossen, bevor die Antwort vollständig war'), {
    code: CLOSED_BEFORE_RESPONSE,
  });
}

function toResponse(raw: http2.IncomingHttpHeaders & http2.IncomingHttpStatusHeader, body: Buffer): Response {
  const status = Number(raw[':status']);
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (name.startsWith(':') || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
  }
  const encoding = headers.get('content-encoding');
  if (encoding && encoding !== 'identity') {
    throw new Error(`Antwort trotz accept-encoding: identity komprimiert (${encoding})`);
  }
  return new Response(NULL_BODY_STATUS.has(status) ? null : body, { status, headers });
}
