import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSiteGate, siteGateFromEnv, SITE_GATE_META } from './siteGate.js';

/**
 * Passwortschutz der Testumgebung gegen eine echte Express-App — aufgebaut
 * wie in server/index.ts: Health offen, Anmeldung offen, die übrige API
 * gesperrt, bis ein gültiges Cookie mitkommt.
 */

const SECRET = 'x'.repeat(32);
const START = Date.UTC(2026, 9, 30, 12);

function makeApp(now = () => START) {
  const gate = createSiteGate({ password: 'geheim', secret: SECRET, secureCookie: true, now });
  const app = express();
  app.use(express.json());
  app.use(gate.noIndex);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/site-gate', gate.status);
  app.post('/api/site-gate', gate.login);
  app.use('/api', gate.guard);
  app.get('/api/lookup', (_req, res) => res.json({ records: [] }));
  app.get('/', (_req, res) => res.send('<html><head></head><body></body></html>'));
  return { app, gate };
}

async function login(app: express.Express, password = 'geheim') {
  return request(app).post('/api/site-gate').send({ password });
}

const cookieOf = (res: request.Response) => (res.get('set-cookie') ?? [])[0]?.split(';')[0] ?? '';

describe('siteGate', () => {
  it('sperrt die API ohne Anmeldung, lässt Health und die Anmeldung offen', async () => {
    const { app } = makeApp();
    const locked = await request(app).get('/api/lookup?domain=example.com');
    expect(locked.status).toBe(401);
    expect(locked.body.error).toBe('site_locked');

    expect((await request(app).get('/api/health')).status).toBe(200);
    const status = await request(app).get('/api/site-gate');
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ open: false });
  });

  it('setzt nach dem richtigen Passwort ein Cookie, das die API öffnet', async () => {
    const { app } = makeApp();
    const res = await login(app);
    expect(res.status).toBe(204);
    const setCookie = res.get('set-cookie')?.[0] ?? '';
    expect(setCookie).toMatch(/^diggy_site_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    const cookie = cookieOf(res);
    expect((await request(app).get('/api/lookup').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get('/api/site-gate').set('Cookie', cookie)).body).toEqual({ open: true });
  });

  it('lehnt ein falsches oder fehlendes Passwort ab und setzt kein Cookie', async () => {
    const { app } = makeApp();
    for (const body of [{ password: 'falsch' }, { password: '' }, {}]) {
      const res = await request(app).post('/api/site-gate').send(body);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('site_password_wrong');
      expect(res.get('set-cookie')).toBeUndefined();
    }
  });

  it('nimmt kein selbst gebautes oder verändertes Cookie an', async () => {
    const { app } = makeApp();
    const cookie = cookieOf(await login(app));
    const [name, value] = cookie.split('=');
    const [version, expires, signature] = value.split('.');

    const forged = [
      `${name}=${version}.${Number(expires) + 86_400}.${signature}`,
      `${name}=${version}.${expires}.${signature.slice(0, -2)}xx`,
      `${name}=v1.9999999999.abc`,
      `${name}=`,
    ];
    for (const value of forged) {
      expect((await request(app).get('/api/lookup').set('Cookie', value)).status).toBe(401);
    }
  });

  it('läuft nach 30 Tagen ab', async () => {
    let now = START;
    const { app } = makeApp(() => now);
    const cookie = cookieOf(await login(app));
    now = START + 29 * 86_400_000;
    expect((await request(app).get('/api/lookup').set('Cookie', cookie)).status).toBe(200);
    now = START + 31 * 86_400_000;
    expect((await request(app).get('/api/lookup').set('Cookie', cookie)).status).toBe(401);
  });

  it('meldet nach einem Passwortwechsel alle ab', async () => {
    const { app } = makeApp();
    const cookie = cookieOf(await login(app));
    const other = createSiteGate({ password: 'neu', secret: SECRET, secureCookie: true, now: () => START });
    const app2 = express();
    app2.use('/api', other.guard);
    app2.get('/api/lookup', (_req, res) => res.json({}));
    expect((await request(app2).get('/api/lookup').set('Cookie', cookie)).status).toBe(401);
  });

  it('kennzeichnet Antworten als nicht zu indexieren und markiert das HTML', async () => {
    const { app, gate } = makeApp();
    expect((await request(app).get('/')).get('x-robots-tag')).toBe('noindex, nofollow');
    expect(gate.markHtml('<html><head><title>x</title></head></html>')).toContain(SITE_GATE_META);
  });
});

describe('siteGateFromEnv', () => {
  it('ist ohne SITE_PASSWORD aus — wie auf diggydns.cloud', () => {
    expect(siteGateFromEnv({ CONTACT_FORM_SECRET: SECRET })).toBeNull();
    expect(siteGateFromEnv({ SITE_PASSWORD: '  ', CONTACT_FORM_SECRET: SECRET })).toBeNull();
  });

  it('verweigert den Start ohne ausreichendes Geheimnis für die Signatur', () => {
    expect(() => siteGateFromEnv({ SITE_PASSWORD: 'geheim' })).toThrow(/CONTACT_FORM_SECRET/);
    expect(() => siteGateFromEnv({ SITE_PASSWORD: 'geheim', CONTACT_FORM_SECRET: 'kurz' })).toThrow();
  });

  it('setzt das Cookie nur in Produktion mit Secure', async () => {
    const gate = siteGateFromEnv({ SITE_PASSWORD: 'geheim', CONTACT_FORM_SECRET: SECRET, NODE_ENV: 'development' })!;
    const app = express();
    app.use(express.json());
    app.post('/api/site-gate', gate.login);
    const res = await login(app);
    expect(res.get('set-cookie')?.[0]).not.toMatch(/Secure/);
  });
});
