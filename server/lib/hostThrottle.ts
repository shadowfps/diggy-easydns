/**
 * Drosselung je Registry-Host (#105): WHOIS-Server auf Port 43 und
 * RDAP-Dienste mit dokumentiertem Limit (Identity Digital: 10 Abfragen pro
 * Sekunde je IP für WHOIS, laut WHOIS-FAQ).
 *
 * Alle Anfragen von diggydns.cloud kommen von einer IP. Der 60-s-Cache
 * fängt Wiederholungen derselben Domain ab, viele verschiedene Domains aber
 * nicht. Deshalb je Host:
 *
 *  - höchstens `maxConcurrent` gleichzeitige Abfragen,
 *  - ein Token-Bucket: `ratePerSecond` neue Abfragen pro Sekunde, `burst` auf
 *    einmal,
 *  - eine kurze Warteschlange (höchstens `maxQueue`, je Platz höchstens
 *    `maxWaitMs`). Ist sie voll oder läuft die Wartezeit ab, wirft es sofort
 *    einen ThrottleError — der Aufrufer meldet „nicht verfügbar“ bzw.
 *    „unklar“, nie „frei“.
 *  - Gleichzeitige Abfragen derselben Domain beim selben Host teilen sich
 *    eine (`key`). Das Ergebnis wird nicht aufbewahrt: Wiederholungen danach
 *    deckt der Lookup-Cache ab.
 *
 * Wer wartet, belegt nur einen Eintrag in der Warteschlange; bei Timeout
 * oder Abbruch wird er sofort entfernt, ein Timer bleibt nicht hängen.
 */

export interface ThrottleOptions {
  maxConcurrent: number;
  ratePerSecond: number;
  burst: number;
  maxQueue: number;
  maxWaitMs: number;
}

/** 2 gleichzeitig, 3/s, Spitze 3 — deutlich unter den 10/s von Identity Digital. */
export const DEFAULT_THROTTLE: ThrottleOptions = {
  maxConcurrent: 2,
  ratePerSecond: 3,
  burst: 3,
  maxQueue: 6,
  maxWaitMs: 2_000,
};

/** So viel Zeit bleibt der Abfrage nach dem Warten mindestens. */
const MIN_QUERY_MS = 1_000;

export class ThrottleError extends Error {
  constructor(message: string) {
    super(`Drosselung: ${message}`);
    this.name = 'ThrottleError';
  }
}

interface Waiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}

export class HostThrottle {
  private active = 0;
  private tokens: number;
  private refilledAt = Date.now();
  private readonly waiting: Waiter[] = [];
  private wake: ReturnType<typeof setTimeout> | undefined;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly options: ThrottleOptions = DEFAULT_THROTTLE) {
    this.tokens = options.burst;
  }

  /** Laufende plus wartende Abfragen — für Tests und Logs. */
  get load(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  /**
   * Führt `task` aus, sobald Platz ist. `task` bekommt die Zeit, die von
   * `timeoutMs` nach dem Warten übrig ist. Gleichzeitige Aufrufe mit
   * demselben `key` teilen sich einen Lauf.
   */
  run<T>(key: string, timeoutMs: number, task: (remainingMs: number) => Promise<T>): Promise<T> {
    const shared = this.inflight.get(key);
    if (shared) return shared as Promise<T>;

    const started = Date.now();
    // Ohne Warten bekommt die Abfrage die volle Zeit, sonst den Rest.
    const immediate = this.tryTake();
    const slot = immediate
      ? Promise.resolve({ release: immediate, remainingMs: timeoutMs })
      : this.acquire({ maxWaitMs: Math.min(this.options.maxWaitMs, timeoutMs - MIN_QUERY_MS) }).then((release) => ({
          release,
          remainingMs: timeoutMs - (Date.now() - started),
        }));
    const run = slot.then(async ({ release, remainingMs }) => {
      try {
        return await task(remainingMs);
      } finally {
        release();
      }
    });
    this.inflight.set(key, run);
    const forget = () => {
      if (this.inflight.get(key) === run) this.inflight.delete(key);
    };
    // then statt finally: eine Ablehnung soll hier nicht noch einmal als
    // unbehandelt auftauchen, die Aufrufer bekommen sie über `run`.
    run.then(forget, forget);
    return run;
  }

  /**
   * Ein Platz, sobald einer frei ist und ein Token da. Liefert die Funktion,
   * die ihn wieder freigibt.
   */
  acquire({ maxWaitMs = this.options.maxWaitMs, signal }: { maxWaitMs?: number; signal?: AbortSignal } = {}): Promise<
    () => void
  > {
    if (signal?.aborted) return Promise.reject(new ThrottleError('abgebrochen'));
    const immediate = this.tryTake();
    if (immediate) return Promise.resolve(immediate);
    if (this.waiting.length >= this.options.maxQueue || maxWaitMs <= 0) {
      return Promise.reject(new ThrottleError('Warteschlange voll'));
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        },
      };
      const leave = (error: ThrottleError) => {
        const index = this.waiting.indexOf(waiter);
        if (index === -1) return;
        this.waiting.splice(index, 1);
        waiter.cleanup();
        reject(error);
        this.schedule();
      };
      const timer = setTimeout(() => leave(new ThrottleError('Wartezeit überschritten')), maxWaitMs);
      const onAbort = () => leave(new ThrottleError('abgebrochen'));
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(waiter);
      this.schedule();
    });
  }

  /** Ein Platz ohne Warten — nur, wenn niemand vorher dran ist. */
  private tryTake(): (() => void) | undefined {
    this.refill();
    if (this.waiting.length === 0 && this.active < this.options.maxConcurrent && this.tokens >= 1) {
      return this.take();
    }
    return undefined;
  }

  private take(): () => void {
    this.tokens -= 1;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.schedule();
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.refilledAt);
    this.tokens = Math.min(this.options.burst, this.tokens + (elapsed * this.options.ratePerSecond) / 1000);
    this.refilledAt = now;
  }

  /** Gibt Wartenden ihren Platz und weckt sich, wenn das nächste Token fällig ist. */
  private schedule(): void {
    if (this.wake) {
      clearTimeout(this.wake);
      this.wake = undefined;
    }
    this.refill();
    while (this.waiting.length > 0 && this.active < this.options.maxConcurrent && this.tokens >= 1) {
      const waiter = this.waiting.shift()!;
      waiter.cleanup();
      waiter.resolve(this.take());
    }
    // Nur auf ein Token warten — ein freier Platz meldet sich über release().
    if (this.waiting.length > 0 && this.active < this.options.maxConcurrent) {
      const dueMs = Math.ceil(((1 - this.tokens) * 1000) / this.options.ratePerSecond);
      this.wake = setTimeout(() => {
        this.wake = undefined;
        this.schedule();
      }, Math.max(1, dueMs));
    }
  }
}

const throttles = new Map<string, HostThrottle>();

/**
 * Die Drosselung für `host`. Hosts kommen nur aus den festen Listen in
 * services/registry.ts, die Map bleibt also klein.
 */
export function throttleFor(host: string): HostThrottle {
  let throttle = throttles.get(host);
  if (!throttle) throttles.set(host, (throttle = new HostThrottle()));
  return throttle;
}

/** Für Tests: alle Hosts wieder mit vollem Bucket und ohne Wartende. */
export function resetHostThrottles(): void {
  throttles.clear();
}
