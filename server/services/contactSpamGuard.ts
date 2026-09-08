import crypto from 'node:crypto';
import type { Request } from 'express';

const MIN_SUBMIT_DELAY_MS = 4_000;
const MAX_TOKEN_AGE_MS = 60 * 60 * 1000;
/**
 * Absendeversuche pro IP. Etwas großzügiger als zuvor (3/h): der Guard läuft
 * jetzt erst NACH der Feldvalidierung, ein Tippfehler kostet also keinen
 * Versuch mehr — dafür soll eine echte Nachfrage nicht an der Grenze scheitern.
 * Die Hauptlast des Spam-Schutzes tragen Honeypot, Token und Content-Filter.
 */
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 12;
const MAX_CHALLENGES_PER_HOUR = 30;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
const DEV_FALLBACK_SECRET = 'diggy-contact-dev-only-change-in-production';

export class ContactSpamSilentError extends Error {
  constructor() {
    super('silent_spam');
    this.name = 'ContactSpamSilentError';
  }
}

export class ContactRateLimitError extends Error {
  constructor(message = 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.') {
    super(message);
    this.name = 'ContactRateLimitError';
  }
}

export class ContactChallengeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactChallengeError';
  }
}

interface RateBucket {
  hourCount: number;
  hourStart: number;
  dayCount: number;
  dayStart: number;
}

const rateByIp = new Map<string, RateBucket>();
/**
 * Wie oft eine bestimmte Empfänger-Adresse eine Auto-Reply bekommen darf.
 *
 * Das IP-Limit allein schützt das Opfer nicht: verteilt über viele IPs (oder
 * über die Browser fremder Besucher) könnte dieselbe Adresse beliebig oft
 * angeschrieben werden. Dieser Zähler hängt an der Adresse, nicht am Absender.
 */
const autoReplyByRecipient = new Map<string, number>();
const AUTO_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
const challengeRateByIp = new Map<string, RateBucket>();
const recentHashes = new Map<string, number>();
const usedTokenHashes = new Map<string, number>();

const MIN_SECRET_LENGTH = 32;

/**
 * HMAC-Schlüssel für die Challenge-Token.
 *
 * In Produktion ist CONTACT_FORM_SECRET Pflicht. Vorher gab es eine
 * Fallback-Kette (SMTP_PASS, dann ein hartkodiertes Dev-Secret) mit bloßer
 * console.warn — beides war unhaltbar:
 *
 *  - DEV_FALLBACK_SECRET steht in diesem öffentlichen Repo. Wer es kennt,
 *    kann beliebig viele gültige Token mit beliebigem issuedAt selbst
 *    signieren; Timing-Check und Replay-Schutz sind damit wirkungslos.
 *  - SMTP_PASS als HMAC-Key ist Schlüssel-Wiederverwendung über eine
 *    Vertrauensgrenze: die Signaturen sind über /api/contact/challenge
 *    öffentlich abrufbar und wären damit ein Orakel über das Mail-Passwort.
 */
function getSecret(): string {
  const secret = process.env.CONTACT_FORM_SECRET?.trim();

  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error(
        'CONTACT_FORM_SECRET muss in Produktion gesetzt sein (z. B. `openssl rand -base64 32`).'
      );
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `CONTACT_FORM_SECRET ist zu kurz (${secret.length} Zeichen, mindestens ${MIN_SECRET_LENGTH}).`
      );
    }
    return secret;
  }

  return secret || DEV_FALLBACK_SECRET;
}

/**
 * Prüft die Konfiguration beim Start, statt erst beim ersten Formular-Request
 * zu scheitern. So fällt eine Fehlkonfiguration sofort im Deploy auf.
 */
export function assertContactSecretConfigured(): void {
  getSecret();
}

function trustProxyHeaders(): boolean {
  return process.env.TRUST_PROXY === 'true';
}

