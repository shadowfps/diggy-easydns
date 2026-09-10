/**
 * IP-basiertes Rate-Limiting und Concurrency-Begrenzung für die öffentliche API.
 *
 * Hintergrund: die Lookup-Endpoints lösen pro Request teure Fremdarbeit aus —
 * bis zu 22 DNS-Queries (Mail-Audit), 10 DoH-Queries (Propagation), TLS-
 * Handshakes, RDAP-Calls und vor allem PageSpeed/VirusTotal, die auf
 * kontingentierte API-Keys gehen. Ohne Limit kann jeder die Keys leerlaufen
 * lassen oder den Prozess mit lang laufenden Requests belegen.
 *
 * Umsetzung als **Token Bucket** mit kontinuierlicher Auffüllung. Ein festes
 * Fenster ließ am Rand das Doppelte des Limits in SEKUNDEN durch: 120 Requests
 * in den letzten Sekunden des alten Fensters, 120 in den ersten des neuen. Der
 * Bucket kennt keinen Reset, er füllt gleichmäßig mit `max / windowMs` nach.
 *
 * Was er bewusst NICHT ist: ein harter Deckel von `max` pro `windowMs`. Der
 * Bucket startet voll — nach Leerlauf sind also `max` Requests sofort möglich
 * plus die über das Fenster nachwachsenden, über eine Fensterlänge gemessen
 * knapp das Doppelte. Der Unterschied zum festen Fenster ist die Verteilung,
 * nicht die Summe: verteilt über das Fenster statt gebündelt in Sekunden.
 *
 * Diese Grenze ist die in #40 abgewogene: bei den Kontingent-Endpoints (10/h)
 * sind das rund 20 Calls pro Stunde, was PSI und VirusTotal verkraften — beide
 * haben zusätzlich einen Concurrency-Deckel von 4. Ein harter Deckel bräuchte
 * eine Zeitstempel-Liste pro IP (Sliding Window) und damit ein Vielfaches an
 * Speicher; #40 hat sich bewusst gegen diesen Preis entschieden.
 *
 * Bewusst prozess-lokal (kein Redis): die App läuft als einzelner Container.
 * Bei horizontaler Skalierung müsste der Zähler geteilt werden — dann ist das
 * hier die Stelle, die ersetzt wird.
 */

import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from '../services/contactSpamGuard.js';

/**
 * Ein Token Bucket pro IP.
 *
 * `tokens` ist absichtlich gebrochen: der Bucket füllt sich kontinuierlich
 * auf, nicht in Sprüngen. Genau das unterscheidet ihn vom vorherigen festen
 * Fenster, bei dem sich am Fensterrand das Doppelte des Limits in Sekunden
 * senden ließ.
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitOptions {
  /** Zeitraum, in dem `max` Requests erlaubt sind. */
  windowMs: number;
  /** Erlaubte Requests pro IP und Zeitraum. */
  max: number;
  /** Fehlermeldung für den Client. */
  message: string;
  /** Fehler-Code im JSON-Body. */
  code?: string;
}

/** Obergrenze für die Zähler-Map, damit viele IPs den Speicher nicht sprengen. */
const MAX_TRACKED_IPS = 20_000;

/**
 * Verstrichene Zeit, nie negativ.
 *
 * `Date.now()` ist nicht monoton: eine rückwärts gestellte Systemuhr (größere
 * NTP-Korrektur, manuelles Setzen) machte `now - lastRefill` negativ. Der
 * Refill-Term hätte dem Bucket dann Tokens ABGEZOGEN, ihn unter null gedrückt
 * und daraus eine überhöhte Sperrzeit gemeldet. `performance.now()` wäre
 * monoton, verlangt aber einen zweiten Zeitbezug quer durch das Modul und die
 * Tests; die Untergrenze löst dasselbe Problem an einer Stelle.
 */
function elapsedSince(lastRefill: number, now: number): number {
  return Math.max(0, now - lastRefill);
}

