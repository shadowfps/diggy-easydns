import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from './rateLimit.js';

/**
 * Integrationstests gegen eine echte Express-App.
 *
 * Die Unit-Tests in rateLimit.test.ts nutzen ein handgeschriebenes
 * Request-Double und prüfen damit die Bucket-Logik. Was sie NICHT prüfen: das
 * Zusammenspiel mit Express — insbesondere, wie `req.ip` aus der
 * `trust proxy`-Einstellung entsteht.
 *
 * Genau dort lag der schwerste Befund des Audits: getClientIp nahm den ERSTEN
 * Wert aus X-Forwarded-For, während ein Proxy die echte Peer-IP RECHTS
 * appendiert. Damit war jedes Limit über einen selbst gesetzten Header
 * umgehbar. Gefunden wurde das am laufenden Server, nicht im Test — diese
 * Datei schließt die Lücke.
 */

const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

afterEach(() => {
  if (ORIGINAL_TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
});

/**
 * @param trustProxyHops `undefined` = kein Proxy-Vertrauen (Socket-IP zählt)
 */
function makeApp(max: number, trustProxyHops?: number) {
  const app = express();
  if (trustProxyHops !== undefined) app.set('trust proxy', trustProxyHops);
  app.use(rateLimit({ windowMs: 60_000, max, message: 'zu viele' }));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('rateLimit hinter einem Reverse-Proxy', () => {
  /**
   * Der eigentliche Regressionstest. Der Angreifer setzt X-Forwarded-For
   * selbst; ein echter Proxy hängt die gesehene Peer-IP rechts an. Gezählt
   * werden muss die rechte, nicht die linke.
   */
  it('ignoriert den vom Client gesetzten Teil von X-Forwarded-For', async () => {
    process.env.TRUST_PROXY = 'true';
    const app = makeApp(3, 1);

    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get('/ping')
        // Links der gespoofte Wert (wechselt), rechts die "echte" Client-IP
        // vom Proxy — die bleibt gleich.
        .set('X-Forwarded-For', `203.0.113.${i}, 198.51.100.77`);
      codes.push(res.status);
    }

    expect(codes.filter((c) => c === 200)).toHaveLength(3);
    expect(codes.filter((c) => c === 429)).toHaveLength(2);
  });

  it('zählt verschiedene echte Client-IPs getrennt', async () => {
    process.env.TRUST_PROXY = 'true';
    const app = makeApp(1, 1);

    const a = await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.1, 198.51.100.1');
    const b = await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.1, 198.51.100.2');
    expect([a.status, b.status]).toEqual([200, 200]);

    const again = await request(app)
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.9, 198.51.100.1');
    expect(again.status).toBe(429);
  });

  it('ignoriert X-Forwarded-For komplett, wenn kein Proxy vertraut wird', async () => {
    delete process.env.TRUST_PROXY;
    const app = makeApp(2);

    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app).get('/ping').set('X-Forwarded-For', `203.0.113.${i}`);
      codes.push(res.status);
    }

    // Alle auf die Socket-IP gezählt, obwohl der Header wechselt.
    expect(codes.filter((c) => c === 200)).toHaveLength(2);
    expect(codes.filter((c) => c === 429)).toHaveLength(2);
  });

  it('setzt die RateLimit-Header auf der echten Antwort', async () => {
    delete process.env.TRUST_PROXY;
    const app = makeApp(5);

    const res = await request(app).get('/ping');
    expect(res.headers['ratelimit-limit']).toBe('5');
    expect(Number(res.headers['ratelimit-remaining'])).toBe(4);
  });

  it('antwortet mit 429, Retry-After und dem Fehler-Body', async () => {
    delete process.env.TRUST_PROXY;
    const app = makeApp(1);

    await request(app).get('/ping');
    const blocked = await request(app).get('/ping');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: 'rate_limited', message: 'zu viele' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  /**
   * Bei mehreren vertrauten Hops (CDN + Ingress) muss der n-te von rechts
   * zählen, nicht der erste von links.
   */
  it('kommt mit mehreren vertrauten Hops klar', async () => {
    process.env.TRUST_PROXY = '2';
    const app = makeApp(1, 2);

    // XFF: [gespooft, echter Client, innerer Proxy] — bei 2 vertrauten Hops
    // (Socket + innerer Proxy) zählt "echter Client".
    const first = await request(app)
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.1, 198.51.100.5, 10.0.0.1');
    expect(first.status).toBe(200);

    const second = await request(app)
      .get('/ping')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.5, 10.0.0.1');
    expect(second.status).toBe(429);
  });
});
