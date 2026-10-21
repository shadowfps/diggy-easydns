/**
 * Endungen, für die diggy keine Registry fragt, sondern auf deren
 * Web-Abfrage verlinkt (#105). Die zentrale Liste: Server
 * (services/registry.ts) und WHOIS-Ansicht lesen beide hier.
 *
 * Steht eine Endung hier, fragt der Server weder per RDAP noch über Port 43
 * — WHOIS-Report „nicht verfügbar“ mit Link, Verfügbarkeit „unklar“. Die
 * Parser für .at und .it (services/whoisText.ts) und ihre Hosts in
 * FIXED_REGISTRIES bleiben: Nach einer Genehmigung der Registry die Zeile
 * hier löschen, dann fragt der Server wieder über Port 43. Dabei auch die
 * Empfänger in /datenschutz und docs/COMPLIANCE.md nachziehen
 * (registry.test.ts prüft das).
 */
const WEB_ONLY: Readonly<Record<string, RegistryWebLookupEntry>> = {
  // whois.nic.ch antwortet auf jede Abfrage von hier mit „Requests of this
  // client are not permitted. Please use https://www.nic.ch/whois/ for
  // queries.“ (geprüft am 20.10.2026); RDAP bietet SWITCH nicht an.
  ch: { url: 'https://www.nic.ch/whois/', reason: 'blocked' },
  // nic.at: „no part of this information may be reproduced, stored in a
  // retrieval system, or transmitted … without prior permission of NIC.AT“
  // (Hinweis in jeder WHOIS-Antwort; WHOIS-Policy
  // https://www.nic.at/en/my-at-domain/domain-search/whois-policy). Eine
  // Genehmigung liegt nicht vor (Entscheidung des Betreibers, 21.10.2026).
  at: { url: 'https://www.nic.at/de/meine-at-domain/domain-suche/whois', reason: 'permission' },
  // Registro .it: Zugang „purely for consultation“, keine Weiterverwendung
  // „in any re-elaborated form … without authorization“ (WHOIS-Policy 2.2,
  // §7, https://www.nic.it/sites/default/files/documenti/2022/Whois_policy_v_2_2_.pdf).
  // Eine Genehmigung liegt nicht vor (Entscheidung des Betreibers, 21.10.2026).
  it: { url: 'https://www.nic.it/en/find-your-it/web-whois', reason: 'permission' },
};

interface RegistryWebLookupEntry {
  /** Die Web-Abfrage der Registry — ein fester Link, kein Wert aus der Eingabe. */
  url: string;
  /**
   * Warum nicht abgefragt wird: `blocked` — die Registry sperrt automatisierte
   * Abfragen; `permission` — ihre Bedingungen erlauben die Weitergabe der
   * Daten nur mit Genehmigung.
   */
  reason: 'blocked' | 'permission';
}

export interface RegistryWebLookup extends RegistryWebLookupEntry {
  /** Die Endung ohne Punkt, z. B. `ch`. */
  tld: string;
}

/** Die Web-Abfrage für die Endung von `domain`, falls diggy dort nicht selbst fragt. */
export function registryWebLookup(domain: string): RegistryWebLookup | undefined {
  const tld = domain.toLowerCase().replace(/\.$/, '').split('.').pop() ?? '';
  return Object.hasOwn(WEB_ONLY, tld) ? { tld, ...WEB_ONLY[tld] } : undefined;
}