function pruneRateLimits(now: number): void {
  if (rateByIp.size <= 500 && challengeRateByIp.size <= 500) return;
  for (const [ip, bucket] of rateByIp) {
    if (now - bucket.dayStart > 86_400_000) rateByIp.delete(ip);
  }
  for (const [ip, bucket] of challengeRateByIp) {
    if (now - bucket.dayStart > 86_400_000) challengeRateByIp.delete(ip);
  }
}

function pruneDuplicateHashes(now: number): void {
  if (recentHashes.size <= 200) return;
  for (const [hash, ts] of recentHashes) {
    if (now - ts > DUPLICATE_WINDOW_MS) recentHashes.delete(hash);
  }
}

function pruneUsedTokens(now: number): void {
  if (usedTokenHashes.size <= 500) return;
  for (const [hash, ts] of usedTokenHashes) {
    if (now - ts > MAX_TOKEN_AGE_MS) usedTokenHashes.delete(hash);
  }
}

export function getClientIp(req: Request): string {
  if (trustProxyHeaders()) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function incrementRateBucket(
  map: Map<string, RateBucket>,
  ip: string,
  maxPerHour: number,
  maxPerDay: number
): void {
  const now = Date.now();
  pruneRateLimits(now);

  let bucket = map.get(ip);
  if (!bucket) {
    bucket = { hourCount: 0, hourStart: now, dayCount: 0, dayStart: now };
    map.set(ip, bucket);
  }

  if (now - bucket.hourStart >= 3_600_000) {
    bucket.hourCount = 0;
    bucket.hourStart = now;
  }
  if (now - bucket.dayStart >= 86_400_000) {
    bucket.dayCount = 0;
    bucket.dayStart = now;
  }

  if (bucket.hourCount >= maxPerHour || bucket.dayCount >= maxPerDay) {
    throw new ContactRateLimitError();
  }

  bucket.hourCount += 1;
  bucket.dayCount += 1;
}

export function assertChallengeRequestAllowed(req: Request): void {
  try {
    incrementRateBucket(challengeRateByIp, getClientIp(req), MAX_CHALLENGES_PER_HOUR, MAX_CHALLENGES_PER_HOUR * 4);
  } catch {
    throw new ContactRateLimitError('Zu viele Formular-Anfragen. Bitte später erneut versuchen.');
  }
}

export function issueContactChallenge(req: Request): { token: string; minDelayMs: number } {
  assertChallengeRequestAllowed(req);

  const issuedAt = Date.now();
  // Nonce ist nötig, nicht Zierde: mit reinem Zeitstempel als Payload sind zwei
  // Token aus derselben Millisekunde byte-identisch. Die Replay-Erkennung
  // arbeitet über den Token-Hash — der erste Absender hätte damit das Token
  // eines gleichzeitigen zweiten Nutzers entwertet, und dessen Absendung wäre
  // als stiller Scheinerfolg verlorengegangen.
  const nonce = crypto.randomBytes(9).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ t: issuedAt, n: nonce }), 'utf8').toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, minDelayMs: MIN_SUBMIT_DELAY_MS };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function assertTokenNotReused(token: string): void {
  const now = Date.now();
  pruneUsedTokens(now);

  const hash = hashToken(token);
  if (usedTokenHashes.has(hash)) {
    throw new ContactSpamSilentError();
  }

  usedTokenHashes.set(hash, now);
}

function verifyChallengeToken(token: string): void {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) {
    throw new ContactChallengeError('Das Formular ist abgelaufen. Bitte Seite neu laden und erneut versuchen.');
  }

  const payload = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new ContactSpamSilentError();
  }

  let issuedAt: number;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      t?: number;
      n?: string;
    };
    if (typeof parsed.t !== 'number') throw new Error('invalid');
    issuedAt = parsed.t;
  } catch {
    throw new ContactSpamSilentError();
  }

  const age = Date.now() - issuedAt;
  if (age < MIN_SUBMIT_DELAY_MS) {
    throw new ContactChallengeError('Bitte nimm dir einen Moment und sende das Formular dann erneut ab.');
  }
  if (age > MAX_TOKEN_AGE_MS) {
    throw new ContactChallengeError('Das Formular ist abgelaufen. Bitte Seite neu laden und erneut versuchen.');
  }

  assertTokenNotReused(trimmed);
}

