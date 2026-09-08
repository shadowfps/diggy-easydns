/**
 * IP-basiertes Rate-Limiting und Concurrency-Begrenzung für die öffentliche API.
 *
 * Hintergrund: die Lookup-Endpoints lösen pro Request teure Fremdarbeit aus —
 * bis zu 22 DNS-Queries (Mail-Audit), 10 DoH-Queries (Propagation), TLS-
 * Handshakes, RDAP-Calls und vor allem PageSpeed/VirusTotal, die auf
 * kontingentierte API-Keys gehen. Ohne Limit kann jeder die Keys leerlaufen
 * lassen oder den Prozess mit lang laufenden Requests belegen.
 *
 * Bewusst prozess-lokal (kein Redis): die App läuft als einzelner Container.
 * Bei horizontaler Skalierung müsste der Zähler geteilt werden — dann ist das
 * hier die Stelle, die ersetzt wird.
 */

import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from '../services/contactSpamGuard.js';

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Zeitfenster in ms. */
  windowMs: number;
  /** Erlaubte Requests pro IP und Fenster. */
  max: number;
  /** Fehlermeldung für den Client. */
  message: string;
  /** Fehler-Code im JSON-Body. */
  code?: string;
}

/** Obergrenze für die Zähler-Map, damit viele IPs den Speicher nicht sprengen. */
const MAX_TRACKED_IPS = 20_000;

/**
 * Erzeugt eine Express-Middleware mit eigenem, isoliertem Zähler.
 *
 * Jeder Aufruf von `rateLimit()` hat seinen eigenen Bucket-Store — damit
 * verbraucht ein PageSpeed-Request nicht das Budget der normalen Lookups.
 */
export function rateLimit(options: RateLimitOptions) {
  const windows = new Map<string, Window>();

  const prune = (now: number) => {
    if (windows.size <= MAX_TRACKED_IPS) return;
    for (const [ip, window] of windows) {
      if (window.resetAt <= now) windows.delete(ip);
    }
    // Falls danach noch zu viele: ältestes Fenster zuerst rauswerfen.
    while (windows.size > MAX_TRACKED_IPS) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    prune(now);

    const ip = getClientIp(req);
    let window = windows.get(ip);

    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + options.windowMs };
      windows.set(ip, window);
    }

    window.count += 1;

    const remaining = Math.max(0, options.max - window.count);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((window.resetAt - now) / 1000)));

    if (window.count > options.max) {
      const retryAfter = Math.ceil((window.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: options.code ?? 'rate_limited',
        message: options.message,
        retryAfterSeconds: retryAfter,
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
