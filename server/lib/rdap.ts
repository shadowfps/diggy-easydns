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
