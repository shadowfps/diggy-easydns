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

  /** Ein einzelner Mechanismus wie include: ist kein Wort für den Status. */
  it('fasst erlaubte Absender zusammen statt den Mechanismus zu zeigen', () => {
    render(
      <MailView
        mail={{
          ...exampleCom,
          spf: {
            present: true,
            record: 'v=spf1 include:_spf.example.net',
            lookupCount: 1,
            valid: true,
            issues: [],
          },
        }}
      />
    );
    expect(screen.getByText('erlaubt Absender')).toBeInTheDocument();
  });

  it('zeigt DMARC reject mit pct unter 100 nicht als erledigt', () => {
    render(
      <MailView
        mail={{
          ...exampleCom,
          dmarc: { present: true, record: 'v=DMARC1; p=reject; pct=0', policy: 'reject' },
        }}
      />
    );
    expect(screen.getByText('reject, pct=0')).toBeInTheDocument();
    expect(screen.getByText(/gehören SPF -all und DMARC p=reject dazu/)).toBeInTheDocument();
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

/** Mail-Karten bei gescheiterter Abfrage: „nicht prüfbar“ statt „fehlt“ (#101). */

const missing: MailSecurity = {
  spf: { present: false, valid: false, issues: [] },
  dmarc: { present: false },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
  nullMx: false,
};

describe('MailView — nicht prüfbar', () => {
  it('zeigt gescheiterte Abfragen je Karte als nicht prüfbar, mit Grund', () => {
    render(
      <MailView
        mail={{
          spf: { ...missing.spf, lookupFailed: 'timeout' },
          dmarc: { present: false, lookupFailed: 'servfail' },
          dkim: { selectors: [], lookupFailed: 'timeout' },
          mtaSts: { present: false, lookupFailed: 'network' },
          hasMx: true,
          nullMx: false,
        }}
      />
    );

    expect(screen.getAllByText('nicht prüfbar')).toHaveLength(4);
    expect(screen.getByText(/^Der SPF-Check scheiterte \(Zeitüberschreitung\)\. Ob SPF/))
      .toBeInTheDocument();
    expect(screen.getByText(/^Der DMARC-Check scheiterte \(SERVFAIL\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Der DKIM-Check scheiterte \(Zeitüberschreitung\)/))
      .toBeInTheDocument();
    expect(screen.getByText(/^Der MTA-STS-Check scheiterte \(Netzwerkfehler\)/))
      .toBeInTheDocument();
    expect(screen.queryByText('Kein SPF-Record gefunden')).not.toBeInTheDocument();
    expect(screen.queryByText('Kein DMARC-Record auf _dmarc.<domain>')).not.toBeInTheDocument();
    expect(screen.queryByText('nicht eingerichtet')).not.toBeInTheDocument();
  });

  // Ein gefundener Selector ist ein Ergebnis, auch wenn andere Proben scheiterten.
  it('zeigt DKIM mit Fund normal, auch wenn eine Probe scheiterte', () => {
    render(
      <MailView
        mail={{
          ...missing,
          dkim: { selectors: [{ selector: 'google', present: true }], lookupFailed: 'timeout' },
        }}
      />
    );

    expect(screen.getByText('google._domainkey')).toBeInTheDocument();
    expect(screen.queryByText(/DKIM-Check scheiterte/)).not.toBeInTheDocument();
  });

  it('zeigt echtes Fehlen wie bisher', () => {
    render(<MailView mail={missing} />);

    expect(screen.getByText('Kein SPF-Record gefunden')).toBeInTheDocument();
    expect(screen.getByText('Kein DMARC-Record auf _dmarc.<domain>')).toBeInTheDocument();
    expect(screen.getByText('nicht eingerichtet')).toBeInTheDocument();
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
  });
});
