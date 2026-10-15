/**
 * Namen mit Unterstrich sind DNS-Einträge, keine Hosts.
 *
 * Unterstrich-Labels kennzeichnen nach RFC 8552 Namen, die nur Daten für
 * einen Dienst tragen: `_dmarc`, `<selector>._domainkey`, `_mta-sts`,
 * `_acme-challenge`, `_sip._tcp`. Dort liegt ein TXT-, CNAME- oder SRV-Record,
 * aber kein Webserver. In Hostnamen ist der Unterstrich ohnehin nicht erlaubt
 * (RFC 952/1123), und Zertifikate dürfen ihn seit 2019 nicht mehr enthalten —
 * auch `mein_host.example.com` bekommt also kein gültiges TLS.
 *
 * Für solche Namen laufen deshalb nur die DNS-Checks. SSL, Tech-Stack,
 * PageSpeed und VirusTotal würden einen Webserver ansprechen, den es hier
 * nicht gibt, und die Propagation vergleicht A/AAAA-Records.
 */
export function isDnsOnlyName(name: string): boolean {
  return name.includes('_');
}
