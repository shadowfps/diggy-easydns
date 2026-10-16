import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MailSecurity } from '@/types/dns';
import { MailView } from './MailView';

/**
 * #77: Für eine Domain ohne Mail (Null-MX) markierte der Mail-Tab DKIM und
 * MTA-STS als fehlend — dort sind sie aber gar nicht nötig.
 */

const exampleCom: MailSecurity = {
  spf: { present: true, record: 'v=spf1 -all', lookupCount: 0, valid: true, issues: [] },
  dmarc: { present: true, record: 'v=DMARC1;p=reject', policy: 'reject' },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
  nullMx: true,
};

describe('MailView — Domain ohne Mail (Null-MX)', () => {
  it('sagt oben, dass die Domain keine Mails annimmt', () => {
    render(<MailView mail={exampleCom} />);
    expect(screen.getByRole('heading', { name: 'Keine Mails (Null-MX)' })).toBeInTheDocument();
    expect(screen.getByText(/SPF und DMARC sorgen dafür/)).toBeInTheDocument();
  });

  it('erklärt DKIM und MTA-STS als nicht nötig statt als fehlend', () => {
    render(<MailView mail={exampleCom} />);
    expect(screen.getByText(/Nicht nötig: Eine Domain ohne Mails/)).toBeInTheDocument();
    expect(screen.getByText('nicht nötig')).toBeInTheDocument();
    expect(screen.queryByText('nicht eingerichtet')).not.toBeInTheDocument();
    expect(screen.queryByText(/Keine gängigen DKIM-Selectors/)).not.toBeInTheDocument();
  });

  it('nennt, was für den Schutz vor Fälschungen noch fehlt', () => {
    render(
      <MailView
        mail={{
          ...exampleCom,
          spf: { present: true, record: 'v=spf1 ~all', lookupCount: 0, valid: true, issues: [] },
          dmarc: { present: false },
        }}
      />
    );
    expect(screen.getByText(/gehören SPF -all und DMARC p=reject dazu/)).toBeInTheDocument();
    expect(screen.getByText('~all')).toBeInTheDocument();
    expect(screen.getByText('fehlt')).toBeInTheDocument();
  });
});

describe('MailView — Domain mit echtem MX', () => {
  it('zeigt fehlendes DKIM und MTA-STS wie bisher', () => {
    render(<MailView mail={{ ...exampleCom, nullMx: false }} />);
    expect(screen.queryByRole('heading', { name: 'Keine Mails (Null-MX)' })).not.toBeInTheDocument();
    expect(screen.getByText('nicht eingerichtet')).toBeInTheDocument();
    expect(screen.getByText(/Keine gängigen DKIM-Selectors/)).toBeInTheDocument();
  });
});
