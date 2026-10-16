/**
 * Mail-TXT-Tags sind durch Semikolons getrennt: nur vollständige Namen
 * vergleichen, damit `p` nicht versehentlich `sp` trifft (#97).
 * Bei doppelten Tags gilt der erste, auch wenn sein Wert leer ist.
 * Werte bleiben erhalten — etwa Großbuchstaben in Report-Adressen oder
 * DKIM-Schlüsseln. Policy-Werte normalisiert erst der jeweilige Aufrufer.
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
