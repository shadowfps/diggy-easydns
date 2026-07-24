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

export function calculateScore(findings: Finding[]): HealthScore {
  const counts = { success: 0, info: 0, warning: 0, critical: 0 };
  let score = 100;

  for (const f of findings) {
    counts[f.severity]++;
    score -= SEVERITY_PENALTY[f.severity];
  }

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
