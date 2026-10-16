import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DnsRecord } from '@/types/dns';
import { NULL_MX_EXPLANATION, RECORD_EXPLANATIONS } from '@/lib/explanations';
import { RecordsList } from './RecordsList';

/**
 * #76: MX, NS und TXT standen immer mit `0s` in der Liste. Eine unbekannte
 * TTL (`null`) muss als solche erkennbar sein — eine echte 0 aber bleibt 0.
 */

function row(value: string): HTMLElement {
  const cell = screen.getByText(value);
  const element = cell.closest<HTMLElement>('.grid');
  if (!element) throw new Error(`Keine Zeile für ${value}`);
  return element;
}

describe('RecordsList — TTL', () => {
  const records: DnsRecord[] = [
    { type: 'MX', name: 'example.com', value: 'mx1.example.com', priority: 10, ttl: 3600 },
    { type: 'TXT', name: 'example.com', value: 'v=spf1 -all', ttl: null },
    { type: 'CNAME', name: 'www.example.com', value: 'cdn.example.net', ttl: 0 },
  ];

  it('zeigt eine bekannte TTL in Sekunden', () => {
    render(<RecordsList records={records} />);
    expect(within(row('mx1.example.com')).getByText('3600s')).toBeInTheDocument();
  });

  it('zeigt „—“ statt 0s, wenn die TTL unbekannt ist — mit Klartext für Screenreader', () => {
    render(<RecordsList records={records} />);
    const txt = row('v=spf1 -all');

    expect(within(txt).getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect(within(txt).getByText('TTL unbekannt')).toBeInTheDocument();
    expect(within(txt).queryByText(/\d+s$/)).not.toBeInTheDocument();
  });

  it('lässt eine echte TTL von 0 als 0s stehen', () => {
    render(<RecordsList records={records} />);
    expect(within(row('cdn.example.net')).getByText('0s')).toBeInTheDocument();
  });
});

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

/**
 * Null-MX (RFC 7505, #120): der Resolver liefert das Ziel als leeren Namen.
 * Vorher stand in der Liste nur die Priorität „0“.
 */

const NULL_MX: DnsRecord = { type: 'MX', name: 'example.com', value: '', priority: 0, ttl: 3600 };
const nullMxBadge = () => screen.queryByText('Null-MX — keine Mails');

describe('RecordsList — Null-MX', () => {
  it('zeigt den Null-MX als „0 .“ mit Badge', () => {
    render(<RecordsList records={[NULL_MX]} />);
    const mx = row('.');

    expect(within(mx).getByText('0')).toBeInTheDocument();
    expect(within(mx).getByText('Null-MX — keine Mails')).toBeInTheDocument();
    expect(within(mx).getByText('3600s')).toBeInTheDocument();
  });

  it('erkennt auch die Zonendatei-Schreibweise „.“ — ohne doppelten Punkt', () => {
    render(<RecordsList records={[{ ...NULL_MX, value: '.' }]} />);
    expect(row('.')).toBeInTheDocument();
    expect(screen.queryByText('..')).not.toBeInTheDocument();
    expect(nullMxBadge()).toBeInTheDocument();
  });

  it('erklärt den Null-MX über das Erklärungsmodul', async () => {
    const user = userEvent.setup();
    render(<RecordsList records={[NULL_MX]} />);

    expect(infoLabels()).toEqual(['Was bedeutet MX?', 'Was bedeutet Null-MX?']);
    await user.click(screen.getByRole('button', { name: 'Was bedeutet Null-MX?' }));
    expect(screen.getByText(NULL_MX_EXPLANATION.text)).toBeInTheDocument();
  });

  it('lässt einen normalen MX unverändert — ohne Punkt und Badge', () => {
    render(<RecordsList records={RECORDS} />);

    expect(within(row('mx1.example.com')).getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('.')).not.toBeInTheDocument();
    expect(nullMxBadge()).not.toBeInTheDocument();
  });

  it('zeigt ein leeres Ziel neben weiteren MX als „.“, nennt es aber nicht Null-MX (RFC 7505: ungültig)', () => {
    const mx1: DnsRecord = { type: 'MX', name: 'example.com', value: 'mx1.example.com', priority: 10, ttl: 3600 };
    render(<RecordsList records={[NULL_MX, mx1]} />);

    expect(within(row('.')).getByText('0')).toBeInTheDocument();
    expect(within(row('mx1.example.com')).getByText('10')).toBeInTheDocument();
    expect(nullMxBadge()).not.toBeInTheDocument();
  });

  it('zeigt bei einer Priorität ungleich 0 den Punkt, aber kein Badge', () => {
    render(<RecordsList records={[{ ...NULL_MX, priority: 10 }]} />);
    expect(within(row('.')).getByText('10')).toBeInTheDocument();
    expect(nullMxBadge()).not.toBeInTheDocument();
  });

  it('behält das Badge, wenn der MX-Filter aktiv ist', async () => {
    const user = userEvent.setup();
    render(<RecordsList records={[NULL_MX, ...RECORDS.filter((r) => r.type !== 'MX')]} />);
    await user.click(screen.getByRole('button', { name: /^MX/ }));
    expect(nullMxBadge()).toBeInTheDocument();
  });
});
