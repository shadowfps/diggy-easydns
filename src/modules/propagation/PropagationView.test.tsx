import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DnsRecord, RecordType, ResolverResult } from '@/types/dns';
import { defaultPropagationType, type PropagationRecordType } from '@/lib/propagation';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  lookupPropagation: vi.fn(),
}));

const api = await import('@/lib/api');
const { PropagationView } = await import('./PropagationView');

/**
 * #82: Für DNS-Einträge vergleicht die Ansicht TXT und CNAME. Ein
 * DKIM-Schlüssel ist rund 410 Zeichen lang — die Tests prüfen, dass er lesbar
 * bleibt und eine Abweichung nicht nur an der Farbe zu erkennen ist.
 *
 * #131: Jeder Typ aus der Auswahl lässt sich vergleichen; was der Report
 * nicht mitlädt, fragt die Ansicht erst bei Auswahl ab. Dazu die TTL je
 * Resolver und wann abweichende Resolver spätestens neu fragen.
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

type Answer =
  | [RecordType, string][]
  | { error: string }
  | { records: (Omit<DnsRecord, 'name'> & { name?: string })[]; negativeTtl?: ResolverResult['negativeTtl'] };

function results(answers: Answer[]): ResolverResult[] {
  return answers.map((answer, i) => {
    const resolver = {
      id: NAMES[i].toLowerCase(),
      name: NAMES[i],
      ip: '0.0.0.0',
      country: 'X',
      flag: '',
      provider: NAMES[i],
    };
    if (Array.isArray(answer)) {
      return {
        resolver,
        records: answer.map(([type, value]) => ({ type, name: 's1._domainkey.example.com', value, ttl: 3600 })),
        responseTimeMs: 20,
      };
    }
    if ('error' in answer) return { resolver, records: [], responseTimeMs: 20, error: answer.error };
    return {
      resolver,
      records: answer.records.map((r) => ({ name: 'example.com', ...r })),
      responseTimeMs: 20,
      ...(answer.negativeTtl && { negativeTtl: answer.negativeTtl }),
    };
  });
}

/** Wie in App.tsx: der gewählte Typ steht außerhalb der Ansicht. */
function View({
  results: data,
  types,
  initial,
  onTypeChange,
}: {
  results: ResolverResult[];
  types: PropagationRecordType[];
  initial?: PropagationRecordType;
  onTypeChange?: (type: PropagationRecordType) => void;
}) {
  const [type, setType] = useState(initial ?? defaultPropagationType(data, types));
  return (
    <PropagationView
      domain="example.com"
      results={data}
      types={types}
      type={type}
      onTypeChange={(next) => {
        onTypeChange?.(next);
        setType(next);
      }}
    />
  );
}

const DNS_ENTRY: PropagationRecordType[] = ['TXT', 'CNAME'];
const HOST: PropagationRecordType[] = ['A', 'AAAA'];

const typeButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Record-Typ' })).getByRole('button', { name });

beforeEach(() => {
  vi.mocked(api.lookupPropagation).mockReset();
});

describe('PropagationView — TXT', () => {
  it('kürzt einen langen DKIM-Schlüssel und zeigt ihn auf Wunsch ganz', async () => {
    render(
      <View results={results([[['TXT', NEW_KEY]], [['TXT', NEW_KEY]], [['TXT', NEW_KEY]]])} types={DNS_ENTRY} />
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
      <View results={results([[['TXT', NEW_KEY]], [['TXT', OLD_KEY]], [['TXT', NEW_KEY]]])} types={DNS_ENTRY} />
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
      <View
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
      <View
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
    await userEvent.click(typeButton('CNAME'));
    expect(screen.getByRole('region', { name: 'Antwort A' })).toHaveTextContent(
      'sel1.dkim.provider.net'
    );
    expect(screen.getAllByText('sel1.dkim.provider.net')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Details zu/ })).not.toBeInTheDocument();
    expect(screen.getByText(/denselben CNAME-Record/)).toBeInTheDocument();
    // TXT und CNAME lädt der Report schon mit.
    expect(api.lookupPropagation).not.toHaveBeenCalled();
  });

  it('sagt, wenn unter dem Namen weder TXT noch CNAME liegt', () => {
    render(<View results={results([[], []])} types={DNS_ENTRY} />);
    expect(
      screen.getByText('Kein Resolver liefert einen TXT- oder CNAME-Record unter diesem Namen.')
    ).toBeInTheDocument();
  });
});

describe('PropagationView — Hosts', () => {
  it('verlinkt A-Records weiter auf die IP-Details', () => {
    render(
      <View
        results={results([
          [['CNAME', 'cdn.example.net'], ['A', '192.0.2.1']],
          [['CNAME', 'cdn.example.net'], ['A', '192.0.2.1']],
        ])}
        types={HOST}
      />
    );

    expect(screen.getAllByRole('button', { name: 'Details zu 192.0.2.1 anzeigen' })).toHaveLength(2);
    // Voreinstellung wie bisher: der erste Standard-Typ mit Antwort. Der
    // CNAME aus der Antwortkette bleibt dabei außen vor.
    expect(typeButton('A')).toHaveAttribute('aria-pressed', 'true');
    expect(typeButton('CNAME')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/DNS sauber propagiert/)).toBeInTheDocument();
  });
});

