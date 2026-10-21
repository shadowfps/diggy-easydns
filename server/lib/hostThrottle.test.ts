import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THROTTLE, HostThrottle, ThrottleError, throttleFor, resetHostThrottles } from './hostThrottle.js';

beforeEach(() => {
  vi.useFakeTimers();
  resetHostThrottles();
});

afterEach(() => {
  // Kein Wartender und kein Weck-Timer bleibt übrig.
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

/** Eine Abfrage, die erst endet, wenn der Test sie freigibt. */
function deferred<T = string>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('HostThrottle – Voreinstellung', () => {
  it('2 gleichzeitig, 3 pro Sekunde, Spitze 3, kurze Warteschlange', () => {
    expect(DEFAULT_THROTTLE).toEqual({ maxConcurrent: 2, ratePerSecond: 3, burst: 3, maxQueue: 6, maxWaitMs: 2_000 });
  });

  it('eine Drosselung je Host', () => {
    expect(throttleFor('whois.eu')).toBe(throttleFor('whois.eu'));
    expect(throttleFor('whois.eu')).not.toBe(throttleFor('whois.nic.io'));
  });
});

describe('HostThrottle – Parallelität', () => {
  it('lässt höchstens zwei Abfragen gleichzeitig laufen', async () => {
    const throttle = new HostThrottle();
    const queries = Array.from({ length: 4 }, () => deferred());
    let running = 0;
    let peak = 0;
    const results = queries.map((q, i) =>
      throttle.run(`d${i}.eu`, 10_000, async () => {
        running += 1;
        peak = Math.max(peak, running);
        try {
          return await q.promise;
        } finally {
          running -= 1;
        }
      })
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(throttle.load).toEqual({ active: 2, waiting: 2 });

    queries[0].resolve('a');
    await vi.advanceTimersByTimeAsync(0);
    // Der dritte startet erst, wenn ein Platz frei ist — Tokens wären da.
    expect(throttle.load).toEqual({ active: 2, waiting: 1 });

    queries[1].resolve('b');
    queries[2].resolve('c');
    // Der vierte braucht ein viertes Token: frühestens nach 1/3 s.
    await vi.advanceTimersByTimeAsync(400);
    queries[3].resolve('d');
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c', 'd']);
    expect(peak).toBe(2);
    expect(throttle.load).toEqual({ active: 0, waiting: 0 });
  });

  it('gibt den Platz auch frei, wenn die Abfrage scheitert', async () => {
    const throttle = new HostThrottle({ ...DEFAULT_THROTTLE, maxConcurrent: 1 });
    await expect(throttle.run('a.eu', 10_000, async () => Promise.reject(new Error('Timeout')))).rejects.toThrow('Timeout');
    expect(await throttle.run('b.eu', 10_000, async () => 'ok')).toBe('ok');
    expect(throttle.load).toEqual({ active: 0, waiting: 0 });
  });
});

describe('HostThrottle – Rate', () => {
  it('erlaubt 3 sofort, danach 3 pro Sekunde', async () => {
    const throttle = new HostThrottle({ ...DEFAULT_THROTTLE, maxConcurrent: 10, maxQueue: 10, maxWaitMs: 5_000 });
    const started: number[] = [];
    const t0 = Date.now();
    const runs = Array.from({ length: 6 }, (_, i) =>
      throttle.run(`d${i}.io`, 10_000, async () => {
        started.push(Date.now() - t0);
      })
    );
    await vi.advanceTimersByTimeAsync(1_100);
    await Promise.all(runs);
    // Spitze 3 bei 0 ms, dann je ein Token alle 333 ms (aufgerundet).
    expect(started).toEqual([0, 0, 0, 334, 667, 1_001]);
    // In jeder Sekunde höchstens Spitze plus Rate.
    expect(started.filter((ms) => ms < 1_000)).toHaveLength(5);
  });

  it('übergibt der Abfrage die Zeit, die nach dem Warten übrig ist', async () => {
    const throttle = new HostThrottle({ ...DEFAULT_THROTTLE, maxConcurrent: 10 });
    const remaining: number[] = [];
    const runs = Array.from({ length: 4 }, (_, i) =>
      throttle.run(`d${i}.io`, 5_000, async (ms) => {
        remaining.push(ms);
      })
    );
    await vi.advanceTimersByTimeAsync(400);
    await Promise.all(runs);
    expect(remaining).toEqual([5_000, 5_000, 5_000, 4_666]);
  });
});

describe('HostThrottle – Überlauf', () => {
  it('wirft sofort, wenn die Warteschlange voll ist', async () => {
    const throttle = new HostThrottle();
    const hold = deferred();
    const task = () => hold.promise;
    // 2 laufen, 6 warten.
    const accepted = Array.from({ length: 8 }, (_, i) => throttle.run(`d${i}.eu`, 10_000, task));
    await vi.advanceTimersByTimeAsync(0);
    expect(throttle.load).toEqual({ active: 2, waiting: 6 });

    const started = Date.now();
    await expect(throttle.run('d8.eu', 10_000, task)).rejects.toThrow(new ThrottleError('Warteschlange voll'));
    expect(Date.now() - started).toBe(0);

    hold.resolve('x');
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(Promise.all(accepted)).resolves.toHaveLength(8);
  });

  it('gibt Wartende nach maxWaitMs auf und räumt ihren Platz', async () => {
    const throttle = new HostThrottle();
    const hold = deferred();
    const running = [throttle.run('a.eu', 10_000, () => hold.promise), throttle.run('b.eu', 10_000, () => hold.promise)];
    const waiting = throttle.run('c.eu', 10_000, () => hold.promise);
    const outcome = expect(waiting).rejects.toThrow('Drosselung: Wartezeit überschritten');

    await vi.advanceTimersByTimeAsync(1_999);
    expect(throttle.load).toEqual({ active: 2, waiting: 1 });
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
    expect(throttle.load).toEqual({ active: 2, waiting: 0 });

    hold.resolve('x');
    await Promise.all(running);
    expect(throttle.load).toEqual({ active: 0, waiting: 0 });
  });

  it('wartet nie länger, als der Abfrage danach noch eine Sekunde bleibt', async () => {
    const throttle = new HostThrottle();
    const hold = deferred();
    const running = [throttle.run('a.eu', 5_000, () => hold.promise), throttle.run('b.eu', 5_000, () => hold.promise)];
    // 1,5 s Timeout: höchstens 0,5 s warten.
    const outcome = expect(throttle.run('c.eu', 1_500, () => hold.promise)).rejects.toThrow('Wartezeit überschritten');
    await vi.advanceTimersByTimeAsync(500);
    await outcome;
    // Unter einer Sekunde Timeout wird gar nicht gewartet.
    await expect(throttle.run('d.eu', 900, () => hold.promise)).rejects.toThrow('Warteschlange voll');
    hold.resolve('x');
    await Promise.all(running);
  });

  it('entfernt Wartende bei Abbruch', async () => {
    const throttle = new HostThrottle({ ...DEFAULT_THROTTLE, maxConcurrent: 1 });
    const release = await throttle.acquire();
    const ctrl = new AbortController();
    const waiting = throttle.acquire({ signal: ctrl.signal });
    expect(throttle.load).toEqual({ active: 1, waiting: 1 });

    ctrl.abort();
    await expect(waiting).rejects.toThrow('Drosselung: abgebrochen');
    expect(throttle.load).toEqual({ active: 1, waiting: 0 });
    release();
    // Ein schon abgebrochenes Signal stellt sich gar nicht erst an.
    await expect(throttle.acquire({ signal: ctrl.signal })).rejects.toThrow('abgebrochen');
    expect(throttle.load).toEqual({ active: 0, waiting: 0 });
  });

  it('gibt einen Platz nur einmal frei', async () => {
    const throttle = new HostThrottle({ ...DEFAULT_THROTTLE, maxConcurrent: 1 });
    const release = await throttle.acquire();
    release();
    release();
    expect(throttle.load).toEqual({ active: 0, waiting: 0 });
  });
});

describe('HostThrottle – gleiche Abfragen', () => {
  it('fasst gleichzeitige Abfragen derselben Domain zusammen', async () => {
    const throttle = new HostThrottle();
    const task = vi.fn(async () => 'antwort');
    const [a, b] = await Promise.all([throttle.run('github.io', 5_000, task), throttle.run('github.io', 6_000, task)]);
    expect([a, b]).toEqual(['antwort', 'antwort']);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('teilt auch den Fehler, ohne unbehandelte Ablehnung', async () => {
    const throttle = new HostThrottle();
    const task = vi.fn(async () => {
      throw new Error('abgelehnt');
    });
    const results = await Promise.allSettled([throttle.run('x.eu', 5_000, task), throttle.run('x.eu', 5_000, task)]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('fragt nach dem Ende erneut — aufbewahrt wird nichts', async () => {
    const throttle = new HostThrottle();
    const task = vi.fn(async () => 'antwort');
    await throttle.run('github.io', 5_000, task);
    await throttle.run('github.io', 5_000, task);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