function assertRateLimit(ip: string): void {
  incrementRateBucket(rateByIp, ip, MAX_PER_HOUR, MAX_PER_DAY);
}

function countUrls(text: string): number {
  const matches = text.match(/https?:\/\/|www\.\S+/gi);
  return matches?.length ?? 0;
}

function looksLikeSpamContent(name: string, email: string, message: string): boolean {
  const combined = `${name}\n${email}\n${message}`.toLowerCase();

  if (countUrls(message) > 4) return true;
  if (/^https?:\/\//i.test(name.trim())) return true;

  const spamPatterns = [
    /\b(viagra|cialis|casino|forex signals|crypto investment|buy followers)\b/i,
    /\b(seo services|link building service|guest post)\b/i,
    /\b(click here now|act now|limited time offer)\b/i,
  ];
  if (spamPatterns.some((pattern) => pattern.test(combined))) return true;

  const linkDensity = countUrls(message) / Math.max(message.split(/\s+/).length, 1);
  if (message.length > 80 && linkDensity > 0.25) return true;

  return false;
}

function assertNotDuplicate(ip: string, email: string, message: string): void {
  const now = Date.now();
  pruneDuplicateHashes(now);

  const hash = crypto
    .createHash('sha256')
    .update(`${ip}|${email.toLowerCase()}|${message.trim().toLowerCase()}`)
    .digest('hex');

  const previous = recentHashes.get(hash);
  if (previous && now - previous < DUPLICATE_WINDOW_MS) {
    throw new ContactSpamSilentError();
  }

  recentHashes.set(hash, now);
}

/**
 * true, wenn an diese Adresse jetzt eine Bestätigung gehen darf.
 *
 * Verbraucht bei Erfolg direkt einen Slot — der Aufrufer muss also nur dann
 * fragen, wenn er tatsächlich senden will.
 */
export function claimAutoReplySlot(email: string): boolean {
  const now = Date.now();
  const key = email.trim().toLowerCase();

  if (autoReplyByRecipient.size > 5_000) {
    for (const [address, sentAt] of autoReplyByRecipient) {
      if (now - sentAt > AUTO_REPLY_WINDOW_MS) autoReplyByRecipient.delete(address);
    }
  }

  const previous = autoReplyByRecipient.get(key);
  if (previous && now - previous < AUTO_REPLY_WINDOW_MS) return false;

  autoReplyByRecipient.set(key, now);
  return true;
}

/** Maskiert eine Adresse fürs Log — `max@example.com` -> `m***@example.com`. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function isHoneypotTriggered(fields: { website?: string; company?: string }): boolean {
  return Boolean(fields.website?.trim() || fields.company?.trim());
}

export interface ContactSpamCheckInput {
  token: string;
  name: string;
  email: string;
  message: string;
  website?: string;
  company?: string;
}

export function assertContactSubmissionAllowed(req: Request, input: ContactSpamCheckInput): void {
  if (isHoneypotTriggered(input)) {
    throw new ContactSpamSilentError();
  }

  verifyChallengeToken(input.token);

  const ip = getClientIp(req);
  assertRateLimit(ip);
  assertNotDuplicate(ip, input.email, input.message);

  if (looksLikeSpamContent(input.name, input.email, input.message)) {
    throw new ContactSpamSilentError();
  }
}

/** Begrenzt rohe Request-Felder vor weiterer Verarbeitung. */
export function clampContactFields(input: ContactSpamCheckInput): ContactSpamCheckInput {
  return {
    token: input.token.slice(0, 512),
    name: input.name.slice(0, 120),
    email: input.email.slice(0, 254),
    message: input.message.slice(0, 5000),
    website: input.website?.slice(0, 200),
    company: input.company?.slice(0, 200),
  };
}
