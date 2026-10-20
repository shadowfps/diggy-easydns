/**
 * IANA-Bootstrap für RDAP (RFC 9224): welche Registry für welche Endung
 * zuständig ist (#105).
 *
 * Bisher ging fast jede WHOIS- und Verfügbarkeitsabfrage über rdap.org. Das
 * drosselt pro IP (laut Betreiber 10 Anfragen in 10 Sekunden), und alle
 * Anfragen von diggydns.cloud kommen von einer IP. Mit der Liste der IANA
 * fragt der Server die Registry direkt; rdap.org bleibt Rückfall, solange
 * die Liste nicht geladen werden konnte.
 *
 * - Geladen beim ersten Bedarf, gültig 24 Stunden (so lange erlaubt auch
 *   data.iana.org das Cachen: `cache-control: max-age=86400`).
 * - Gleichzeitige Abfragen teilen sich einen Ladevorgang.
 * - Scheitert das Laden, wird es frühestens nach `RETRY_AFTER_MS` erneut
 *   versucht. Bis dahin gilt eine schon geladene Liste weiter — die
 *   Zuständigkeiten ändern sich selten —, ohne Liste der Rückfall rdap.org.
 * - Übernommen werden nur `https:`-URLs. Zwei Endungen nennen nur `http:`
 *   (Stand 30.9.2026: .mg, .kg); sie gelten als ohne RDAP-Dienst.
 */

import packageJson from '../../package.json' with { type: 'json' };

export const IANA_RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';

/** Gültigkeit der geladenen Liste. */
export const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

/** Sperre nach einem Ladefehler, bevor der nächste Versuch läuft. */
export const RETRY_AFTER_MS = 5 * 60 * 1000;

const LOAD_TIMEOUT_MS = 5_000;

/** Die Datei hat rund 70 KB; mehr als 2 MiB wäre keine Bootstrap-Datei. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Endung (auch mehrteilig, RFC 9224 erlaubt das) in A-Label-Form. */
const TLD_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

export interface RdapBootstrap {
  /** Endung → Basis-URL des RDAP-Dienstes, immer `https:` mit `/` am Ende. */
  services: ReadonlyMap<string, string>;
  /** Alle Hosts aus `services` — erlaubte Ziele für Weiterleitungen. */
  hosts: ReadonlySet<string>;
}

interface State {
  bootstrap?: RdapBootstrap;
  loadedAt: number;
  blockedUntil: number;
  loading?: Promise<RdapBootstrap | undefined>;
}

let state: State = { loadedAt: 0, blockedUntil: 0 };

/** Für Tests: vergisst Liste, Sperre und laufende Ladevorgänge. */
export function resetRdapBootstrap(): void {
  state = { loadedAt: 0, blockedUntil: 0 };
}

/**
 * Die Liste der RDAP-Dienste, oder `undefined`, wenn sie nie geladen werden
 * konnte. Wirft nie.
 */
export function getRdapBootstrap(): Promise<RdapBootstrap | undefined> {
  const now = Date.now();
  if (state.bootstrap && now - state.loadedAt < BOOTSTRAP_TTL_MS) {
    return Promise.resolve(state.bootstrap);
  }
  if (now < state.blockedUntil) return Promise.resolve(state.bootstrap);
  if (!state.loading) {
    const current = state;
    current.loading = load(current).finally(() => {
      current.loading = undefined;
    });
  }
  return state.loading!;
}

async function load(current: State): Promise<RdapBootstrap | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
  try {
    const res = await fetch(IANA_RDAP_BOOTSTRAP_URL, {
      signal: ctrl.signal,
      headers: { 'user-agent': `diggy/${packageJson.version} (+https://diggydns.cloud)`, accept: 'application/json' },
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('Datei zu groß');
    const bootstrap = parseRdapBootstrap(JSON.parse(text));
    current.bootstrap = bootstrap;
    current.loadedAt = Date.now();
    current.blockedUntil = 0;
    return bootstrap;
  } catch (error) {
    const reason = ctrl.signal.aborted ? 'Timeout' : error instanceof Error ? error.message : String(error);
    current.blockedUntil = Date.now() + RETRY_AFTER_MS;
    console.warn(
      `[rdap] ${IANA_RDAP_BOOTSTRAP_URL}: ${reason} — ${
        current.bootstrap ? 'bisherige Liste gilt weiter' : 'Rückfall auf rdap.org'
      }`
    );
    return current.bootstrap;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prüft und übernimmt die Bootstrap-Datei. Wirft, wenn sie nicht dem
 * Format aus RFC 9224 entspricht oder keine brauchbare Endung enthält.
 */
export function parseRdapBootstrap(data: unknown): RdapBootstrap {
  const services = new Map<string, string>();
  const list = (data as { services?: unknown } | null)?.services;
  if (!Array.isArray(list)) throw new Error('keine services-Liste');

  for (const entry of list) {
    if (!Array.isArray(entry) || !Array.isArray(entry[0]) || !Array.isArray(entry[1])) continue;
    const base = (entry[1] as unknown[]).map(httpsBase).find((url) => url !== undefined);
    if (!base) continue;
    for (const tld of entry[0] as unknown[]) {
      if (typeof tld !== 'string') continue;
      const key = tld.toLowerCase().replace(/\.$/, '');
      if (TLD_PATTERN.test(key) && !services.has(key)) services.set(key, base);
    }
  }

  if (services.size === 0) throw new Error('keine Endung mit https-Dienst');
  return { services, hosts: new Set([...services.values()].map((url) => new URL(url).hostname)) };
}

/** Basis-URL, wenn sie `https:` ist und nichts außer Host und Pfad trägt. */
function httpsBase(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/**
 * Die Basis-URL für `domain` — die längste Endung aus der Liste, die zu den
 * letzten Labels passt (RFC 9224, Abschnitt 4).
 */
export function findRdapBase(bootstrap: RdapBootstrap, domain: string): string | undefined {
  const labels = domain.toLowerCase().replace(/\.$/, '').split('.');
  for (let i = 1; i < labels.length; i += 1) {
    const base = bootstrap.services.get(labels.slice(i).join('.'));
    if (base) return base;
  }
  return undefined;
}

/**
 * URL der Domain-Abfrage. Die Domain steht kodiert im Pfad, Host und Pfad
 * davor kommen allein aus `base` — eine Eingabe kann das Ziel nicht ändern.
 * Wirft, wenn die URL nach dem Parsen anders aussieht als zusammengesetzt
 * (etwa `..` als Domain, das den Pfad verkürzen würde).
 */
export function rdapDomainUrl(base: string, domain: string): string {
  const href = `${base}domain/${encodeURIComponent(domain)}`;
  const url = new URL(href);
  if (url.protocol !== 'https:' || url.href !== href) {
    throw new Error(`ungültige RDAP-URL für ${domain}`);
  }
  return href;
}
