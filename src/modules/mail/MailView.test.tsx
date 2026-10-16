import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MailSecurity } from '@/types/dns';
import { MAIL_EXPLANATIONS } from '@/lib/explanations';
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
  /** Scheiterte eine Abfrage (#101), ist offen, ob dort etwas fehlt. */
  it('nennt gescheiterte SPF- und DMARC-Abfragen „nicht prüfbar“ statt „fehlt“', () => {
    render(
      <MailView
        mail={{
          ...exampleCom,
          spf: { present: false, valid: false, issues: [], lookupFailed: 'timeout' },
          dmarc: { present: false, lookupFailed: 'servfail' },
        }}
      />
    );
    const card = screen.getByRole('heading', { name: 'Keine Mails (Null-MX)' }).closest('.card');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText('fehlt')).not.toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByText('nicht prüfbar')).toHaveLength(2);
  });

  /** Ohne Mail sind DKIM und MTA-STS nicht nötig — auch wenn eine Probe scheiterte. */
  it('zeigt DKIM und MTA-STS als nicht nötig, auch wenn ihre Abfrage scheiterte', () => {
    render(
      <MailView
        mail={{
          ...exampleCom,
          dkim: { selectors: [], lookupFailed: 'timeout' },
          mtaSts: { present: false, lookupFailed: 'network' },
        }}
      />
    );
    expect(screen.getByText(/Nicht nötig: Eine Domain ohne Mails/)).toBeInTheDocument();
    expect(screen.getByText('nicht nötig')).toBeInTheDocument();
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
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

/** #83: BIMI und TLS-RPT als eigene Karten, Status als Badge mit Icon und Wort. */
describe('MailView — BIMI und TLS-RPT', () => {
  const withMx: MailSecurity = {
    ...exampleCom,
    nullMx: false,
    bimi: { present: false },
    tlsRpt: { present: false },
  };

  /** Die Karte, in der eine Überschrift steht. */
  const card = (name: string) =>
    screen.getByRole('heading', { name }).closest('.card') as HTMLElement;

  it('zeigt bei älteren Antworten ohne die Felder keine Karten', () => {
    render(<MailView mail={{ ...exampleCom, nullMx: false }} />);
    expect(screen.queryByRole('heading', { name: 'BIMI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'TLS-RPT' })).not.toBeInTheDocument();
  });

  it('zeigt fehlende Records als „fehlt“', () => {
    render(<MailView mail={withMx} />);
    expect(within(card('BIMI')).getByText('fehlt')).toBeInTheDocument();
    expect(within(card('BIMI')).getByText(/Die DMARC-Voraussetzung ist erfüllt/)).toBeInTheDocument();
    expect(within(card('TLS-RPT')).getByText('fehlt')).toBeInTheDocument();
    expect(within(card('TLS-RPT')).getByText(/Kein TLS-RPT-Record auf _smtp\._tls/)).toBeInTheDocument();
  });

  it('verlinkt das Logo, statt es zu laden', () => {
    const logoUrl = 'https://www.paypalobjects.com/marketing/web/logos/paypal_ppe.svg';
    render(
      <MailView
        mail={{
          ...withMx,
          bimi: {
            present: true,
            records: [`v=BIMI1; l=${logoUrl}; a=https://example.com/vmc.pem`],
            logoUrl,
            evidenceUrl: 'https://example.com/vmc.pem',
          },
        }}
      />
    );
    const bimi = card('BIMI');
    expect(within(bimi).getByText('aktiv')).toBeInTheDocument();
    const link = within(bimi).getByRole('link', { name: /paypal_ppe\.svg/ });
    expect(link).toHaveAttribute('href', logoUrl);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('link');
    expect(within(bimi).getByText('hinterlegt')).toBeInTheDocument();
    expect(bimi.querySelector('img')).toBeNull();
  });

  it('macht aus einer Nicht-https-URL keinen Link', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          bimi: { present: true, records: ['v=BIMI1; l=x'], logoUrl: 'javascript:alert(1)' },
        }}
      />
    );
    expect(within(card('BIMI')).queryByRole('link')).not.toBeInTheDocument();
  });

  it('sagt bei DMARC p=none, dass das Logo nicht erscheint', () => {
    const dmarcNone: MailSecurity['dmarc'] = { present: true, record: 'v=DMARC1; p=none', policy: 'none' };
    const { unmount } = render(
      <MailView
        mail={{
          ...withMx,
          dmarc: dmarcNone,
          bimi: { present: true, records: ['v=BIMI1; l=https://example.com/l.svg'], logoUrl: 'https://example.com/l.svg' },
        }}
      />
    );
    expect(within(card('BIMI')).getByText('wirkt nicht')).toBeInTheDocument();
    expect(within(card('BIMI')).getByText(/erst bei DMARC mit p=quarantine oder p=reject, jetzt: DMARC p=none/)).toBeInTheDocument();
    unmount();

    // Ohne Record: erst DMARC verschärfen statt BIMI empfehlen.
    render(<MailView mail={{ ...withMx, dmarc: dmarcNone }} />);
    expect(within(card('BIMI')).getByText(/Erst DMARC verschärfen/)).toBeInTheDocument();
  });

  it('zeigt den bewussten Verzicht und ungültige Records mit Grund', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          bimi: { present: true, records: ['v=BIMI1; l=; a=;'], declined: true },
          tlsRpt: {
            present: true,
            records: ['v=TLSRPTv1; rua=mailto:a@example.com', 'v=TLSRPTv1; rua=mailto:b@example.com'],
            invalid: '2 TLS-RPT-Records — RFC 8460 verlangt genau einen',
          },
        }}
      />
    );
    expect(within(card('BIMI')).getByText('abgemeldet')).toBeInTheDocument();
    const tlsRpt = card('TLS-RPT');
    expect(within(tlsRpt).getByText('ungültig')).toBeInTheDocument();
    expect(within(tlsRpt).getByText(/2 TLS-RPT-Records/)).toBeInTheDocument();
    expect(within(tlsRpt).getByText('v=TLSRPTv1; rua=mailto:b@example.com')).toBeInTheDocument();
  });

  it('listet alle Berichtsziele', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          tlsRpt: {
            present: true,
            records: ['v=TLSRPTv1; rua=mailto:a@example.com,https://r.example.net/'],
            rua: ['mailto:a@example.com', 'https://r.example.net/'],
          },
        }}
      />
    );
    const tlsRpt = card('TLS-RPT');
    expect(within(tlsRpt).getByText('aktiv')).toBeInTheDocument();
    expect(within(tlsRpt).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'mailto:a@example.com',
      'https://r.example.net/',
    ]);
  });

  /** Ausfall ≠ fehlt: dieselbe „nicht prüfbar“-Darstellung wie die übrigen Karten (#101). */
  it('zeigt eine gescheiterte Abfrage als „nicht prüfbar“, mit Grund', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          bimi: { present: false, lookupFailed: 'timeout' },
          tlsRpt: { present: false, lookupFailed: 'servfail' },
        }}
      />
    );
    expect(within(card('BIMI')).getByText('nicht prüfbar')).toBeInTheDocument();
    expect(within(card('BIMI')).getByText(/^Der BIMI-Check scheiterte \(Zeitüberschreitung\)/))
      .toBeInTheDocument();
    expect(within(card('TLS-RPT')).getByText('nicht prüfbar')).toBeInTheDocument();
    expect(within(card('TLS-RPT')).getByText(/^Der TLS-RPT-Check scheiterte \(SERVFAIL\)/))
      .toBeInTheDocument();
    expect(screen.queryByText('fehlt')).not.toBeInTheDocument();
  });

  /** Ob das Logo erscheint, hängt an DMARC — scheiterte dessen Abfrage, ist es offen. */
  it('zeigt BIMI als „unbekannt“, wenn DMARC nicht prüfbar war', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          dmarc: { present: false, lookupFailed: 'timeout' },
          bimi: {
            present: true,
            records: ['v=BIMI1; l=https://example.com/l.svg'],
            logoUrl: 'https://example.com/l.svg',
          },
        }}
      />
    );
    const bimi = card('BIMI');
    expect(within(bimi).getByText('unbekannt')).toBeInTheDocument();
    expect(within(bimi).getByText(/hängt an DMARC/)).toBeInTheDocument();
    expect(within(bimi).queryByText('wirkt nicht')).not.toBeInTheDocument();
    expect(within(bimi).queryByText(/kein DMARC-Record/)).not.toBeInTheDocument();
  });

  it('bleibt bei einer Domain ohne Mail „nicht nötig“, auch wenn die Abfrage scheiterte', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          nullMx: true,
          bimi: { present: false, lookupFailed: 'timeout' },
          tlsRpt: { present: false, lookupFailed: 'timeout' },
        }}
      />
    );
    expect(within(card('BIMI')).getByText('nicht nötig')).toBeInTheDocument();
    expect(within(card('TLS-RPT')).getByText('nicht nötig')).toBeInTheDocument();
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
  });

  it('erklärt beide bei einer Domain ohne Mail als nicht nötig', () => {
    render(<MailView mail={{ ...withMx, nullMx: true }} />);
    expect(within(card('BIMI')).getByText('nicht nötig')).toBeInTheDocument();
    expect(within(card('TLS-RPT')).getByText('nicht nötig')).toBeInTheDocument();
    expect(screen.queryByText('fehlt')).not.toBeInTheDocument();
  });
});

