import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { concurrencyLimit, rateLimit } from './rateLimit.js';

/** Minimales Express-Double: erfasst Status, Body und gesetzte Header. */
function fakeExchange(ip: string) {
  const headers: Record<string, string> = {};
  const state = { status: 200, body: undefined as unknown, nextCalled: false, listeners: {} as Record<string, (() => void)[]> };

  const req = { ip, socket: { remoteAddress: ip }, headers: {} } as unknown as Request;
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
    on(event: string, listener: () => void) {
      (state.listeners[event] ??= []).push(listener);
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    state.nextCalled = true;
  };

  return { req, res, next, state, headers, fire: (event: string) => state.listeners[event]?.forEach((l) => l()) };
}

describe('rateLimit', () => {
  it('lässt genau `max` Requests durch und blockt danach', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3, message: 'zu viele' });
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const ex = fakeExchange('203.0.113.1');
      limiter(ex.req, ex.res, ex.next);
      results.push(ex.state.nextCalled);
    }
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('antwortet mit 429 und Retry-After', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: 'zu viele', code: 'custom_code' });
    const first = fakeExchange('203.0.113.2');
    limiter(first.req, first.res, first.next);

    const blocked = fakeExchange('203.0.113.2');
    limiter(blocked.req, blocked.res, blocked.next);

    expect(blocked.state.status).toBe(429);
    expect(blocked.state.body).toMatchObject({ error: 'custom_code', message: 'zu viele' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('setzt RateLimit-Header mit sinkendem Rest', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3, message: 'x' });
    const remaining: string[] = [];
    for (let i = 0; i < 3; i++) {
      const ex = fakeExchange('203.0.113.3');
      limiter(ex.req, ex.res, ex.next);
      remaining.push(ex.headers['ratelimit-remaining']);
    }
    expect(remaining).toEqual(['2', '1', '0']);
  });

  it('zählt pro IP getrennt', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: 'x' });
    const a = fakeExchange('203.0.113.4');
    const b = fakeExchange('203.0.113.5');
    limiter(a.req, a.res, a.next);
    limiter(b.req, b.res, b.next);
    expect(a.state.nextCalled).toBe(true);
    expect(b.state.nextCalled).toBe(true);
  });

  it('füllt sich nach Ablauf des Zeitraums wieder auf', () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ windowMs: 1_000, max: 1, message: 'x' });

    const first = fakeExchange('203.0.113.6');
    limiter(first.req, first.res, first.next);
    const blocked = fakeExchange('203.0.113.6');
    limiter(blocked.req, blocked.res, blocked.next);
    expect(blocked.state.nextCalled).toBe(false);

    vi.advanceTimersByTime(1_500);
    const after = fakeExchange('203.0.113.6');
    limiter(after.req, after.res, after.next);
    expect(after.state.nextCalled).toBe(true);
    vi.useRealTimers();
  });

  /**
   * Der Grund für den Token Bucket. Ein festes Fenster ließ am Rand das
   * Doppelte durch: `max` Requests kurz vor dem Reset, `max` direkt danach.
   */
  it('lässt am Zeitraum-Rand NICHT das Doppelte durch', () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ windowMs: 60_000, max: 10, message: 'x' });
    const ip = '203.0.113.20';

    const send = () => {
      const ex = fakeExchange(ip);
      limiter(ex.req, ex.res, ex.next);
      return ex.state.nextCalled;
    };

    // Budget aufbrauchen.
    let passed = 0;
    for (let i = 0; i < 10; i++) if (send()) passed++;
    expect(passed).toBe(10);
    expect(send()).toBe(false);

    // Kurz vor dem Ende des Zeitraums: es darf nur nachgefüllt sein, was in
    // der Zwischenzeit tatsächlich entstanden ist — nicht das volle Budget.
    vi.advanceTimersByTime(59_000);
    let burst = 0;
    for (let i = 0; i < 20; i++) if (send()) burst++;
    expect(burst).toBeLessThanOrEqual(10);
    // Bei 59 s von 60 s sind ~9,8 Tokens nachgewachsen.
    expect(burst).toBeGreaterThanOrEqual(9);

    vi.useRealTimers();
  });

  it('füllt kontinuierlich auf, nicht sprunghaft', () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ windowMs: 10_000, max: 10, message: 'x' });
    const ip = '203.0.113.21';
    const send = () => {
      const ex = fakeExchange(ip);
      limiter(ex.req, ex.res, ex.next);
      return ex.state.nextCalled;
    };

    for (let i = 0; i < 10; i++) send();
    expect(send()).toBe(false);

    // 1 s = 1 Token bei 10 Tokens pro 10 s.
    vi.advanceTimersByTime(1_000);
    expect(send()).toBe(true);
    expect(send()).toBe(false);

    vi.useRealTimers();
  });

  /**
   * Der letzte erlaubte Request lässt den Bucket unter 1 Token zurück — der
   * nächste wird blockiert. Vorher stand hier `RateLimit-Reset: 0` neben
   * `RateLimit-Remaining: 0`, also "sofort wieder frei" bei anstehender Sperre.
   */
  it('meldet RateLimit-Reset > 0, wenn der letzte Token verbraucht ist', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2, message: 'x' });
    const ip = '203.0.113.23';

    const first = fakeExchange(ip);
    limiter(first.req, first.res, first.next);
    expect(first.headers['ratelimit-remaining']).toBe('1');
    expect(first.headers['ratelimit-reset']).toBe('0');

    const last = fakeExchange(ip);
    limiter(last.req, last.res, last.next);
    expect(last.state.nextCalled).toBe(true);
    expect(last.headers['ratelimit-remaining']).toBe('0');
    expect(Number(last.headers['ratelimit-reset'])).toBeGreaterThan(0);
  });

  /**
   * `Date.now()` ist nicht monoton. Wird die Uhr zurückgestellt, war der
   * Refill-Term negativ und zog dem Bucket Tokens ab — ein Client konnte durch
   * eine NTP-Korrektur auf dem Server gesperrt werden.
   */
  it('verliert bei rückwärts gestellter Uhr keine Tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
    const limiter = rateLimit({ windowMs: 60_000, max: 3, message: 'x' });
    const ip = '203.0.113.24';
    const send = () => {
      const ex = fakeExchange(ip);
      limiter(ex.req, ex.res, ex.next);
      return ex;
    };

    send();

    // Uhr um eine Stunde zurück.
    vi.setSystemTime(new Date('2026-09-10T11:00:00Z'));
    const after = send();
    expect(after.state.nextCalled).toBe(true);
    expect(after.headers['ratelimit-remaining']).toBe('1');

    expect(send().state.nextCalled).toBe(true);
    expect(send().state.nextCalled).toBe(false);
    vi.useRealTimers();
  });

  /**
   * Hält die tatsächliche Zusicherung fest, damit sie nicht wieder
   * überschätzt wird: der Bucket startet VOLL, `max` Requests sind also sofort
   * möglich und über die folgende Fensterlänge wachsen weitere `max` nach.
   * Über eine Fensterlänge gemessen ist das knapp das Doppelte — verteilt,
   * nicht gebündelt. Das feste Fenster ließ dieselbe Menge in Sekunden durch,
   * genau das ist der Unterschied (#40).
   */
  it('erlaubt über eine Fensterlänge knapp das Doppelte — verteilt, nicht gebündelt', () => {
    vi.useFakeTimers();
    const limiter = rateLimit({ windowMs: 60_000, max: 10, message: 'x' });
    const ip = '203.0.113.25';
    const send = () => {
      const ex = fakeExchange(ip);
      limiter(ex.req, ex.res, ex.next);
      return ex.state.nextCalled;
    };

    // Aus dem Leerlauf: voller Burst sofort.
    let passed = 0;
    for (let i = 0; i < 20; i++) if (send()) passed++;
    expect(passed).toBe(10);

    // Unmittelbar nach dem Burst ist Schluss: ein Token braucht 6 s bei 10 pro
    // Minute. Das ist der Unterschied zum festen Fenster, das hier weitere 10
    // sofort durchgelassen hätte.
    vi.advanceTimersByTime(1_000);
    expect(send()).toBe(false);

    // Danach im Sekundentakt über die restliche Fensterlänge weiter.
    let trickled = 0;
    for (let second = 1; second < 60; second++) {
      vi.advanceTimersByTime(1_000);
      if (send()) trickled++;
    }

    // Keine exakte Zahl: die Token-Arithmetik ist gebrochen, ob der Token bei
    // 6,000 s oder 6,001 s kippt, ist Rundung. Die Zusicherung ist der Rahmen.
    expect(trickled).toBeGreaterThanOrEqual(9);
    expect(passed + trickled).toBeLessThanOrEqual(2 * 10);
    expect(passed + trickled).toBeGreaterThan(10);
    vi.useRealTimers();
  });

  it('meldet Retry-After mindestens 1 Sekunde', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1, message: 'x' });
    const first = fakeExchange('203.0.113.22');
    limiter(first.req, first.res, first.next);
    const blocked = fakeExchange('203.0.113.22');
    limiter(blocked.req, blocked.res, blocked.next);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('hält getrennte Limiter-Instanzen unabhängig', () => {
    const a = rateLimit({ windowMs: 60_000, max: 1, message: 'a' });
    const b = rateLimit({ windowMs: 60_000, max: 1, message: 'b' });
    const first = fakeExchange('203.0.113.7');
    a(first.req, first.res, first.next);

    const second = fakeExchange('203.0.113.7');
    b(second.req, second.res, second.next);
    expect(second.state.nextCalled).toBe(true);
  });
});

