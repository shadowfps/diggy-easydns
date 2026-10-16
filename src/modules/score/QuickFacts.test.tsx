import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DetectedTech, DnsRecord, DnssecInfo, MailSecurity, SslInfo } from '@/types/dns';
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

/** Schnellübersicht: „nicht prüfbar“ statt „kein Cert“/„inaktiv“/„fehlt“ (#101). */

const MAIL: MailSecurity = {
  spf: { present: false, valid: false, issues: [] },
  dmarc: { present: false },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: false,
  nullMx: false,
};
const DNSSEC_OFF: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };
const TECH: SectionSlice<DetectedTech[]> = { status: 'done', data: [] };

/** Wert der Zeile mit diesem Label. */
const fact = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('QuickFacts — nicht prüfbar', () => {
  it('zeigt gescheiterte Checks als „nicht prüfbar“', () => {
    render(
      <QuickFacts
        records={[]}
        ssl={{ status: 'done', data: null, lookupFailed: 'timeout' }}
        dnssec={{ status: 'done', data: { ...DNSSEC_OFF, lookupFailed: 'timeout' } }}
        mail={{
          status: 'done',
          data: { ...MAIL, dmarc: { present: false, lookupFailed: 'servfail' } },
        }}
        techStack={TECH}
      />
    );

    expect(fact('SSL')).toBe('nicht prüfbar');
    expect(fact('DNSSEC')).toBe('nicht prüfbar');
    expect(fact('DMARC')).toBe('nicht prüfbar');
  });

  it('zeigt ausgefallene Sektionen als „nicht prüfbar“, übersprungene als —', () => {
    render(
      <QuickFacts
        records={[]}
        ssl={{ status: 'skipped', data: undefined }}
        dnssec={{ status: 'error', data: undefined, error: 'x' }}
        mail={{ status: 'error', data: undefined, error: 'x' }}
        techStack={TECH}
      />
    );

    expect(fact('SSL')).toBe('—');
    expect(fact('DNSSEC')).toBe('nicht prüfbar');
    expect(fact('DMARC')).toBe('nicht prüfbar');
  });

  it('zeigt echtes Fehlen wie bisher', () => {
    render(
      <QuickFacts
        records={[]}
        ssl={{ status: 'done', data: null as SslInfo | null }}
        dnssec={{ status: 'done', data: DNSSEC_OFF }}
        mail={{ status: 'done', data: MAIL }}
        techStack={TECH}
      />
    );

    expect(fact('SSL')).toBe('kein Cert');
    expect(fact('DNSSEC')).toBe('inaktiv');
    expect(fact('DMARC')).toBe('fehlt');
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
  });
});
