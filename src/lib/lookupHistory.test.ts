import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LookupReport } from '@/types/dns';
import {
  clearLookupHistory,
  findHistoryEntry,
  saveLookupToHistory,
  useLookupHistory,
} from './lookupHistory';

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
      nullMx: false,
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

/**
 * #79: Für „Seit dem letzten Check“ speichert die History mehr als vorher.
 * Einträge im alten Format liegen aber schon in den Browsern — sie müssen
 * weiter gelesen werden, und kaputte Zusatzfelder dürfen nur sich selbst
 * kosten, nicht den Eintrag.
 */
describe('Speicherformat für den Vergleich', () => {
  const HISTORY_KEY = 'diggy-lookup-history';

  function fullReport(): LookupReport {
    const report = reportFor('example.com');
    return {
      ...report,
      records: [
        { type: 'A', name: 'example.com', value: '198.51.100.7', ttl: 300 },
        { type: 'A', name: 'example.com', value: '198.51.100.7', ttl: 300 },
        { type: 'AAAA', name: 'example.com', value: '2001:DB8::1', ttl: 300 },
        { type: 'MX', name: 'example.com', value: 'mx1.example.com.', ttl: 300, priority: 10 },
        { type: 'NS', name: 'example.com', value: 'ns1.example.net', ttl: 300 },
        { type: 'TXT', name: 'example.com', value: 'v=spf1 -all', ttl: 300 },
      ],
      ssl: {
        valid: true,
        issuer: 'Test CA',
        subject: 'example.com',
        validFrom: '2026-09-01T00:00:00.000Z',
        validTo: '2026-12-01T00:00:00.000Z',
        daysUntilExpiry: 70,
        sans: [],
        tlsVersion: 'TLSv1.3',
        signatureAlgorithm: 'sha256',
        isWildcard: false,
      },
      mail: {
        ...report.mail,
        dmarc: { present: true, policy: 'reject' },
      },
    };
  }

  function stored(): Record<string, unknown>[] {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]');
  }

  it('speichert Records je Typ, Ablaufdatum, DMARC-Policy und fehlgeschlagene Checks', () => {
    saveLookupToHistory(fullReport(), ['whois']);

    const [entry] = stored();
    expect(entry.records).toEqual({
      A: ['198.51.100.7'],
      AAAA: ['2001:db8::1'],
      MX: ['10 mx1.example.com'],
      NS: ['ns1.example.net'],
    });
    expect(entry.sslValidTo).toBe('2026-12-01T00:00:00.000Z');
    expect(entry.dmarcPolicy).toBe('reject');
    expect(entry.failedChecks).toEqual(['whois']);
  });

  // Der Server meldet Timeouts als „nichts gefunden“ — mit Marker. Der muss
  // in die History, sonst hält der nächste Vergleich den Ausfall für eine
  // Änderung („AAAA entfallen“, „DNSSEC aus“, „DMARC entfernt“).
  it('hält gescheiterte Abfragen als unbekannt fest, nicht als leer', () => {
    const report = fullReport();
    saveLookupToHistory(
      {
        ...report,
        failedRecordTypes: ['AAAA', 'TXT'],
        dnssec: { ...report.dnssec, lookupFailed: 'timeout' },
        mail: { ...report.mail, dmarc: { present: false, lookupFailed: 'servfail' } },
      },
      ['whois']
    );

    const [entry] = stored();
    expect(entry.records).toEqual({
      A: ['198.51.100.7'],
      AAAA: null,
      MX: ['10 mx1.example.com'],
      NS: ['ns1.example.net'],
    });
    expect(entry.failedChecks).toEqual(['whois', 'dnssec', 'mail']);
  });

  // #101: Ausfälle zählen nicht mehr als Abzug. Ein Score aus einem Lookup mit
  // gescheitertem SSL-, SPF-, DKIM- oder MTA-STS-Check ist deshalb eine andere
  // Rechnung — der Vergleich darf ihn nicht als „Score gestiegen“ melden.
  it('zählt gescheiterte SSL- und SPF-Checks als Teilausfall', () => {
    const report = fullReport();
    saveLookupToHistory({
      ...report,
      ssl: undefined,
      sslLookupFailed: 'timeout',
      mail: { ...report.mail, spf: { ...report.mail.spf, lookupFailed: 'network' } },
    });

    expect(stored()[0].failedChecks).toEqual(['ssl', 'mail']);
  });

  it('lässt leere Zusatzfelder weg, statt Platz zu belegen', () => {
    saveLookupToHistory(reportFor('example.com'));

    const [entry] = stored();
    expect(entry.records).toEqual({ A: ['198.51.100.7'] });
    expect(entry).not.toHaveProperty('sslValidTo');
    expect(entry).not.toHaveProperty('dmarcPolicy');
    expect(entry).not.toHaveProperty('failedChecks');
  });

  it('liest Einträge im alten Format ohne die neuen Felder weiter', () => {
    const old = {
      domain: 'old.example',
      lookedUpAt: '2026-09-01T10:00:00.000Z',
      score: 64,
      verdict: 'Ausbaufähig',
      recordCount: 3,
      ips: ['203.0.113.5'],
      mx: [],
      nameservers: ['ns1.example.net'],
      sslValid: true,
      sslDaysUntilExpiry: 30,
      dnssecValid: false,
      dmarcPresent: false,
      findingsCount: 4,
    };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([old]));

    saveLookupToHistory(reportFor('example.com'));
    const { result } = renderHook(() => useLookupHistory());

    expect(result.current.map((entry) => entry.domain)).toEqual(['example.com', 'old.example']);
    expect(result.current[1]).toEqual(old);
  });

  it('verwirft kaputte Zusatzfelder einzeln und behält den Eintrag', () => {
    const damaged = {
      domain: 'old.example',
      lookedUpAt: '2026-09-01T10:00:00.000Z',
      score: 64,
      ips: [],
      mx: [],
      nameservers: [],
      records: { A: ['203.0.113.5'], MX: 'kein Array' },
      sslValidTo: 'irgendwann',
      dmarcPolicy: 'strict',
      failedChecks: ['ssl', 'erfunden'],
    };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([damaged]));

    saveLookupToHistory(reportFor('example.com'));
    const { result } = renderHook(() => useLookupHistory());
    const entry = result.current[1];

    expect(entry.domain).toBe('old.example');
    // Ein kaputter Typ verwirft alle — sonst sähe der Vergleich „MX entfallen“.
    expect(entry).not.toHaveProperty('records');
    expect(entry).not.toHaveProperty('sslValidTo');
    expect(entry).not.toHaveProperty('dmarcPolicy');
    expect(entry.failedChecks).toEqual(['ssl']);
  });

  it('liest einen als gescheitert markierten Typ (null) wieder ein', () => {
    const saved = {
      domain: 'old.example',
      lookedUpAt: '2026-09-01T10:00:00.000Z',
      score: 64,
      ips: [],
      mx: [],
      nameservers: [],
      records: { A: ['203.0.113.5'], AAAA: null },
    };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([saved]));

    saveLookupToHistory(reportFor('example.com'));
    const { result } = renderHook(() => useLookupHistory());

    expect(result.current[1].records).toEqual({ A: ['203.0.113.5'], AAAA: null });
  });
});

describe('findHistoryEntry', () => {
  it('findet den Eintrag unabhängig von der Schreibweise', () => {
    saveLookupToHistory(reportFor('Example.com'));
    const { result } = renderHook(() => useLookupHistory());

    expect(findHistoryEntry(result.current, 'example.COM')?.domain).toBe('Example.com');
    expect(findHistoryEntry(result.current, 'other.com')).toBeNull();
  });
});
