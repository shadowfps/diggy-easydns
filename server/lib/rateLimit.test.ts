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

  it('öffnet nach Ablauf des Fensters wieder', () => {
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
