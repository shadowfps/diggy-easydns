/**
 * Mail-TXT-Tags sind durch Semikolons getrennt: nur vollständige Namen
 * vergleichen, damit `p` nicht versehentlich `sp` trifft (#97).
 * Bei doppelten Tags gilt der erste, auch wenn sein Wert leer ist.
 * Werte bleiben erhalten — etwa Großbuchstaben in Report-Adressen oder
 * DKIM-Schlüsseln. Policy-Werte normalisiert erst der jeweilige Aufrufer.
 *
 * Namen vergleichen wir ohne Rücksicht auf die Schreibweise: Die DMARC-ABNF
 * (RFC 7489 §6.4) schreibt sie als Strings, und die sind nach RFC 5234 §2.3
 * case-insensitiv. DKIM (RFC 6376 §3.2) verlangt zwar exakte Namen, ein
 * großes `P=` ist dort aber ohnehin ungültig — für die Frage „Schlüssel da
 * oder widerrufen?“ ändert die strengere Lesart nichts.
 */
export function matchTag(record: string | undefined, tag: string): string | undefined {
  const name = tag.toLowerCase();
  for (const part of record?.split(';') ?? []) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim().toLowerCase() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

/**
 * Wert des Versions-Tags `v=`, aber nur, wenn es als erstes Tag steht — so
 * verlangen es DMARC (RFC 7489 §6.3) und DKIM (RFC 6376 §3.6.1). Ein `v=`
 * weiter hinten zählt nicht: `p=reject; v=DMARC1` verwerfen Empfänger.
 */
export function leadingVersion(record: string | undefined): string | undefined {
  return matchTag(record?.split(';', 1)[0], 'v');
}