/**
 * Erzeugt eine Express-Middleware mit eigenem, isoliertem Zähler.
 *
 * Jeder Aufruf von `rateLimit()` hat seinen eigenen Bucket-Store — damit
 * verbraucht ein PageSpeed-Request nicht das Budget der normalen Lookups.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  /** Tokens pro Millisekunde. */
  const refillRate = options.max / options.windowMs;

  /**
   * Wirft Buckets weg, die wieder voll sind — die tragen keine Information
   * mehr, ein neuer Eintrag startet ohnehin voll.
   */
  const prune = (now: number) => {
    if (buckets.size <= MAX_TRACKED_IPS) return;

    for (const [ip, bucket] of buckets) {
      const refilled = bucket.tokens + elapsedSince(bucket.lastRefill, now) * refillRate;
      if (refilled >= options.max) buckets.delete(ip);
    }

    // Falls danach noch zu viele: ältesten Eintrag zuerst (Insertion-Order).
    while (buckets.size > MAX_TRACKED_IPS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    prune(now);

    const ip = getClientIp(req);
    const bucket = buckets.get(ip) ?? { tokens: options.max, lastRefill: now };

    // Kontinuierlich auffüllen, gedeckelt auf die Bucket-Größe.
    bucket.tokens = Math.min(
      options.max,
      bucket.tokens + elapsedSince(bucket.lastRefill, now) * refillRate
    );
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;

    // delete vor set: `Map.set` auf einen bestehenden Key ändert die
    // Insertion-Order nicht, ein gerade benutzter Eintrag wäre bei der
    // Notfall-Eviction sonst bevorzugt geworfen worden.
    buckets.delete(ip);
    buckets.set(ip, bucket);

    /**
     * Sekunden, bis wieder ein Token verfügbar ist.
     *
     * Gerechnet gegen den Token-Stand NACH der Subtraktion, nicht gegen
     * `allowed`: der letzte erlaubte Request lässt den Bucket unter 1 zurück,
     * der unmittelbar folgende wird also blockiert. Mit `allowed ? 0 : …`
     * meldete genau dieser Request `RateLimit-Remaining: 0` zusammen mit
     * `RateLimit-Reset: 0` — "sofort wieder frei" bei anstehender Sperre.
     */
    const secondsUntilNextToken =
      bucket.tokens >= 1
        ? 0
        : Math.max(1, Math.ceil((1 - bucket.tokens) / refillRate / 1000));

    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.floor(Math.max(0, bucket.tokens))));
    res.setHeader('RateLimit-Reset', String(secondsUntilNextToken));

    if (!allowed) {
      res.setHeader('Retry-After', String(secondsUntilNextToken));
      res.status(429).json({
        error: options.code ?? 'rate_limited',
        message: options.message,
        retryAfterSeconds: secondsUntilNextToken,
      });
      return;
    }

    next();
  };
}

/**
 * Begrenzt, wie viele Requests einen Endpoint GLEICHZEITIG durchlaufen.
 *
 * Nötig zusätzlich zum Rate-Limit, weil ein PageSpeed-Run bis zu 45 s dauert:
 * wenige gleichzeitige Requests von verschiedenen IPs würden das Rate-Limit
 * nie reißen, aber den Prozess trotzdem mit offenen Verbindungen belegen.
 *
 * Bewusst mit sofortigem 503 statt Warteschlange — wer wartet, hält ebenfalls
 * einen Slot, und der Client kann es einfach erneut versuchen.
 */
export function concurrencyLimit(max: number, message: string) {
  let active = 0;

  return (_req: Request, res: Response, next: NextFunction): void => {
    if (active >= max) {
      res.setHeader('Retry-After', '30');
      res.status(503).json({ error: 'server_busy', message });
      return;
    }

    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active -= 1;
    };

    // 'close' feuert auch, wenn der Client abbricht — ohne das würde ein
    // abgebrochener Request den Slot dauerhaft halten.
    res.on('finish', release);
    res.on('close', release);

    next();
  };
}
