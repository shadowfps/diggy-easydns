import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecordType, ResolverResult } from '@/types/dns';
import { PropagationView } from './PropagationView';

/**
 * #82: Für DNS-Einträge vergleicht die Ansicht TXT und CNAME. Ein
 * DKIM-Schlüssel ist rund 410 Zeichen lang — die Tests prüfen, dass er lesbar
 * bleibt und eine Abweichung nicht nur an der Farbe zu erkennen ist.
 */

const NEW_KEY =
  'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA' +
  'x'.repeat(300) +
  'NEUESENDEwIDAQAB';
const OLD_KEY =
  'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA' +
  'y'.repeat(300) +
  'ALTESENDEwIDAQAB';

const NAMES = ['Cloudflare', 'Google', 'AdGuard', 'DNS.SB', 'NextDNS'];

function results(answers: ([RecordType, string][] | { error: string })[]): ResolverResult[] {
  return answers.map((answer, i) => ({
    resolver: {
      id: NAMES[i].toLowerCase(),
      name: NAMES[i],
      ip: '0.0.0.0',
      country: 'X',
      flag: '',
      provider: NAMES[i],
    },
    records: Array.isArray(answer)
      ? answer.map(([type, value]) => ({ type, name: 's1._domainkey.example.com', value, ttl: 3600 }))
      : [],
    responseTimeMs: 20,
    ...(Array.isArray(answer) ? {} : { error: answer.error }),
  }));
}

const DNS_ENTRY: RecordType[] = ['TXT', 'CNAME'];

describe('PropagationView — TXT', () => {
  it('kürzt einen langen DKIM-Schlüssel und zeigt ihn auf Wunsch ganz', async () => {
    render(
      <PropagationView
        results={results([[['TXT', NEW_KEY]], [['TXT', NEW_KEY]], [['TXT', NEW_KEY]]])}
        types={DNS_ENTRY}
      />
    );

    // Gleiche Antworten stehen einmal da, nicht dreimal untereinander.
    const answer = screen.getByRole('region', { name: 'Antwort A' });
    expect(within(answer).getByText('Cloudflare, Google, AdGuard')).toBeInTheDocument();
    expect(screen.queryByText(NEW_KEY)).not.toBeInTheDocument();
    // Anfang und Ende bleiben sichtbar — am Ende unterscheiden sich Schlüssel.
    expect(answer).toHaveTextContent(/v=DKIM1; k=rsa; p=MIIB.*NEUESENDEwIDAQAB/);

    const toggle = within(answer).getByRole('button', { name: /Ganzen Wert zeigen/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    expect(screen.getByText(NEW_KEY)).toBeInTheDocument();
    expect(within(answer).getByRole('button', { name: /Gekürzt zeigen/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText(/Alle Resolver liefern denselben TXT-Record/)).toBeInTheDocument();
  });

  it('kennzeichnet den Resolver mit dem alten Schlüssel in Worten', () => {
    render(
      <PropagationView
        results={results([[['TXT', NEW_KEY]], [['TXT', OLD_KEY]], [['TXT', NEW_KEY]]])}
        types={DNS_ENTRY}
      />
    );

    // Zeile: Verweis auf die Antwort und „weicht ab“ — nicht nur gelb.
    expect(screen.getByText(/Antwort B · weicht ab/)).toBeInTheDocument();
    // Zwei Zeilen und die Überschrift der Antwort darunter.
    expect(screen.getAllByText('Antwort A')).toHaveLength(3);

    const majority = screen.getByRole('region', { name: 'Antwort A' });
    expect(within(majority).getByText('Mehrheit')).toBeInTheDocument();
    expect(majority).toHaveTextContent('NEUESENDEwIDAQAB');

    const deviating = screen.getByRole('region', { name: 'Antwort B' });
    expect(within(deviating).getByText('Google')).toBeInTheDocument();
    expect(within(deviating).getByText('weicht ab')).toBeInTheDocument();
    expect(deviating).toHaveTextContent('ALTESENDEwIDAQAB');

    expect(screen.getByText(/1 von 3 Resolvern weicht ab/)).toBeInTheDocument();
  });

  it('zählt einen Resolver ohne den neuen Eintrag als abweichend', () => {
    render(
      <PropagationView
        results={results([[['TXT', NEW_KEY]], [], [['TXT', NEW_KEY]], { error: 'Timeout' }])}
        types={DNS_ENTRY}
      />
    );

    expect(screen.getByText(/kein Eintrag · weicht ab/)).toBeInTheDocument();
    // Ein Fehler ist keine Abweichung, sondern ein Fehler — und zählt wie im
    // Befund nicht mit.
    expect(screen.getByText('Timeout')).toBeInTheDocument();
    expect(screen.getByText(/1 von 3 Resolvern weicht ab/)).toBeInTheDocument();
  });

  it('bietet keine IP-Details für TXT und CNAME an', async () => {
    render(
      <PropagationView
        results={results([
          [['CNAME', 'sel1.dkim.provider.net'], ['TXT', 'v=DKIM1; p=kurz']],
          [['CNAME', 'sel1.dkim.provider.net'], ['TXT', 'v=DKIM1; p=kurz']],
        ])}
        types={DNS_ENTRY}
      />
    );

    expect(screen.queryByRole('button', { name: /Details zu/ })).not.toBeInTheDocument();
    // Kurze Werte brauchen keinen Umschalter.
    expect(screen.queryByRole('button', { name: /Ganzen Wert zeigen/ })).not.toBeInTheDocument();

    // Der CNAME steht wie der TXT-Wert einmal unter der Liste — neben dem
    // Resolver-Namen ist auf dem Handy kein Platz für einen Hostnamen.
    await userEvent.click(screen.getByRole('button', { name: 'CNAME' }));
    expect(screen.getByRole('region', { name: 'Antwort A' })).toHaveTextContent(
      'sel1.dkim.provider.net'
    );
    expect(screen.getAllByText('sel1.dkim.provider.net')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Details zu/ })).not.toBeInTheDocument();
    expect(screen.getByText(/denselben CNAME-Record/)).toBeInTheDocument();
  });

  it('sagt, wenn unter dem Namen weder TXT noch CNAME liegt', () => {
    render(<PropagationView results={results([[], []])} types={DNS_ENTRY} />);
    expect(
      screen.getByText('Kein Resolver liefert einen TXT- oder CNAME-Record unter diesem Namen.')
    ).toBeInTheDocument();
  });
});

describe('PropagationView — Hosts', () => {
  it('verlinkt A-Records weiter auf die IP-Details', () => {
    render(
      <PropagationView
        results={results([
          [['CNAME', 'cdn.example.net'], ['A', '192.0.2.1']],
          [['CNAME', 'cdn.example.net'], ['A', '192.0.2.1']],
        ])}
        types={['A', 'AAAA']}
      />
    );

    expect(screen.getAllByRole('button', { name: 'Details zu 192.0.2.1 anzeigen' })).toHaveLength(2);
    // Der CNAME aus der Antwortkette ist bei Hosts kein eigener Umschalter.
    expect(screen.queryByRole('button', { name: 'CNAME' })).not.toBeInTheDocument();
    expect(screen.getByText(/DNS sauber propagiert/)).toBeInTheDocument();
  });
});
