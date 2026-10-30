import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { DetectedTech, DnsRecord, DnssecInfo, MailSecurity, SslInfo } from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { QuickFacts } from './QuickFacts';

/** Zeile der Schnellübersicht: ein LabeledValue, benannt nach seinem Label. */
const row = (label: string) => screen.getByRole('group', { name: label });

/** Bewertung einer Zeile — AlertText trägt ein Status-Icon mit Namen. */
const status = (label: string, name: 'Erfolg' | 'Fehler' | 'Nicht verfügbar') =>
  within(row(label)).queryByRole('img', { name: `Status "${name}"` });

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
  return row('MX');
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
    return row('DMARC');
  }

  it('zeigt eine gültige Policy wie bisher als gesetzt', () => {
    const value = renderWithDmarc({ present: true, record: 'v=DMARC1; p=none', policy: 'none' });
    expect(value).toHaveTextContent('gesetzt');
    expect(status('DMARC', 'Erfolg')).not.toBeNull();
  });

  it('nennt bei rua= ohne p= den Mangel, ohne Haken', () => {
    const value = renderWithDmarc({ present: true, record: 'v=DMARC1; rua=mailto:x@y' });
    expect(value).toHaveTextContent('p= fehlt');
    expect(status('DMARC', 'Erfolg')).toBeNull();
    expect(status('DMARC', 'Fehler')).toBeNull();
  });

  it('zeigt einen ignorierten Record als unwirksam', () => {
    const value = renderWithDmarc({ present: true, record: 'v=DMARC1; sp=reject' });
    expect(value).toHaveTextContent('unwirksam');
    expect(status('DMARC', 'Fehler')).not.toBeNull();
  });

  it('nennt ein ungültiges sp= neben p=reject', () => {
    const value = renderWithDmarc({
      present: true,
      record: 'v=DMARC1; p=reject; sp=foo; rua=mailto:x@y',
      policy: 'reject',
    });
    expect(value).toHaveTextContent('sp= ungültig');
    expect(status('DMARC', 'Erfolg')).toBeNull();
  });

  it('zeigt mehrere Records als unwirksam', () => {
    const records = ['v=DMARC1; p=reject', 'v=DMARC1; p=none'];
    const value = renderWithDmarc({ present: true, record: records[0], records, policy: 'reject' });
    expect(value).toHaveTextContent('unwirksam');
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

/** Wert der Zeile mit diesem Label — ohne das Label selbst. */
const fact = (label: string) => row(label).textContent?.slice(label.length);

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
    // Neutral, nicht als Fehler (#101).
    expect(status('SSL', 'Nicht verfügbar')).not.toBeNull();
    expect(status('SSL', 'Fehler')).toBeNull();
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

describe('QuickFacts — Nameserver und Stack', () => {
  it('verlinkt Nameserver und Mailserver auf ihren eigenen Report (#147)', () => {
    render(
      <QuickFacts
        records={[
          { type: 'NS', name: 'example.com', value: 'a.iana-servers.net', ttl: 0 },
          { type: 'MX', name: 'example.com', value: 'mx.example.net', priority: 10, ttl: 0 },
        ]}
        ssl={idle()}
        dnssec={idle()}
        mail={idle()}
        techStack={idle()}
      />
    );
    expect(screen.getByRole('link', { name: /^a\.iana-servers\.net/ })).toHaveAttribute(
      'href',
      '/lookup/a.iana-servers.net'
    );
    expect(screen.getByRole('link', { name: /^mx\.example\.net/ })).toHaveAttribute('href', '/lookup/mx.example.net');
  });

  it('nennt die erkannten Technologien mit Version', () => {
    render(
      <QuickFacts
        records={[]}
        ssl={idle()}
        dnssec={idle()}
        mail={idle()}
        techStack={{
          status: 'done',
          data: [
            { name: 'React', category: 'library', confidence: 'high' },
            { name: 'nginx', category: 'server', version: '1.25', confidence: 'high' },
          ],
        }}
      />
    );
    const stack = row('Stack');
    expect(stack).toHaveTextContent('nginx 1.25');
    expect(stack).toHaveTextContent('React');
  });
});
