import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DnsRecord } from '@/types/dns';
import { RECORD_EXPLANATIONS } from '@/lib/explanations';
import { RecordsList } from './RecordsList';

/**
 * Die Erklärungen (#80) in der Records-Liste: ein „?“ je Typ, nicht je Zeile.
 * Ohne IP-Records, damit kein IP-Details-Abruf startet.
 */

const RECORDS: DnsRecord[] = [
  { type: 'MX', name: 'example.com', value: 'mx1.example.com', priority: 10, ttl: 0 },
  { type: 'MX', name: 'example.com', value: 'mx2.example.com', priority: 20, ttl: 0 },
  { type: 'NS', name: 'example.com', value: 'ns1.example.com', ttl: 0 },
  { type: 'NS', name: 'example.com', value: 'ns2.example.com', ttl: 0 },
  { type: 'NS', name: 'example.com', value: 'ns3.example.com', ttl: 0 },
  { type: 'TXT', name: 'example.com', value: 'v=spf1 -all', ttl: 0 },
];

const infoLabels = () =>
  screen
    .getAllByRole('button', { name: /^Was bedeutet / })
    .map((button) => button.getAttribute('aria-label'));

describe('RecordsList — Erklärungen', () => {
  it('zeigt ein „?“ je Record-Typ, nicht je Zeile', () => {
    render(<RecordsList records={RECORDS} />);
    expect(infoLabels()).toEqual(['Was bedeutet MX?', 'Was bedeutet NS?', 'Was bedeutet TXT?']);
  });

  it('zeigt das „?“ auch, wenn ein Filter aktiv ist', async () => {
    const user = userEvent.setup();
    render(<RecordsList records={RECORDS} />);
    await user.click(screen.getByRole('button', { name: /^NS/ }));
    expect(infoLabels()).toEqual(['Was bedeutet NS?']);
  });

  it('klappt die Erklärung des Typs auf', async () => {
    const user = userEvent.setup();
    render(<RecordsList records={RECORDS} />);
    await user.click(screen.getByRole('button', { name: 'Was bedeutet MX?' }));
    expect(screen.getByText(RECORD_EXPLANATIONS.MX.text)).toBeInTheDocument();
  });
});