describe('concurrencyLimit', () => {
  it('lässt nur `max` gleichzeitig durch', () => {
    const limiter = concurrencyLimit(2, 'busy');
    const open = [fakeExchange('a'), fakeExchange('b'), fakeExchange('c')];
    for (const ex of open) limiter(ex.req, ex.res, ex.next);

    expect(open.map((ex) => ex.state.nextCalled)).toEqual([true, true, false]);
    expect(open[2].state.status).toBe(503);
  });

  /** Ohne Freigabe bei 'close' würde ein abgebrochener Request den Slot halten. */
  it('gibt den Slot bei finish und bei close frei', () => {
    for (const event of ['finish', 'close']) {
      const limiter = concurrencyLimit(1, 'busy');
      const first = fakeExchange('a');
      limiter(first.req, first.res, first.next);
      first.fire(event);

      const second = fakeExchange('b');
      limiter(second.req, second.res, second.next);
      expect(second.state.nextCalled, event).toBe(true);
    }
  });

  it('zählt einen Slot nicht doppelt frei, wenn finish und close feuern', () => {
    const limiter = concurrencyLimit(1, 'busy');
    const first = fakeExchange('a');
    limiter(first.req, first.res, first.next);
    first.fire('finish');
    first.fire('close');

    const second = fakeExchange('b');
    limiter(second.req, second.res, second.next);
    expect(second.state.nextCalled).toBe(true);

    // Der zweite Slot ist jetzt belegt — ein dritter muss abgewiesen werden.
    const third = fakeExchange('c');
    limiter(third.req, third.res, third.next);
    expect(third.state.nextCalled).toBe(false);
  });
});
