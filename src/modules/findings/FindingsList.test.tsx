import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Finding } from '@/types/dns';
import { FindingsList } from './FindingsList';

const info = (id: string, title: string, advisory?: boolean): Finding => ({
  id,
  severity: 'info',
  title,
  description: '',
  category: 'mail',
  ...(advisory ? { advisory } : {}),
});

/** #83: Empfehlungen ohne Abzug sehen sonst aus wie jeder andere Hinweis. */
describe('FindingsList — Empfehlungen ohne Abzug', () => {
  it('kennzeichnet nur die Empfehlungen', () => {
    render(
      <FindingsList
        findings={[info('no-bimi', 'Kein BIMI-Record', true), info('no-caa', 'Kein CAA-Record')]}
      />
    );
    expect(screen.getAllByText(/ohne Punktabzug/)).toHaveLength(1);
    // Der Name der Überschrift enthält ihr Status-Badge — deshalb per Anfang.
    const row = screen.getByRole('heading', { name: /^Kein BIMI-Record/ }).parentElement;
    expect(row).toHaveTextContent('Mail · ohne Punktabzug');
  });
});
