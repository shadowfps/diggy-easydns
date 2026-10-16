import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DnsRecord } from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { QuickFacts } from './QuickFacts';

/** Alles außer den Records ist hier egal — die Sektionen laden noch nicht. */
const idle = <T,>(): SectionSlice<T> => ({ status: 'skipped', data: undefined });

function renderWithMx(mx: DnsRecord[]) {
  render(
    <QuickFacts
      records={[{ type: 'NS', name: 'example.com', value: 'a.iana-servers.net', ttl: 0 }, ...mx]}
      ssl={idle()}
      dnssec={idle()}
      mail={idle()}
      techStack={idle()}
    />
  );
  return screen.getByText('MX').nextElementSibling;
}

describe('QuickFacts — MX', () => {
  /** #77: Der Null-MX hat ein leeres Ziel — vorher stand hier ein leeres Feld. */
  it('zeigt beim Null-MX „keine Mails“ statt eines leeren Werts', () => {
    const mx = renderWithMx([{ type: 'MX', name: 'example.com', value: '', priority: 0, ttl: 0 }]);
    expect(mx).toHaveTextContent('keine Mails (Null-MX)');
  });

  it('zeigt einen echten MX wie bisher', () => {
    const mx = renderWithMx([
      { type: 'MX', name: 'example.de', value: 'mx1.example.de', priority: 10, ttl: 0 },
    ]);
    expect(mx).toHaveTextContent('mx1.example.de');
  });

  it('zeigt ohne MX einen Strich', () => {
    expect(renderWithMx([])).toHaveTextContent('—');
  });
});
