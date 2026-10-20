import packageJson from '../../package.json' with { type: 'json' };

// rdap.org blockiert den Node-Standard-User-Agent. Die echte App-Version
// und Kontakt-URL machen unsere Anfragen für die Registry nachvollziehbar.
export const RDAP_HEADERS = {
  'user-agent': `diggy/${packageJson.version} (+https://diggydns.cloud)`,
  accept: 'application/rdap+json',
};

export function warnRdapError(url: string | URL, error: unknown, signal?: AbortSignal): void {
  const timedOut = signal?.aborted ||
    (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name));
  const reason = timedOut ? 'Timeout' : error instanceof Error ? error.message : String(error);
  // Ein fehlender Datensatz und ein gesperrter oder unerreichbarer Dienst
  // sehen im UI gleich aus; im Betrieb brauchen wir die konkrete Ursache.
  console.warn(`[rdap] ${url}: ${reason}`);
}

/** Mehr Sprünge macht keine Registry; rdap.org braucht genau einen. */
const MAX_REDIRECTS = 3;

export interface RdapFetchResult {
  response: Response;
  /** Die URL, die zuletzt geantwortet hat — nach Weiterleitungen die der Registry. */
  url: string;
  /** Ob es mindestens eine Weiterleitung gab. */
  redirected: boolean;
}

/**
 * GET auf einen RDAP-Dienst, Weiterleitungen nur auf erlaubte Ziele (#105).
 *
 * `fetch` folgte jeder Weiterleitung, auch auf `http:` oder eine interne
 * Adresse. Hier geht es nur weiter, wenn das Ziel `https:` auf dem
 * Standard-Port ist und `allowHost` den Host zulässt — mit Bootstrap dessen
 * Hosts und die festen Registries, ohne ihn Namen mit öffentlichen Adressen
 * (services/registry.ts). Sonst wirft es, die Antwort des Sprungs wird
 * verworfen.
 */
export async function fetchRdap(
  url: string,
  { signal, allowHost }: { signal: AbortSignal; allowHost: (host: string) => boolean | Promise<boolean> }
): Promise<RdapFetchResult> {
  let current = url;
  for (let hops = 0; ; hops += 1) {
    const response = await fetch(current, { signal, headers: RDAP_HEADERS, redirect: 'manual' });
    if (response.status < 300 || response.status > 399 || response.status === 304) {
      return { response, url: current, redirected: hops > 0 };
    }

    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error(`HTTP ${response.status} ohne Ziel`);
    if (hops >= MAX_REDIRECTS) throw new Error('zu viele Weiterleitungen');
    const next = new URL(location, current);
    // Kein Dienst im IANA-Bootstrap nennt einen eigenen Port (Stand 30.9.2026).
    if (next.protocol !== 'https:' || next.username || next.password || next.port) {
      throw new Error(`Weiterleitung auf ${next.protocol}//${next.host} abgelehnt`);
    }
    if (!(await allowHost(next.hostname))) throw new Error(`Weiterleitung auf ${next.hostname} abgelehnt`);
    current = next.href;
  }
}
