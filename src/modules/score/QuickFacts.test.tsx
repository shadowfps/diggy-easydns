import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DnsRecord, MailSecurity } from '@/types/dns';
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

/** #107: Ein Record ohne gültiges p= ist nicht „gesetzt“. */
describe('QuickFacts — DMARC', () => {
  function renderWithDmarc(dmarc: MailSecurity['dmarc']) {
    const mail: MailSecurity = {
      spf: { present: false, valid: false, issues: [] },
      dmarc,
      dkim: { selectors: [] },
      mtaSts: { present: false },
      hasMx: true,
      nullMx: false,
    };
    render(
      <QuickFacts
        records={[]}
        ssl={idle()}
        dnssec={idle()}
        mail={{ status: 'done', data: mail }}
        techStack={idle()}
      />
    );
    return screen.getByText('DMARC').nextElementSibling as HTMLElement;
  }

  it('zeigt eine gültige Policy wie bisher als gesetzt', () => {
    const value = renderWithDmarc({ present: true, record: 'v=DMARC1; p=none', policy: 'none' });
    expect(value).toHaveTextContent('gesetzt');
    expect(value.querySelector('.text-success')).not.toBeNull();
  });

  it('nennt bei rua= ohne p= den Mangel, ohne Haken', () => {
    const value = renderWithDmarc({ present: true, record: 'v=DMARC1; rua=mailto:x@y' });
    expect(value).toHaveTextContent('p= fehlt');
    expect(value.querySelector('.text-success, .text-danger')).toBeNull();
  });

  it('zeigt einen ignorierten Record als unwirksam', () => {
    const value = renderWithDmarc({ present: true, record: 'v=DMARC1; sp=reject' });
    expect(value).toHaveTextContent('unwirksam');
    expect(value.querySelector('.text-danger')).not.toBeNull();
  });

  it('nennt ein ungültiges sp= neben p=reject', () => {
    const value = renderWithDmarc({
      present: true,
      record: 'v=DMARC1; p=reject; sp=foo; rua=mailto:x@y',
      policy: 'reject',
    });
    expect(value).toHaveTextContent('sp= ungültig');
    expect(value.querySelector('.text-success')).toBeNull();
  });

  it('zeigt mehrere Records als unwirksam', () => {
    const records = ['v=DMARC1; p=reject', 'v=DMARC1; p=none'];
    const value = renderWithDmarc({ present: true, record: records[0], records, policy: 'reject' });
    expect(value).toHaveTextContent('unwirksam');
  });
});
