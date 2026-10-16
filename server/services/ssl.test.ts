import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateScore } from '../../shared/scoring.js';

/**
 * TLS-Check: „kein TLS“ oder „nicht erreicht“? (#101)
 *
 * Früher lieferte checkSsl für beides `null`, und ein Timeout hieß im Report
 * „Kein TLS auf Port 443 erreichbar“ (Warnung, −8). Der Socket ist gemockt:
 * so lässt sich jeder Ausgang des Handshakes gezielt auslösen, ohne ins Netz
 * zu gehen.
 */

const tls = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('node:tls', () => ({ connect: tls.connect }));

vi.mock('../lib/safeTarget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/safeTarget.js')>();
  return { ...actual, resolvePublicHost: vi.fn() };
});

const { checkSsl } = await import('./ssl.js');
const { sslFindings } = await import('./reportBuilder.js');
const { resolvePublicHost, UnresolvableTargetError } = await import('../lib/safeTarget.js');

const DOMAIN = 'example.com';
const DAY_MS = 86_400_000;

class FakeSocket extends EventEmitter {
  authorized = true;
  destroy = vi.fn();
  getProtocol = () => 'TLSv1.3';
  getPeerCertificate = () => ({
    subject: { CN: DOMAIN },
    issuer: { CN: 'Test CA', O: 'Test' },
    valid_from: new Date(Date.now() - DAY_MS).toUTCString(),
    valid_to: new Date(Date.now() + 60 * DAY_MS).toUTCString(),
    subjectaltname: `DNS:${DOMAIN}`,
    asn1Curve: 'prime256v1',
  });
}

/** Der Handshake verläuft wie `act` es vorgibt; nichts tun heißt: hängt. */
function handshake(act: (socket: FakeSocket) => void = () => {}) {
  tls.connect.mockImplementation(() => {
    const socket = new FakeSocket();
    setImmediate(() => act(socket));
    return socket;
  });
}

const socketError = (code: string) => (socket: FakeSocket) =>
  socket.emit('error', Object.assign(new Error(code), { code }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolvePublicHost).mockResolvedValue({
    hostname: DOMAIN,
    addresses: [{ address: '203.0.113.10', family: 4 }],
  });
});

describe('checkSsl', () => {
  it('liest das Zertifikat nach erfolgreichem Handshake', async () => {
    handshake((socket) => socket.emit('secureConnect'));
    const result = await checkSsl(DOMAIN);

    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.info).toMatchObject({
      valid: true,
      subject: DOMAIN,
      tlsVersion: 'TLSv1.3',
    });
  });

  it('Zeitüberschreitung: gescheitert, nicht „kein TLS“', async () => {
    handshake();
    expect(await checkSsl(DOMAIN, 20)).toEqual({ status: 'failed', reason: 'timeout' });
  });

  it.each([
    ['ETIMEDOUT', 'timeout'],
    ['ENETUNREACH', 'network'],
    ['EHOSTUNREACH', 'network'],
  ])('%s: gescheitert (%s)', async (code, reason) => {
    handshake(socketError(code));
    expect(await checkSsl(DOMAIN)).toEqual({ status: 'failed', reason });
  });

  it.each(['ECONNREFUSED', 'ECONNRESET', 'ERR_SSL_WRONG_VERSION_NUMBER', 'EPROTO'])(
    '%s: Port zu oder Handshake abgelehnt — kein TLS',
    async (code) => {
      handshake(socketError(code));
      expect(await checkSsl(DOMAIN)).toEqual({ status: 'none' });
    }
  );

  /**
   * Mehrere Adressen: Node probiert sie nacheinander und meldet einen
   * AggregateError, dessen `code` der ERSTE Einzelfehler ist. Echt
   * nachgestellt (Node 26): erste Adresse schweigt, zweite lehnt ab →
   * `code: 'ETIMEDOUT'`, `errors: [ETIMEDOUT, ECONNREFUSED]`.
   */
  describe('mehrere Adressen (Happy Eyeballs)', () => {
    const aggregate = (...codes: string[]) => (socket: FakeSocket) =>
      socket.emit(
        'error',
        Object.assign(
          new AggregateError(codes.map((code) => Object.assign(new Error(code), { code }))),
          { code: codes[0] }
        )
      );

    it.each([
      [['ETIMEDOUT', 'ECONNREFUSED']],
      [['ENETUNREACH', 'ECONNREFUSED']],
      [['ENETUNREACH', 'ECONNRESET']],
    ])('%j: eine Adresse hat geantwortet — kein TLS', async (codes) => {
      handshake(aggregate(...codes));
      expect(await checkSsl(DOMAIN)).toEqual({ status: 'none' });
    });

    it.each([
      [['ENETUNREACH', 'ETIMEDOUT'], 'timeout'],
      [['ENETUNREACH', 'EHOSTUNREACH'], 'network'],
    ] as const)('%j: keine Adresse erreicht — gescheitert (%s)', async (codes, reason) => {
      handshake(aggregate(...codes));
      expect(await checkSsl(DOMAIN)).toEqual({ status: 'failed', reason });
    });
  });

  it('Name ohne Adresse: kein TLS', async () => {
    vi.mocked(resolvePublicHost).mockRejectedValue(
      new UnresolvableTargetError('nicht auflösbar', { cause: { code: 'ENOTFOUND' } })
    );
    expect(await checkSsl(DOMAIN)).toEqual({ status: 'none' });
    expect(tls.connect).not.toHaveBeenCalled();
  });

  it('Auflösung gerade gestört (EAI_AGAIN): gescheitert', async () => {
    vi.mocked(resolvePublicHost).mockRejectedValue(
      new UnresolvableTargetError('nicht auflösbar', { cause: { code: 'EAI_AGAIN' } })
    );
    expect(await checkSsl(DOMAIN)).toEqual({ status: 'failed', reason: 'servfail' });
  });
});

describe('sslFindings bei gescheitertem Check', () => {
  it('meldet „nicht prüfbar“ ohne Abzug statt „Kein TLS“', () => {
    const findings = sslFindings(null, 'timeout');

    expect(findings).toEqual([
      expect.objectContaining({
        id: 'ssl-unchecked',
        severity: 'info',
        unchecked: true,
        category: 'ssl',
        title: 'SSL konnte nicht geprüft werden — Zeitüberschreitung',
      }),
    ]);
    expect(calculateScore(findings).score).toBe(100);
  });

  it('meldet echtes Fehlen weiter als Warnung', () => {
    const findings = sslFindings(null);
    expect(findings.map((finding) => finding.id)).toEqual(['no-ssl']);
    expect(calculateScore(findings).score).toBe(92);
  });
});
