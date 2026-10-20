/**
 * Endungen, deren Registry automatisierte Abfragen sperrt (#105).
 *
 * whois.nic.ch antwortet auf jede Abfrage von hier mit „Requests of this
 * client are not permitted. Please use https://www.nic.ch/whois/ for
 * queries.“, RDAP bietet SWITCH nicht an. Der Server fragt deshalb gar nicht
 * erst; die WHOIS-Ansicht verweist stattdessen auf die Web-Abfrage der
 * Registry. Geteilt, damit Server und Oberfläche dieselbe Liste kennen.
 */
const WEB_LOOKUP: Readonly<Record<string, string>> = {
  ch: 'https://www.nic.ch/whois/',
};

export interface RegistryWebLookup {
  /** Die Endung ohne Punkt, z. B. `ch`. */
  tld: string;
  /** Die Web-Abfrage der Registry — ein fester Link, kein Wert aus der Eingabe. */
  url: string;
}

/** Die Web-Abfrage für die Endung von `domain`, falls die Registry nur diese anbietet. */
export function registryWebLookup(domain: string): RegistryWebLookup | undefined {
  const tld = domain.toLowerCase().replace(/\.$/, '').split('.').pop() ?? '';
  const url = Object.hasOwn(WEB_LOOKUP, tld) ? WEB_LOOKUP[tld] : undefined;
  return url ? { tld, url } : undefined;
}
