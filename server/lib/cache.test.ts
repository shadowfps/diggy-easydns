import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, clearCache, FAILED_TTL_MS } from './cache.js';

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

  /**
   * #101: ein Check, der einen Timeout als „nicht prüfbar“ meldet, wirft
   * nicht. Eine Minute gecacht hieße: wer gleich erneut prüft, bekommt
   * dieselbe Meldung. Gar nicht gecacht: jeder Reload kostet den vollen
   * Timeout. Deshalb nur kurz.
   */
  it('cached einen gemeldeten Ausfall nur FAILED_TTL_MS lang', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const produce = async () => ({ failed: ++calls === 1 });
      const failed = (value: { failed: boolean }) => value.failed;

      expect(await cached('check', 60_000, produce, { failed })).toEqual({ failed: true });
      // Ein Burst direkt danach: aus dem Cache.
      expect(await cached('check', 60_000, produce, { failed })).toEqual({ failed: true });
      expect(calls).toBe(1);

      vi.setSystemTime(Date.now() + FAILED_TTL_MS + 1);
      expect(await cached('check', 60_000, produce, { failed })).toEqual({ failed: false });
      // Ein Erfolg bleibt die volle TTL.
      vi.setSystemTime(Date.now() + 30_000);
      expect(await cached('check', 60_000, produce, { failed })).toEqual({ failed: false });
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  /** #133: Eine Antwort, die selbst früher abläuft, bleibt nicht die volle TTL. */
  it('kürzt die TTL je Wert mit maxTtlMs, verlängert sie aber nie', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const produce = async () => ({ expiresInMs: 20_000, call: ++calls });
      const maxTtlMs = (value: { expiresInMs: number }) => value.expiresInMs;

      await cached('short', 60_000, produce, { maxTtlMs });
      vi.setSystemTime(Date.now() + 19_000);
      expect((await cached('short', 60_000, produce, { maxTtlMs })).call).toBe(1);
      vi.setSystemTime(Date.now() + 2_000);
      expect((await cached('short', 60_000, produce, { maxTtlMs })).call).toBe(2);

      // Länger als ttlMs nie.
      await cached('long', 5_000, async () => ({ expiresInMs: 600_000 }), { maxTtlMs });
      vi.setSystemTime(Date.now() + 6_000);
      let fresh = false;
      await cached('long', 5_000, async () => ((fresh = true), { expiresInMs: 600_000 }), { maxTtlMs });
      expect(fresh).toBe(true);
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
