/**
 * Passwortschutz für die Testumgebung (dev.diggydns.cloud).
 *
 * Aktiv nur, wenn `SITE_PASSWORD` gesetzt ist — auf diggydns.cloud fehlt die
 * Variable, und dort ändert sich nichts: keine Abfrage, kein Cookie.
 *
 * Ablauf: Die API ist gesperrt, bis der Browser ein gültiges Sitzungs-Cookie
 * mitschickt. Das Frontend erkennt die gesperrte Seite am Meta-Tag
 * `diggy-site-gate` im index.html und zeigt statt der App eine Anmeldung im
 * Flow-Stil. Die Anmeldung schickt das Passwort an `POST /api/site-gate`, der
 * Server setzt das Cookie, die App startet.
 *
 * Bewusst kein HTTP Basic Auth: dessen Abfrage ist ein Dialog des Browsers,
 * nicht der Seite. Der Preis: Das Frontend selbst (HTML, JS, CSS) ist ohne
 * Anmeldung abrufbar. Das ist hier in Ordnung — der Code ist ohnehin öffentlich
 * auf GitHub, und ohne API zeigt die App nichts. Geschützt ist, was zählt: die
 * Abfragen und damit die Nutzung.
 *
 * Das Cookie trägt kein Geheimnis, nur ein Ablaufdatum und dessen Signatur.
 * Der Schlüssel hängt am Passwort: ein neues Passwort meldet alle ab.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'diggy_site_session';
const SESSION_DAYS = 30;
const TOKEN_VERSION = 'v1';

/** Meta-Tag, an dem das Frontend die gesperrte Seite erkennt (SiteGate.tsx). */
export const SITE_GATE_META = '<meta name="diggy-site-gate" content="on" />';

/** Routen, die auch ohne Anmeldung erreichbar sein müssen. */
const OPEN_API_PATHS = new Set(['/api/health', '/api/site-gate']);

export interface SiteGateOptions {
  password: string;
  /**
   * Zusätzliches Geheimnis für die Signatur — ohne es ließe sich aus einem
   * Cookie das Passwort offline durchprobieren. In Produktion ist
   * CONTACT_FORM_SECRET Pflicht und mindestens 32 Zeichen lang.
   */
  secret: string;
  /** Secure-Flag am Cookie; aus nur in der lokalen Entwicklung ohne TLS. */
  secureCookie: boolean;
  now?: () => number;
}

export interface SiteGate {
  /** Fügt den Meta-Tag ins index.html ein. */
  markHtml(html: string): string;
  /** Kennzeichnet jede Antwort als nicht zu indexieren. */
  noIndex(req: Request, res: Response, next: NextFunction): void;
  /** Sperrt die API für Anfragen ohne gültige Sitzung. */
  guard(req: Request, res: Response, next: NextFunction): void;
  /** `GET /api/site-gate`: ist der Browser angemeldet? */
  status(req: Request, res: Response): void;
  /** `POST /api/site-gate`: prüft das Passwort und setzt die Sitzung. */
  login(req: Request, res: Response): void;
}

export function createSiteGate(options: SiteGateOptions): SiteGate {
  const now = options.now ?? Date.now;
  const key = createHash('sha256')
    .update(`diggy-site-gate\0${options.password}\0${options.secret}`)
    .digest();
  const passwordDigest = sha256(options.password);

  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');

  const issueToken = (): string => {
    const expires = Math.floor(now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
    const payload = `${TOKEN_VERSION}.${expires}`;
    return `${payload}.${sign(payload)}`;
  };

  const isValidToken = (token: string | undefined): boolean => {
    if (!token) return false;
    const [version, expires, signature] = token.split('.');
    if (version !== TOKEN_VERSION || !expires || !signature) return false;
    if (!/^\d+$/.test(expires) || Number(expires) * 1000 <= now()) return false;
    return safeEqual(Buffer.from(signature), Buffer.from(sign(`${version}.${expires}`)));
  };

  const isOpen = (req: Request) => isValidToken(readCookie(req, COOKIE_NAME));

  return {
    markHtml(html) {
      return html.includes('</head>') ? html.replace('</head>', `    ${SITE_GATE_META}\n  </head>`) : html;
    },

    noIndex(_req, res, next) {
      res.set('X-Robots-Tag', 'noindex, nofollow');
      next();
    },

    guard(req, res, next) {
      if (OPEN_API_PATHS.has(req.originalUrl.split('?')[0]) || isOpen(req)) return next();
      res.status(401).json({
        error: 'site_locked',
        message: 'Diese Testversion von diggy ist passwortgeschützt. Bitte erst anmelden.',
      });
    },

    status(req, res) {
      res.set('Cache-Control', 'no-store');
      res.json({ open: isOpen(req) });
    },

    login(req, res) {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      // Über den Hash vergleichen: gleiche Länge, und die Laufzeit verrät nichts.
      if (!password || !safeEqual(sha256(password), passwordDigest)) {
        res.status(401).json({ error: 'site_password_wrong', message: 'Das Passwort stimmt nicht.' });
        return;
      }
      res.set('Cache-Control', 'no-store');
      res.cookie(COOKIE_NAME, issueToken(), {
        httpOnly: true,
        secure: options.secureCookie,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      });
      res.status(204).end();
    },
  };
}

/**
 * Liest die Konfiguration aus der Umgebung. Ohne `SITE_PASSWORD` gibt es
 * keine Sperre. Ist es gesetzt, aber kein Geheimnis für die Signatur da, startet
 * der Server nicht — eine Sperre mit erratbarem Schlüssel wäre keine.
 */
export function siteGateFromEnv(env: NodeJS.ProcessEnv = process.env): SiteGate | null {
  const password = env.SITE_PASSWORD?.trim();
  if (!password) return null;
  const secret = env.CONTACT_FORM_SECRET ?? '';
  if (secret.length < 32) {
    throw new Error(
      'SITE_PASSWORD ist gesetzt, aber CONTACT_FORM_SECRET fehlt oder ist kürzer als 32 Zeichen — ' +
        'damit wäre das Sitzungs-Cookie fälschbar.'
    );
  }
  return createSiteGate({ password, secret, secureCookie: env.NODE_ENV === 'production' });
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ein Cookie aus dem Header — ohne cookie-parser, es gibt nur dieses eine. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}
