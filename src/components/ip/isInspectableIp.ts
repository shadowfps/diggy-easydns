/**
 * Erkennung von IP-Literalen — ohne React-Abhängigkeit.
 *
 * Aus IpAddressLink.tsx herausgezogen (siehe useIpDetails.ts zum Warum) und
 * ohnehin die passendere Heimat: die Funktion steuert in App.tsx, ob eine
 * Eingabe als IP-Lookup oder als Domain behandelt wird, und hat mit der
 * Darstellung nichts zu tun.
 */

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * IPv6 mit korrekter Struktur statt der alten Hex-Heuristik `/^[0-9a-f:]+$/`.
 *
 * Die ließ alles durch, was nur Hex-Zeichen und Doppelpunkte enthält — auch
 * `ab:cd` oder `cafe:babe`. Relevant, weil isInspectableIp in App.tsx die
 * Suche steuert: eine Eingabe wie `ab:cd` landete in der PTR-Ansicht mit einer
 * API-Fehlermeldung statt in der verständlicheren Domain-Validierung.
 */
const IPV6_PATTERN = new RegExp(
  '^(' +
    // Volle Form: 8 Hextets
    '([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}' +
    // Komprimierte Formen mit ::
    '|([0-9a-f]{1,4}:){1,7}:' +
    '|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}' +
    '|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}' +
    '|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}' +
    '|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}' +
    '|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}' +
    '|[0-9a-f]{1,4}:(:[0-9a-f]{1,4}){1,6}' +
    '|:((:[0-9a-f]{1,4}){1,7}|:)' +
    // Link-local mit Zone-ID
    '|fe80:(:[0-9a-f]{0,4}){0,4}%[0-9a-z]+' +
    // IPv4-in-IPv6
    '|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])' +
    '|([0-9a-f]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])' +
    ')$',
  'i'
);

export function isInspectableIp(value: string): boolean {
  const normalized = value.trim();
  if (IPV4_PATTERN.test(normalized)) return true;
  return normalized.includes(':') && IPV6_PATTERN.test(normalized);
}
