import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LookupHistoryEntry } from '@/lib/lookupHistory';
import { SearchBar } from './SearchBar';

const entry = (domain: string, score: number): LookupHistoryEntry => ({
  domain,
  lookedUpAt: new Date().toISOString(),
  score,
  verdict: 'Hervorragend',
  recordCount: 4,
  ips: [],
  mx: [],
  nameservers: [],
  sslValid: true,
  dnssecValid: false,
  dmarcPresent: true,
  findingsCount: 0,
});

/**
 * #147: „mittwald.de 94“ stand in einer Schrift hintereinander — die Zahl las
 * sich wie ein Teil des Namens.
 */
describe('SearchBar — zuletzt geprüft', () => {
  it('setzt den Score von der Domain ab und benennt ihn', async () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} value="" onValueChange={() => {}} recent={[entry('mittwald.de', 94)]} />);

    const chip = screen.getByRole('button', { name: /^mittwald\.de/ });
    expect(within(chip).getByText('mittwald.de')).toHaveTextContent(/^mittwald\.de$/);
    expect(within(chip).getByText('Health Score')).toHaveClass('sr-only');
    expect(chip).toHaveTextContent(/94$/);

    await userEvent.click(chip);
    expect(onSearch).toHaveBeenCalledWith('mittwald.de');
  });
});
