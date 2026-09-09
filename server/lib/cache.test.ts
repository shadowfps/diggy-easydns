import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, clearCache } from './cache.js';

describe('cached', () => {
  beforeEach(() => clearCache());

  it('liefert beim zweiten Aufruf aus dem Cache', async () => {
    let calls = 0;
    const produce = async () => ++calls;
    expect(await cached('k', 5_000, produce)).toBe(1);
    expect(await cached('k', 5_000, produce)).toBe(1);
    expect(calls).toBe(1);
  });

  /**
   * Der eigentliche Grund für den Umbau: das Frontend lädt sechs Sektionen
   * parallel, und mehrere Nutzer treffen auf einem geteilten Permalink
   * gleichzeitig ein. Ohne Dedup lief derselbe teure Lookup mehrfach.
   */
  it('teilt eine laufende Produktion zwischen parallelen Aufrufen', async () => {
    let calls = 0;
    const produce = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return calls;
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, () => cached('parallel', 5_000, produce))
    );

    expect(calls).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it('cached Fehler NICHT — der nächste Aufruf versucht es erneut', async () => {
    let calls = 0;
    const produce = async () => {
      calls += 1;
      if (calls === 1) throw new Error('erster Versuch scheitert');
      return 'ok';
    };

    await expect(cached('flaky', 5_000, produce)).rejects.toThrow('erster Versuch');
    expect(await cached('flaky', 5_000, produce)).toBe('ok');
  });

  it('gibt den In-Flight-Slot auch nach einem Fehler frei', async () => {
    let calls = 0;
    const produce = async () => {
      calls += 1;
      throw new Error('immer kaputt');
    };

    await expect(cached('broken', 5_000, produce)).rejects.toThrow();
    await expect(cached('broken', 5_000, produce)).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it('respektiert die TTL', async () => {
    // Fake-Timer statt echter Wartezeit: der vorherige Test schlief 60 ms und
    // wäre auf einem langsamen Runner potenziell flaky gewesen.
    vi.useFakeTimers();
    try {
      let calls = 0;
      const produce = async () => ++calls;

      await cached('ttl', 30_000, produce);
      expect(calls).toBe(1);

      // Kurz vor Ablauf: weiterhin aus dem Cache.
      vi.setSystemTime(Date.now() + 29_000);
      await cached('ttl', 30_000, produce);
      expect(calls).toBe(1);

      // Nach Ablauf: neu produziert.
      vi.setSystemTime(Date.now() + 2_000);
      await cached('ttl', 30_000, produce);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hält verschiedene Keys auseinander', async () => {
    expect(await cached('a', 5_000, async () => 'A')).toBe('A');
    expect(await cached('b', 5_000, async () => 'B')).toBe('B');
    expect(await cached('a', 5_000, async () => 'anders')).toBe('A');
  });
});