/**
 * #107: Ein DMARC-Record ohne gültiges p= sah im Mail-Tab aus wie jeder
 * andere. Jetzt steht der Mangel als Badge im Kopf, und die Karte bewertet
 * nach RFC 7489 §6.6.3: mit rua= wie p=none, ohne wie kein DMARC.
 */
describe('MailView — DMARC ohne gültiges p=', () => {
  const withMx: MailSecurity = { ...exampleCom, nullMx: false };
  const dmarcCard = () => screen.getByRole('heading', { name: 'DMARC' }).closest('.card') as HTMLElement;
  const record = (value: string): MailSecurity['dmarc'] => ({ present: true, record: value, rua: undefined });

  it('zeigt bei rua= ohne p=, dass der Record wie p=none wirkt', () => {
    render(
      <MailView mail={{ ...withMx, dmarc: { ...record('v=DMARC1; rua=mailto:x@y'), rua: 'mailto:x@y' } }} />
    );
    const card = dmarcCard();
    const badge = within(card).getByText('p= fehlt');
    expect(badge).toHaveClass('badge', 'badge-warning');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(within(card).getByText('wie none')).toBeInTheDocument();
    expect(within(card).getByText('rua gesetzt')).toBeInTheDocument();
    expect(
      within(card).getByText(/^Ohne gültiges p= werten Empfänger den Record wie p=none, weil rua= .*\(RFC 7489 §6\.6\.3\)/)
    ).toBeInTheDocument();
  });

  it('zeigt einen Record ohne p= und ohne rua= als unwirksam', () => {
    render(<MailView mail={{ ...withMx, dmarc: record('v=DMARC1; sp=reject') }} />);
    const card = dmarcCard();
    expect(within(card).getByText('p= fehlt')).toBeInTheDocument();
    expect(within(card).getByText('keine')).toBeInTheDocument();
    expect(within(card).getByText(/als gäbe es kein DMARC/)).toBeInTheDocument();
  });

  it('nennt ein ungültiges p= und eine Report-Adresse ohne mailto:', () => {
    render(
      <MailView
        mail={{ ...withMx, dmarc: { ...record('v=DMARC1; p=foo; rua=dmarc@example.com'), rua: 'dmarc@example.com' } }}
      />
    );
    const card = dmarcCard();
    expect(within(card).getByText('p= ungültig')).toBeInTheDocument();
    expect(within(card).getByText('rua ungültig')).toBeInTheDocument();
    expect(within(card).getByText(/^Ohne gültiges p= und ohne gültige Report-Adresse/)).toBeInTheDocument();
  });

  /** §6.6.3 Schritt 6: Ein ungültiges sp= entwertet auch ein gültiges p=. */
  it('zeigt ein ungültiges sp= neben p=reject als Mangel', () => {
    render(
      <MailView
        mail={{
          ...withMx,
          dmarc: { ...record('v=DMARC1; p=reject; sp=foo; rua=mailto:x@y'), policy: 'reject', rua: 'mailto:x@y' },
        }}
      />
    );
    const card = dmarcCard();
    expect(within(card).getByText('sp= ungültig')).toHaveClass('badge', 'badge-warning');
    expect(within(card).getByText('wie none')).toBeInTheDocument();
    expect(within(card).getByText(/^Ein ungültiges sp= macht den ganzen Record ungültig, auch p=reject\./)).toBeInTheDocument();
  });

  /** §6.6.3 Schritt 5: Bei mehreren Records wenden Empfänger DMARC gar nicht an. */
  it('zeigt mehrere Records alle und als unwirksam', () => {
    const records = ['v=DMARC1; p=reject; rua=mailto:x@y', 'v=DMARC1; p=none'];
    render(
      <MailView
        mail={{ ...withMx, dmarc: { present: true, record: records[0], records, policy: 'reject', rua: 'mailto:x@y' } }}
      />
    );
    const card = dmarcCard();
    expect(within(card).getByText('2 Records')).toHaveClass('badge', 'badge-warning');
    for (const value of records) expect(within(card).getByText(value)).toBeInTheDocument();
    expect(within(card).getByText('keine')).toBeInTheDocument();
    // Gilt keiner, gehen auch keine Berichte raus.
    expect(within(card).queryByText('rua gesetzt')).not.toBeInTheDocument();
    expect(within(card).getByText(/mehr als einem DMARC-Record wenden Empfänger DMARC gar nicht an/)).toBeInTheDocument();
  });

  it('zeigt ohne MX das Badge ohne Warnfarbe — wie den fehlenden Record', () => {
    render(<MailView mail={{ ...withMx, hasMx: false, dmarc: record('v=DMARC1') }} />);
    const badge = within(dmarcCard()).getByText('p= fehlt');
    expect(badge).toHaveClass('badge');
    expect(badge).not.toHaveClass('badge-warning');
  });

  it('lässt korrekte Records ohne Badge', () => {
    render(<MailView mail={withMx} />);
    const card = dmarcCard();
    expect(within(card).getByText('reject')).toBeInTheDocument();
    expect(within(card).queryByText(/p= fehlt|p= ungültig/)).not.toBeInTheDocument();
  });

  it('nennt den Mangel auch in der Null-MX-Karte und beim BIMI-Hinweis', () => {
    render(
      <MailView
        mail={{
          ...exampleCom,
          dmarc: { ...record('v=DMARC1; sp=reject; rua=mailto:dmarc@example.net'), rua: 'mailto:dmarc@example.net' },
        }}
      />
    );
    expect(screen.getByText('wie none, p= fehlt')).toBeInTheDocument();
    expect(screen.getByText(/gehören SPF -all und DMARC p=reject dazu/)).toBeInTheDocument();
    cleanup();

    render(<MailView mail={{ ...withMx, dmarc: record('v=DMARC1; p=foo'), bimi: { present: false } }} />);
    const bimi = screen.getByRole('heading', { name: 'BIMI' }).closest('.card') as HTMLElement;
    expect(within(bimi).getByText(/jetzt: DMARC wirkt nicht \(p=foo ist ungültig\)/)).toBeInTheDocument();
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

/** Jede Mail-Karte erklärt ihren Begriff über ein „?“ neben dem Titel (#80). */

const EXPLAINED: MailSecurity = {
  spf: { present: true, record: 'v=spf1 -all', lookupCount: 0, valid: true, issues: [] },
  dmarc: { present: true, record: 'v=DMARC1; p=reject', policy: 'reject' },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
  nullMx: false,
  bimi: { present: false },
  tlsRpt: { present: false },
};

describe('MailView — Erklärungen', () => {
  it.each(['SPF', 'DKIM', 'DMARC', 'MTA-STS', 'BIMI', 'TLS-RPT'] as const)('erklärt %s', async (term) => {
    const user = userEvent.setup();
    render(<MailView mail={EXPLAINED} />);

    // Der Button steht neben der Überschrift, nicht in ihr — sonst würde der
    // Popover-Text Teil des Überschriftennamens.
    const heading = screen.getByRole('heading', { name: term });
    const button = screen.getByRole('button', { name: `Was bedeutet ${term}?` });
    expect(heading).not.toContainElement(button);

    await user.click(button);
    expect(screen.getByText(MAIL_EXPLANATIONS[term].text)).toBeInTheDocument();
  });

  it('setzt kein „?“ an die Null-MX-Karte — ihr Titel ist kein Fachbegriff', () => {
    render(<MailView mail={{ ...EXPLAINED, nullMx: true }} />);
    expect(screen.getByRole('heading', { name: 'Keine Mails (Null-MX)' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Was bedeutet / })).toHaveLength(6);
  });
});
