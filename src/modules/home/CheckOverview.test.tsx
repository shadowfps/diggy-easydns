import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CheckOverview } from './CheckOverview';

describe('CheckOverview', () => {
  it('zeigt die sechs Bereiche als Liste unter einer benannten Überschrift', () => {
    render(<CheckOverview />);
    const region = screen.getByRole('region', { name: 'Sechs Bereiche, ein Befund' });
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Records',
      'Mail-Schutz',
      'SSL / TLS',
      'DNSSEC',
      'Propagation',
      'WHOIS / RDAP',
    ]);
  });
});
