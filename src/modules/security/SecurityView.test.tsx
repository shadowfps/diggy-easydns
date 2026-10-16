import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DnssecInfo, SslInfo } from '@/types/dns';
import { SecurityView } from './SecurityView';

const NO_DNSSEC: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

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
    render(<SecurityView domain="www.example.com" ssl={ssl} dnssec={NO_DNSSEC} />);

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
        ssl={{ ...ssl, validTo: '2026-10-01T00:00:00.000Z', daysUntilExpiry: -15 }}
        dnssec={NO_DNSSEC}
      />
    );
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('bietet nichts an, wenn das Ablaufdatum unlesbar ist', () => {
    render(
      <SecurityView domain="www.example.com" ssl={{ ...ssl, validTo: '' }} dnssec={NO_DNSSEC} />
    );
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('bietet nichts an, wenn es kein Zertifikat gibt', () => {
    render(<SecurityView domain="www.example.com" dnssec={NO_DNSSEC} />);
    expect(calendarButton()).not.toBeInTheDocument();
  });
});
