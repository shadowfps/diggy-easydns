import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MailSecurity } from '@/types/dns';
import { MailView } from './MailView';

/** Mail-Karten bei gescheiterter Abfrage: „nicht prüfbar“ statt „fehlt“ (#101). */

const missing: MailSecurity = {
  spf: { present: false, valid: false, issues: [] },
  dmarc: { present: false },
  dkim: { selectors: [] },
  mtaSts: { present: false },
  hasMx: true,
};

describe('MailView', () => {
  it('zeigt gescheiterte Abfragen je Karte als nicht prüfbar, mit Grund', () => {
    render(
      <MailView
        mail={{
          spf: { ...missing.spf, lookupFailed: 'timeout' },
          dmarc: { present: false, lookupFailed: 'servfail' },
          dkim: { selectors: [], lookupFailed: 'timeout' },
          mtaSts: { present: false, lookupFailed: 'network' },
          hasMx: true,
        }}
      />
    );

    expect(screen.getAllByText('nicht prüfbar')).toHaveLength(4);
    expect(
      screen.getByText(/TXT-Abfrage der Domain scheiterte \(Zeitüberschreitung\)/)
    ).toBeInTheDocument();
    expect(screen.getByText(/_dmarc\.<domain> scheiterte \(SERVFAIL\)/)).toBeInTheDocument();
    expect(screen.getByText(/_mta-sts\.<domain> scheiterte \(Netzwerkfehler\)/)).toBeInTheDocument();
    expect(screen.queryByText('Kein SPF-Record gefunden')).not.toBeInTheDocument();
    expect(screen.queryByText('Kein DMARC-Record auf _dmarc.<domain>')).not.toBeInTheDocument();
    expect(screen.queryByText('nicht eingerichtet')).not.toBeInTheDocument();
  });

  it('zeigt echtes Fehlen wie bisher', () => {
    render(<MailView mail={missing} />);

    expect(screen.getByText('Kein SPF-Record gefunden')).toBeInTheDocument();
    expect(screen.getByText('Kein DMARC-Record auf _dmarc.<domain>')).toBeInTheDocument();
    expect(screen.getByText('nicht eingerichtet')).toBeInTheDocument();
    expect(screen.queryByText('nicht prüfbar')).not.toBeInTheDocument();
  });
});
