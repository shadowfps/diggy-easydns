export * from '@shared/nullMx';

/**
 * Ein MX-Wert aus dem Verlauf, geteilt in Präferenz und Ziel (#122). Der
 * Verlauf speichert ihn als „Präferenz Ziel“ (`10 mx.example.net`); das leere
 * Ziel eines Null-MX steht dort als `"0 "`, vergleichbar gemacht als `"0"`.
 * Die Zonendatei schreibt die Wurzel als „.“ — so heißt das Ziel hier auch,
 * sonst bliebe vom Null-MX nur die Präferenz.
 *
 * Ohne Präferenz vorn kommt der Wert unverändert als Ziel zurück.
 */
export function splitMxValue(value: string): { priority?: string; target: string } {
  const match = /^(\d+)(?:\s+(\S*))?$/.exec(value.trim());
  if (!match) return { target: value };
  return { priority: match[1], target: match[2] || '.' };
}
