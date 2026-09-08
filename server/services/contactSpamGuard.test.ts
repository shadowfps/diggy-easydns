import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import {
  assertContactSubmissionAllowed,
  ContactChallengeError,
  ContactRateLimitError,
  ContactSpamSilentError,
  clampContactFields,
  isHoneypotTriggered,
  issueContactChallenge,
  maskEmail,
} from './contactSpamGuard.js';

process.env.CONTACT_FORM_SECRET = 'test-secret-mit-mehr-als-32-zeichen-laenge';

/** Minimales Request-Double — der Guard liest nur socket/headers. */
let ipCounter = 0;
function fakeRequest(ip = `203.0.113.${++ipCounter % 250}`): Request {
  return { socket: { remoteAddress: ip }, headers: {} } as unknown as Request;
}

const validFields = (token: string, overrides: Partial<Record<string, string>> = {}) => ({
  token,
  name: 'Testerin',
  email: 'test@example.com',
  message: 'Eine ausreichend lange Testnachricht.',
  ...overrides,
});

describe('issueContactChallenge / Token-Prüfung', () => {
  beforeEach(() => vi.useRealTimers());

  it('gibt ein signiertes Token mit Mindestwartezeit aus', () => {
    const challenge = issueContactChallenge(fakeRequest());
    expect(challenge.token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(challenge.minDelayMs).toBeGreaterThan(0);
  });

  /**
   * Regression: die Payload bestand nur aus dem Zeitstempel. Zwei Anfragen in
   * derselben Millisekunde ergaben byte-identische Token, und weil die
   * Replay-Erkennung über den Token-Hash läuft, hätte der erste Absender das
   * Token eines gleichzeitigen zweiten Nutzers entwertet — dessen Nachricht
   * wäre als stiller Scheinerfolg verlorengegangen.
   */
  it('erzeugt auch in derselben Millisekunde unterschiedliche Token', () => {
    const tokens = Array.from({ length: 20 }, () => issueContactChallenge(fakeRequest()).token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('lehnt ein zu früh abgesendetes Formular ab', () => {
    const { token } = issueContactChallenge(fakeRequest());
    expect(() => assertContactSubmissionAllowed(fakeRequest(), validFields(token))).toThrow(
      ContactChallengeError
    );
  });

  it('akzeptiert das Token nach Ablauf der Wartezeit', () => {
    const req = fakeRequest();
    const { token, minDelayMs } = issueContactChallenge(req);
    vi.useFakeTimers();
    vi.advanceTimersByTime(minDelayMs + 1_000);
    expect(() => assertContactSubmissionAllowed(fakeRequest(), validFields(token))).not.toThrow();
    vi.useRealTimers();
  });

  it('lehnt ein abgelaufenes Token ab', () => {
    const { token } = issueContactChallenge(fakeRequest());
    vi.useFakeTimers();
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(() => assertContactSubmissionAllowed(fakeRequest(), validFields(token))).toThrow(
      ContactChallengeError
    );
    vi.useRealTimers();
  });

  it('verwirft manipulierte Signaturen still', () => {
    const { token, minDelayMs } = issueContactChallenge(fakeRequest());
    const [payload] = token.split('.');
    vi.useFakeTimers();
    vi.advanceTimersByTime(minDelayMs + 1_000);
    expect(() =>
      assertContactSubmissionAllowed(fakeRequest(), validFields(`${payload}.gefaelscht`))
    ).toThrow(ContactSpamSilentError);
    vi.useRealTimers();
  });

  it('verwirft Müll-Token', () => {
    expect(() => assertContactSubmissionAllowed(fakeRequest(), validFields('kein-punkt'))).toThrow(
      ContactChallengeError
    );
  });

  it('erkennt Replay desselben Tokens', () => {
    const { token, minDelayMs } = issueContactChallenge(fakeRequest());
    vi.useFakeTimers();
    vi.advanceTimersByTime(minDelayMs + 1_000);
    assertContactSubmissionAllowed(fakeRequest(), validFields(token));
    // Zweite Verwendung: anderer Absender/Text, damit es nicht die
    // Duplikat-Erkennung ist, die greift.
    expect(() =>
      assertContactSubmissionAllowed(
        fakeRequest(),
        validFields(token, { email: 'zweite@example.com', message: 'Ganz andere Nachricht hier.' })
      )
    ).toThrow(ContactSpamSilentError);
    vi.useRealTimers();
  });
});

describe('Rate-Limit', () => {
  it('greift pro IP nach der erlaubten Anzahl', () => {
    const ip = '198.51.100.42';
    let blocked = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const { token, minDelayMs } = issueContactChallenge(fakeRequest(ip));
      vi.useFakeTimers();
      vi.advanceTimersByTime(minDelayMs + 1_000);
      try {
        assertContactSubmissionAllowed(
          fakeRequest(ip),
          validFields(token, {
            email: `nutzer${attempt}@example.com`,
            message: `Nachricht Nummer ${attempt} mit genug Länge.`,
          })
        );
      } catch (error) {
        if (error instanceof ContactRateLimitError) {
          blocked = true;
          break;
        }
      } finally {
        vi.useRealTimers();
      }
    }
    expect(blocked).toBe(true);
  });
});

describe('Honeypot und Inhaltsfilter', () => {
  it('erkennt gefüllte Honeypot-Felder', () => {
    expect(isHoneypotTriggered({ website: 'http://spam.example' })).toBe(true);
    expect(isHoneypotTriggered({ company: 'ACME' })).toBe(true);
    expect(isHoneypotTriggered({})).toBe(false);
    expect(isHoneypotTriggered({ website: '   ' })).toBe(false);
  });

  it('verwirft offensichtlichen Spam still', () => {
    const { token, minDelayMs } = issueContactChallenge(fakeRequest('192.0.2.99'));
    vi.useFakeTimers();
    vi.advanceTimersByTime(minDelayMs + 1_000);
    expect(() =>
      assertContactSubmissionAllowed(
        fakeRequest('192.0.2.99'),
        validFields(token, { message: 'Buy viagra now, cheap casino bonus!' })
      )
    ).toThrow(ContactSpamSilentError);
    vi.useRealTimers();
  });
});

describe('clampContactFields', () => {
  it('kürzt überlange Eingaben auf die Obergrenzen', () => {
    const clamped = clampContactFields({
      token: 'x'.repeat(1_000),
      name: 'n'.repeat(500),
      email: 'e'.repeat(500),
      message: 'm'.repeat(10_000),
      website: 'w'.repeat(500),
      company: 'c'.repeat(500),
    });
    expect(clamped.token).toHaveLength(512);
    expect(clamped.name).toHaveLength(120);
    expect(clamped.email).toHaveLength(254);
    expect(clamped.message).toHaveLength(5_000);
    expect(clamped.website).toHaveLength(200);
    expect(clamped.company).toHaveLength(200);
  });
});

describe('maskEmail', () => {
  it('lässt nur den ersten Buchstaben und die Domain stehen', () => {
    expect(maskEmail('maxine@example.com')).toBe('m***@example.com');
  });

  it('gibt bei kaputter Eingabe nichts Verwertbares heraus', () => {
    expect(maskEmail('keine-adresse')).toBe('***');
  });
});
