/**
 * Health-Score-Aggregation — geteilt zwischen Server und Client.
 *
 * Seit die Sub-Checks progressiv (jeder Endpoint einzeln) geladen werden,
 * muss der Client die Findings-Fragmente selbst zu einem Score verrechnen.
 * Damit Server- und Client-Score garantiert identisch sind, lebt die Logik
 * hier an genau einer Stelle.
 */

import type { Finding, HealthScore } from './types/dns.js';

/** Gewichtung pro Severity — negative Punkte vom 100er-Maximum. */
const SEVERITY_PENALTY: Record<Finding['severity'], number> = {
  critical: 25,
  warning: 8,
  info: 2,
  success: 0,
};

/**
 * Obergrenze für den Abzug aus info-Findings zusammen.
 *
 * Die info-Findings feuern bei völlig üblichen, oft bewusst so gewählten
 * Setups: kein IPv6, kein CAA, kein DNSSEC, kein MTA-STS, kein gefundener
 * DKIM-Selector. Eine technisch einwandfrei konfigurierte Domain landete
 * dadurch bei 92 und damit knapp unter "Hervorragend" — für vier Empfehlungen,
 * nicht für Mängel. Der Deckel hält den Score bei Fehlern aussagekräftig und
 * lässt Empfehlungen Empfehlungen sein.
 */
const MAX_INFO_PENALTY = 6;

export function calculateScore(findings: Finding[]): HealthScore {
  const counts = { success: 0, info: 0, warning: 0, critical: 0 };
  let score = 100;
  let infoPenalty = 0;

  for (const f of findings) {
    counts[f.severity]++;

    if (f.severity === 'info') {
      infoPenalty += SEVERITY_PENALTY.info;
      continue;
    }

    score -= SEVERITY_PENALTY[f.severity];
  }

  score -= Math.min(infoPenalty, MAX_INFO_PENALTY);
  score = Math.max(0, Math.min(100, score));

  return { score, verdict: verdictFor(score), counts };
}

export function verdictFor(score: number): string {
  if (score >= 90) return 'Hervorragend';
  if (score >= 75) return 'Solides Setup';
  if (score >= 55) return 'Optimierbar';
  if (score >= 30) return 'Lückenhaft';
  return 'Kritisch';
}
