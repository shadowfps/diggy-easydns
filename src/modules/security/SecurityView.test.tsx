import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DnssecInfo, SslInfo } from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { SecurityView } from './SecurityView';

/**
 * „nicht prüfbar“ statt „Kein TLS“ / „nicht aktiviert“, wenn nur der Check
 * scheiterte (#101) — und das Gegenstück: echtes Fehlen bleibt wie bisher.
 */

const done = <T,>(data: T, extra: Partial<SectionSlice<T>> = {}): SectionSlice<T> => ({
  status: 'done',
  data,
  ...extra,
});
const failedSection = <T,>(): SectionSlice<T> => ({ status: 'error', data: undefined, error: 'x' });

const DNSSEC_OFF: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

describe('SecurityView', () => {
  it('zeigt bei einem SSL-Timeout „nicht prüfbar“ mit Grund statt „Kein TLS“', () => {
    render(
      <SecurityView
        ssl={done<SslInfo | null>(null, { lookupFailed: 'timeout' })}
        dnssec={done(DNSSEC_OFF)}
      />
    );

    expect(screen.getAllByText('nicht prüfbar')).toHaveLength(1);
    expect(screen.getByText(/kam nicht zustande \(Zeitüberschreitung\)/)).toBeInTheDocument();
    expect(screen.queryByText('Kein TLS auf Port 443 erreichbar')).not.toBeInTheDocument();
  });

  it('zeigt „Kein TLS“ weiter, wenn es wirklich keines gibt', () => {
    render(<SecurityView ssl={done<SslInfo | null>(null)} dnssec={done(DNSSEC_OFF)} />);

    expect(screen.getByText('Kein TLS auf Port 443 erreichbar')).toBeInTheDocument();
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
  });

  it('zeigt DNSSEC bei gescheiterter Abfrage als nicht prüfbar statt „nicht aktiviert“', () => {
    render(
      <SecurityView
        ssl={done<SslInfo | null>(null)}
        dnssec={done<DnssecInfo>({ ...DNSSEC_OFF, lookupFailed: 'servfail' })}
      />
    );

    expect(screen.getByText('DNSSEC · unbekannt')).toBeInTheDocument();
    expect(screen.getByText('nicht prüfbar')).toBeInTheDocument();
    expect(screen.getByText(/scheiterte \(SERVFAIL\)/)).toBeInTheDocument();
    expect(screen.queryByText('nicht aktiviert')).not.toBeInTheDocument();
  });

  it('zeigt ausgefallene Sektionen ebenfalls als nicht prüfbar', () => {
    render(<SecurityView ssl={failedSection()} dnssec={failedSection()} />);

    expect(screen.getAllByText('nicht prüfbar')).toHaveLength(2);
    // Kein Handshake-Satz: versucht wurde dann gar nichts.
    expect(screen.getByText(/^Der SSL-Check ist fehlgeschlagen\./)).toBeInTheDocument();
    expect(screen.getByText(/^Der DNSSEC-Check ist fehlgeschlagen\./)).toBeInTheDocument();
    expect(screen.queryByText('Kein TLS auf Port 443 erreichbar')).not.toBeInTheDocument();
    expect(screen.queryByText('nicht aktiviert')).not.toBeInTheDocument();
  });
});
