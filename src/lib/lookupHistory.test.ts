import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LookupReport } from '@/types/dns';
import { clearLookupHistory, saveLookupToHistory, useLookupHistory } from './lookupHistory';

/**
 * Tests für die Lookup-History als Render-Quelle.
 *
 * App.tsx hielt den Inhalt vorher in einem useState und zog ihn an vier
 * Stellen von Hand nach — beim Mount, nach jedem Lookup, beim Wechsel auf
 * /history und beim Leeren. Seit dem Umstieg auf useSyncExternalStore ist
 * localStorage die einzige Quelle.
 *
 * Der dritte Test ist der wichtige: gibt getSnapshot bei jedem Aufruf ein
 * frisches Array zurück, rendert React endlos. Das fällt im Betrieb sofort
 * auf, im Review aber leicht durch.
 */

function reportFor(domain: string, score = 80): LookupReport {
  return {
    domain,
    timestamp: '2026-09-21T10:00:00.000Z',
    records: [{ type: 'A', name: domain, value: '198.51.100.7', ttl: 300 }],
    propagation: [],
    dnssec: { enabled: false, valid: false, chainOfTrust: 'none' },
    mail: {
      spf: { present: false, valid: false, issues: [] },
      dmarc: { present: false },
      dkim: { selectors: [] },
      mtaSts: { present: false },
      hasMx: false,
    },
    findings: [],
    healthScore: {
      score,
      verdict: 'Solide',
      counts: { success: 1, info: 0, warning: 0, critical: 0 },
    },
    techStack: [],
  };
}

beforeEach(() => {
  clearLookupHistory();
});

describe('useLookupHistory', () => {
  it('zeigt einen gespeicherten Lookup ohne Zutun der Komponente', () => {
    const { result } = renderHook(() => useLookupHistory());
    expect(result.current).toHaveLength(0);

    act(() => {
      saveLookupToHistory(reportFor('example.com'));
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].domain).toBe('example.com');
    expect(result.current[0].score).toBe(80);
  });

  it('leert die Anzeige beim Löschen der History', () => {
    saveLookupToHistory(reportFor('example.com'));
    const { result } = renderHook(() => useLookupHistory());
    expect(result.current).toHaveLength(1);

    act(() => {
      clearLookupHistory();
    });

    expect(result.current).toHaveLength(0);
  });

  it('gibt ohne Schreibvorgang dasselbe Array zurück', () => {
    saveLookupToHistory(reportFor('example.com'));

    const { result, rerender } = renderHook(() => useLookupHistory());
    const first = result.current;
    rerender();

    // Referenzgleich, nicht nur inhaltsgleich: ein neues Array bei jedem
    // Aufruf würde useSyncExternalStore in eine Endlosschleife schicken.
    expect(result.current).toBe(first);
  });
});