describe('PropagationView — Typauswahl (#131)', () => {
  it('bietet alle Typen zur Wahl an, per Tastatur bedienbar', async () => {
    const onTypeChange = vi.fn();
    vi.mocked(api.lookupPropagation).mockReturnValue(new Promise(() => {}));
    render(
      <View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} onTypeChange={onTypeChange} />
    );

    const group = screen.getByRole('group', { name: 'Record-Typ' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'A',
      'AAAA',
      'CNAME',
      'MX',
      'NS',
      'TXT',
      'CAA',
      'SOA',
    ]);

    typeButton('MX').focus();
    await userEvent.keyboard('{Enter}');
    expect(onTypeChange).toHaveBeenCalledWith('MX');
    expect(typeButton('MX')).toHaveAttribute('aria-pressed', 'true');
  });

  it('fragt einen Typ, den der Report nicht mitlädt, erst bei Auswahl ab', async () => {
    let answer!: (value: Awaited<ReturnType<typeof api.lookupPropagation>>) => void;
    vi.mocked(api.lookupPropagation).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} />);
    expect(api.lookupPropagation).not.toHaveBeenCalled();

    await userEvent.click(typeButton('MX'));
    expect(api.lookupPropagation).toHaveBeenCalledWith('example.com', 'MX');
    // Eine Ansage: Die Live-Region kommt leer, der Text danach (#108).
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('MX-Records werden bei allen Resolvern abgefragt')
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);

    answer({
      propagation: results([
        { records: [{ type: 'MX', value: 'mx2.example.net', priority: 20, ttl: 300 }, { type: 'MX', value: 'mx1.example.net', priority: 10, ttl: 300 }] },
        // Andere Reihenfolge, Großschreibung und Schlusspunkt: dieselbe Antwort.
        { records: [{ type: 'MX', value: 'MX1.example.net.', priority: 10, ttl: 120 }, { type: 'MX', value: 'mx2.example.net', priority: 20, ttl: 120 }] },
      ]),
      findings: [],
    });

    const group = await screen.findByRole('region', { name: 'Antwort A' });
    // Priorität und Ziel, wie im Zonefile.
    expect(group).toHaveTextContent('10 mx1.example.net');
    expect(group).toHaveTextContent('20 mx2.example.net');
    expect(screen.getByText(/Alle Resolver liefern denselben MX-Record/)).toBeInTheDocument();
    expect(screen.getByText('20ms · TTL 300s')).toBeInTheDocument();
    expect(screen.getByText('20ms · TTL 120s')).toBeInTheDocument();
  });

  it('fragt nach einem Tab-Wechsel nicht erneut, nach einem neuen Check schon', async () => {
    vi.mocked(api.lookupPropagation).mockResolvedValue({
      propagation: results([{ records: [{ type: 'NS', value: 'ns1.example.net', ttl: 3600 }] }]),
      findings: [],
    });
    const report = results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }]);

    const first = render(<View results={report} types={HOST} initial="NS" />);
    expect(await screen.findByText(/denselben NS-Record/)).toBeInTheDocument();
    first.unmount();

    // Dieselben Report-Daten: Tab-Wechsel, die Ansicht wird neu aufgebaut.
    const second = render(<View results={report} types={HOST} initial="NS" />);
    expect(screen.getByText(/denselben NS-Record/)).toBeInTheDocument();
    expect(api.lookupPropagation).toHaveBeenCalledTimes(1);
    second.unmount();

    // Neue Report-Daten (neuer Check derselben Domain): frisch abfragen.
    render(<View results={[...report]} types={HOST} initial="NS" />);
    await waitFor(() => expect(api.lookupPropagation).toHaveBeenCalledTimes(2));
  });

  it('zeigt einen Fehler mit erneutem Versuch', async () => {
    vi.mocked(api.lookupPropagation)
      .mockRejectedValueOnce(new Error('Propagation-Check fehlgeschlagen'))
      .mockResolvedValueOnce({
        propagation: results([{ records: [{ type: 'CAA', value: '0 issue "letsencrypt.org"', ttl: 300 }] }]),
        findings: [],
      });
    render(<View results={results([[]])} types={HOST} initial="CAA" />);

    expect(await screen.findByText('Propagation-Check fehlgeschlagen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText(/denselben CAA-Record/)).toBeInTheDocument();
    expect(api.lookupPropagation).toHaveBeenCalledTimes(2);
  });

  /*
   * Nach einem Fehler und einem Typwechsel zurück stand der alte Fehler samt
   * Knopf da, während im Hintergrund schon neu gefragt wurde.
   */
  it('fragt nach einem Fehler erst auf Wunsch erneut, auch nach einem Typwechsel', async () => {
    vi.mocked(api.lookupPropagation).mockImplementation(async (_domain, type) => {
      if (type === 'MX') throw new Error('Propagation-Check fehlgeschlagen');
      return {
        propagation: results([{ records: [{ type: 'NS', value: 'ns1.example.net', ttl: 3600 }] }]),
        findings: [],
      };
    });
    render(<View results={results([[]])} types={HOST} initial="MX" />);
    expect(await screen.findByText('Propagation-Check fehlgeschlagen')).toBeInTheDocument();

    await userEvent.click(typeButton('NS'));
    expect(await screen.findByText(/denselben NS-Record/)).toBeInTheDocument();
    await userEvent.click(typeButton('MX'));
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(vi.mocked(api.lookupPropagation).mock.calls.map(([, type]) => type)).toEqual(['MX', 'NS']);

    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await waitFor(() => expect(api.lookupPropagation).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Propagation-Check fehlgeschlagen')).toBeInTheDocument();
  });

  it('vergleicht das SOA über die Seriennummer und sagt das dazu', async () => {
    vi.mocked(api.lookupPropagation).mockResolvedValue({
      propagation: results([
        { records: [{ type: 'SOA', value: 'ns1.example.net. hostmaster.example.net. 2026101901 7200 900 1209600 300', ttl: 60 }] },
        // Anderer Primary, gleiche Seriennummer: derselbe Stand.
        { records: [{ type: 'SOA', value: 'ns2.example.net. hostmaster.example.net. 2026101901 7200 900 1209600 300', ttl: 60 }] },
        { records: [{ type: 'SOA', value: 'ns1.example.net. hostmaster.example.net. 2026101800 7200 900 1209600 300', ttl: 245 }] },
      ]),
      findings: [],
    });
    render(<View results={results([[]])} types={HOST} initial="SOA" />);

    expect(await screen.findByText(/Verglichen wird die Seriennummer/)).toBeInTheDocument();
    expect(screen.getByText(/1 von 3 Resolvern weicht ab/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Antwort B' })).toHaveTextContent('2026101800');
    // 245 s aufgerundet auf volle Minuten.
    expect(
      screen.getByText('Laut TTL fragen die abweichenden Resolver spätestens 5 min nach dieser Abfrage wieder bei den Nameservern nach.')
    ).toBeInTheDocument();
  });
});

describe('PropagationView — TTL (#131)', () => {
  it('nimmt bei „kein Eintrag“ die TTL des Negativ-Caches und fasst zusammen', () => {
    render(
      <View
        results={results([
          { records: [{ type: 'TXT', value: NEW_KEY, ttl: 3600 }] },
          { records: [{ type: 'TXT', value: NEW_KEY, ttl: 3500 }] },
          // Cached noch „gibt es nicht“ — laut SOA noch 40 s.
          { records: [], negativeTtl: { TXT: 40 } },
        ])}
        types={DNS_ENTRY}
      />
    );

    expect(screen.getByText(/kein Eintrag · weicht ab/)).toBeInTheDocument();
    expect(screen.getByText('20ms · TTL 40s')).toBeInTheDocument();
    expect(
      screen.getByText('Laut TTL fragen die abweichenden Resolver spätestens 40 s nach dieser Abfrage wieder bei den Nameservern nach.')
    ).toBeInTheDocument();
  });

  it('lässt die Zusammenfassung weg, wenn ein abweichender Resolver keine TTL nennt', () => {
    render(
      <View
        results={results([
          { records: [{ type: 'TXT', value: NEW_KEY, ttl: 3600 }] },
          { records: [{ type: 'TXT', value: NEW_KEY, ttl: 3500 }] },
          // Ohne SOA in der Antwort (wie AdGuard): Restlaufzeit unbekannt.
          { records: [] },
        ])}
        types={DNS_ENTRY}
      />
    );

    expect(screen.getByText(/kein Eintrag · weicht ab/)).toBeInTheDocument();
    expect(screen.getAllByText(/· TTL \d+s$/)).toHaveLength(2);
    expect(screen.getAllByText('20ms')).toHaveLength(1);
    expect(screen.queryByText(/fragen die abweichenden Resolver/)).not.toBeInTheDocument();
  });

  it('fasst nichts zusammen, wenn alle Resolver übereinstimmen', () => {
    render(
      <View
        results={results([
          { records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] },
          { records: [{ type: 'A', value: '192.0.2.1', ttl: 3600 }] },
        ])}
        types={HOST}
      />
    );

    expect(screen.getByText('20ms · TTL 60s')).toBeInTheDocument();
    expect(screen.getByText('20ms · TTL 3600s')).toBeInTheDocument();
    expect(screen.queryByText(/fragen die abweichenden Resolver/)).not.toBeInTheDocument();
  });

  it('nennt die größte TTL unter den abweichenden Resolvern', () => {
    render(
      <View
        results={results([
          { records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] },
          { records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] },
          { records: [{ type: 'A', value: '192.0.2.9', ttl: 7000 }] },
          { records: [{ type: 'A', value: '192.0.2.8', ttl: 30 }] },
        ])}
        types={HOST}
      />
    );

    // 7000 s sind knapp zwei Stunden — aufgerundet, nie abgerundet.
    expect(
      screen.getByText('Laut TTL fragen die abweichenden Resolver spätestens 2 h nach dieser Abfrage wieder bei den Nameservern nach.')
    ).toBeInTheDocument();
  });
});
