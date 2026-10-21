/**
 * Ein Schritt aus services/registry.ts als Abfrage — für WHOIS-Report und
 * Verfügbarkeits-Check gleich (#105).
 *
 * Gedrosselt je Host (lib/hostThrottle.ts): jeder WHOIS-Server auf Port 43
 * und die RDAP-Dienste mit `throttled`. Gleichzeitige Abfragen derselben
 * Domain beim selben Host teilen sich dabei eine — etwa der WHOIS-Report für
 * github.io und ein Verfügbarkeits-Check, der github.io mitprüft. Geteilt
 * wird nur, was die Aufrufer brauchen: der Status und das JSON bei RDAP, das
 * Ergebnis des Parsers bei WHOIS. Der WHOIS-Rohtext mit Kontaktblöcken
 * verlässt die Abfrage nicht.
 *
 * Fehler — Timeout, Netz, Sperre, Drosselung — werfen. Die Aufrufer melden
 * sie als „nicht verfügbar“ bzw. „unklar“, nie als „frei“.
 */

import { throttleFor } from '../lib/hostThrottle.js';
import { fetchRdap } from '../lib/rdap.js';
import { queryPort43 } from '../lib/whoisPort43.js';
import type { RegistryStep } from './registry.js';
import type { WhoisTextResult } from './whoisText.js';

export type RdapStep = Extract<RegistryStep, { kind: 'rdap' }>;
export type Port43Step = Extract<RegistryStep, { kind: 'port43' }>;

export interface RdapAnswer {
  status: number;
  /** Die URL, die zuletzt geantwortet hat. */
  url: string;
  redirected: boolean;
  /** Der JSON-Body, nur bei 2xx. */
  data?: unknown;
}

/**
 * RDAP-Abfrage eines Schritts. Ein Abbruch nach `timeoutMs` wirft den
 * AbortError von fetch — warnRdapError meldet ihn als „Timeout“.
 */
export function requestRdap(
  step: RdapStep,
  allowHost: (host: string) => boolean | Promise<boolean>,
  timeoutMs: number
): Promise<RdapAnswer> {
  const run = async (remainingMs: number): Promise<RdapAnswer> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remainingMs);
    try {
      const { response, url, redirected } = await fetchRdap(step.url, { signal: ctrl.signal, allowHost });
      if (!response.ok) {
        // Den Body nicht lesen, aber freigeben — sonst hält undici die Verbindung.
        response.body?.cancel().catch(() => {});
        return { status: response.status, url, redirected };
      }
      return { status: response.status, url, redirected, data: await response.json() };
    } finally {
      clearTimeout(timer);
    }
  };
  return step.throttled ? throttleFor(step.source).run(step.url, timeoutMs, run) : run(timeoutMs);
}

/** WHOIS über Port 43, ausgewertet vom Parser der Registry. Immer gedrosselt. */
export function requestWhois(step: Port43Step, domain: string, timeoutMs: number): Promise<WhoisTextResult> {
  return throttleFor(step.host).run(domain, timeoutMs, async (remainingMs) =>
    step.parse(await queryPort43(step.host, domain, { timeoutMs: remainingMs }), domain)
  );
}
