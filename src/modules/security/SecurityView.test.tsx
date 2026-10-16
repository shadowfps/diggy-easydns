import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DnssecInfo, SslInfo } from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { SecurityView } from './SecurityView';

const done = <T,>(data: T, extra: Partial<SectionSlice<T>> = {}): SectionSlice<T> => ({
  status: 'done',
  data,
  ...extra,
});
const failedSection = <T,>(): SectionSlice<T> => ({ status: 'error', data: undefined, error: 'x' });

const DNSSEC_OFF: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

const ssl: SslInfo = {
  valid: true,
  issuer: "Let's Encrypt",
  subject: 'www.example.com',
  validFrom: '2026-09-02T00:00:00.000Z',
  // Mittags UTC, damit der Kalendertag in jeder üblichen Zeitzone derselbe ist.
  validTo: '2026-12-01T12:00:00.000Z',
  daysUntilExpiry: 46,
  sans: ['www.example.com'],
  tlsVersion: 'TLSv1.3',
  signatureAlgorithm: 'ECDSA',
  isWildcard: false,
};

const calendarButton = () => screen.queryByRole('button', { name: /in den kalender/i });

describe('SecurityView – Kalender-Erinnerung', () => {
  let blob: Blob | null = null;
  let filename = '';

  beforeEach(() => {
    blob = null;
    filename = '';
    // jsdom kennt weder Objekt-URLs noch Downloads. Abgefangen wird am Link,
    // damit der Test sieht, was der Browser speichern würde.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (value: Blob) => {
        blob = value;
        return 'blob:diggy-test';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => {} });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filename = this.download;
    });
  });

  it('bietet den Termin an, solange das Zertifikat gültig ist', async () => {
    render(
      <SecurityView
        domain="www.example.com"
        ssl={done<SslInfo | null>(ssl)}
        dnssec={done(DNSSEC_OFF)}
      />
    );

    await userEvent.click(calendarButton()!);
    // Der Erzeuger wird erst beim Klick nachgeladen.
    await waitFor(() => expect(blob).not.toBeNull());

    expect(filename).toBe('www.example.com-zertifikat-ablauf.ics');
    expect(blob!.type).toBe('text/calendar;charset=utf-8');
    const ics = await blob!.text();
    expect(ics).toContain('SUMMARY:Zertifikat von www.example.com läuft ab');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain(`URL:${window.location.origin}/lookup/www.example.com`);
  });

  it('bietet nichts an, wenn das Zertifikat schon abgelaufen ist', () => {
    render(
      <SecurityView
        domain="www.example.com"
        ssl={done<SslInfo | null>({
          ...ssl,
          validTo: '2026-10-01T00:00:00.000Z',
          daysUntilExpiry: -15,
        })}
        dnssec={done(DNSSEC_OFF)}
      />
    );
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('bietet nichts an, wenn das Ablaufdatum unlesbar ist', () => {
    render(
      <SecurityView
        domain="www.example.com"
        ssl={done<SslInfo | null>({ ...ssl, validTo: '' })}
        dnssec={done(DNSSEC_OFF)}
      />
    );
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('bietet nichts an, wenn es kein Zertifikat gibt', () => {
    render(
      <SecurityView
        domain="www.example.com"
        ssl={done<SslInfo | null>(null)}
        dnssec={done(DNSSEC_OFF)}
      />
    );
    expect(calendarButton()).not.toBeInTheDocument();
  });
});

/**
 * „nicht prüfbar“ statt „Kein TLS“ / „nicht aktiviert“, wenn nur der Check
 * scheiterte (#101) — und das Gegenstück: echtes Fehlen bleibt wie bisher.
 */
describe('SecurityView – nicht prüfbar', () => {
  it('zeigt bei einem SSL-Timeout „nicht prüfbar“ mit Grund statt „Kein TLS“', () => {
    render(
      <SecurityView
        domain="example.com"
        ssl={done<SslInfo | null>(null, { lookupFailed: 'timeout' })}
        dnssec={done(DNSSEC_OFF)}
      />
    );

    expect(screen.getAllByText('nicht prüfbar')).toHaveLength(1);
    expect(screen.getByText(/^Der SSL-Check scheiterte \(Zeitüberschreitung\)/)).toBeInTheDocument();
    expect(screen.queryByText('Kein TLS auf Port 443 erreichbar')).not.toBeInTheDocument();
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('zeigt „Kein TLS“ weiter, wenn es wirklich keines gibt', () => {
    render(
      <SecurityView domain="example.com" ssl={done<SslInfo | null>(null)} dnssec={done(DNSSEC_OFF)} />
    );

    expect(screen.getByText('Kein TLS auf Port 443 erreichbar')).toBeInTheDocument();
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
  });

  it('zeigt DNSSEC bei gescheiterter Abfrage als nicht prüfbar statt „nicht aktiviert“', () => {
    render(
      <SecurityView
        domain="example.com"
        ssl={done<SslInfo | null>(null)}
        dnssec={done<DnssecInfo>({ ...DNSSEC_OFF, lookupFailed: 'servfail' })}
      />
    );

    expect(screen.getByText('DNSSEC · unbekannt')).toBeInTheDocument();
    expect(screen.getByText('nicht prüfbar')).toBeInTheDocument();
    expect(screen.getByText(/^Der DNSSEC-Check scheiterte \(SERVFAIL\)/)).toBeInTheDocument();
    // SERVFAIL kann eine kaputte Signatur sein — das soll auf der Karte stehen.
    expect(screen.getByText(/fehlerhafte Signatur/)).toBeInTheDocument();
    expect(screen.queryByText('nicht aktiviert')).not.toBeInTheDocument();
  });

  it('zeigt ausgefallene Sektionen ebenfalls als nicht prüfbar', () => {
    render(<SecurityView domain="example.com" ssl={failedSection()} dnssec={failedSection()} />);

    expect(screen.getAllByText('nicht prüfbar')).toHaveLength(2);
    // Ohne Grund in Klammern: der Server meldete nur einen Fehler.
    expect(screen.getByText(/^Der SSL-Check scheiterte\. Ob SSL/)).toBeInTheDocument();
    expect(screen.getByText(/^Der DNSSEC-Check scheiterte\. Ob DNSSEC/)).toBeInTheDocument();
    expect(screen.queryByText('Kein TLS auf Port 443 erreichbar')).not.toBeInTheDocument();
    expect(screen.queryByText('nicht aktiviert')).not.toBeInTheDocument();
  });
});
