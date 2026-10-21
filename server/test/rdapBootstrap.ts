/**
 * Auszug aus dem IANA-Bootstrap (data.iana.org/rdap/dns.json, Stand
 * 30.9.2026): die Endungen der Verfügbarkeits-Vorschläge mit Eintrag und
 * .uk. .de, .io, .at, .it, .eu und .ch stehen dort nicht — wie im Original.
 */
export const BOOTSTRAP_SAMPLE = {
  description: 'RDAP bootstrap file for Domain Name System registrations',
  publication: '2026-09-30T23:00:03Z',
  version: '1.0',
  services: [
    [['com'], ['https://rdap.verisign.com/com/v1/']],
    [['net'], ['https://rdap.verisign.com/net/v1/']],
    [['org'], ['https://rdap.publicinterestregistry.org/rdap/']],
    [['app', 'dev'], ['https://pubapi.registry.google/rdap/']],
    [['uk'], ['https://rdap.nominet.uk/uk/']],
  ],
};
