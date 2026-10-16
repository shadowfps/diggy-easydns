import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WhoisInfo } from '@/types/dns';
import { WhoisView } from './WhoisView';

const DAY = 24 * 60 * 60 * 1000;

/** Relativ zu jetzt, weil die Karte die Tage bis zum Ablauf selbst rechnet. */
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const whois: WhoisInfo = {
  domain: 'example.com',
  registrar: 'Example Registrar',
  createdAt: '1995-08-14T04:00:00Z',
  expiresAt: inDays(200),
  status: ['clientTransferProhibited'],
};

const calendarButton = () => screen.queryByRole('button', { name: /in den kalender/i });

describe('WhoisView – Kalender-Erinnerung', () => {
  let blob: Blob | null = null;
  let filename = '';

  beforeEach(() => {
    blob = null;
    filename = '';
    // jsdom kennt weder Objekt-URLs noch Downloads — siehe SecurityView.test.
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

  it('erinnert an die registrierte Domain und verlinkt den geprüften Report', async () => {
    render(<WhoisView domain="www.example.com" whois={whois} />);

    await userEvent.click(calendarButton()!);
    // Der Erzeuger wird erst beim Klick nachgeladen.
    await waitFor(() => expect(blob).not.toBeNull());

    expect(filename).toBe('example.com-domain-ablauf.ics');
    const ics = await blob!.text();
    expect(ics).toContain('SUMMARY:Domain example.com läuft ab');
    expect(ics).toContain(`URL:${window.location.origin}/lookup/www.example.com`);
  });

  it('nimmt den Report-Namen, wenn der Server die abgefragte Domain nicht mitliefert', async () => {
    render(<WhoisView domain="example.net" whois={{ ...whois, domain: undefined }} />);

    await userEvent.click(calendarButton()!);
    // Der Erzeuger wird erst beim Klick nachgeladen.
    await waitFor(() => expect(blob).not.toBeNull());

    expect(await blob!.text()).toContain('SUMMARY:Domain example.net läuft ab');
  });

  it('bietet nichts an, wenn kein Ablaufdatum bekannt ist', () => {
    render(<WhoisView domain="example.com" whois={{ ...whois, expiresAt: undefined }} />);
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('bietet nichts an, wenn die Domain schon abgelaufen ist', () => {
    render(<WhoisView domain="example.com" whois={{ ...whois, expiresAt: inDays(-3) }} />);
    expect(calendarButton()).not.toBeInTheDocument();
  });

  it('bietet nichts an, wenn es keine WHOIS-Daten gibt', () => {
    render(<WhoisView domain="example.com" />);
    expect(calendarButton()).not.toBeInTheDocument();
  });
});
