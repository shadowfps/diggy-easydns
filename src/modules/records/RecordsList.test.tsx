import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { DnsRecord } from '@/types/dns';
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
