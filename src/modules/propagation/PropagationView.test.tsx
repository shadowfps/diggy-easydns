import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthoritativeResult, DnsRecord, RecordType, ResolverResult } from '@/types/dns';
import { defaultPropagationType, type PropagationRecordType } from '@/lib/propagation';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  lookupPropagation: vi.fn(),
  lookupAuthoritative: vi.fn(),
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

/** Wie in App.tsx: gewählter Typ und erwarteter Wert stehen außerhalb der Ansicht. */
function View({
  results: data,
  types,
  initial,
  onTypeChange,
  expected: initialExpected = '',
}: {
  results: ResolverResult[];
  types: PropagationRecordType[];
  initial?: PropagationRecordType;
  onTypeChange?: (type: PropagationRecordType) => void;
  expected?: string;
}) {
  const [type, setType] = useState(initial ?? defaultPropagationType(data, types));
  const [expected, setExpected] = useState(initialExpected);
  return (
    <PropagationView
      domain="example.com"
      results={data}
      types={types}
      type={type}
      onTypeChange={(next) => {
        onTypeChange?.(next);
        setType(next);
        setExpected('');
      }}
      expected={expected}
      onExpectedChange={setExpected}
    />
  );
}

const DNS_ENTRY: PropagationRecordType[] = ['TXT', 'CNAME'];
const HOST: PropagationRecordType[] = ['A', 'AAAA'];

const typeButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Record-Typ' })).getByRole('button', { name });

beforeEach(() => {
  vi.mocked(api.lookupPropagation).mockReset();
  // Ohne eigene Antwort bleiben die Nameserver beim Laden: Die Resolver
  // vergleichen dann wie vor #133 mit ihrer Mehrheit.
  vi.mocked(api.lookupAuthoritative).mockReset().mockReturnValue(new Promise(() => {}));
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

  /**
   * #132: Neun Anbieter wirken wie ein Blick um die Welt. Per Anycast antwortet
   * aber jeder aus seinem Rechenzentrum nahe dem Server — das muss dastehen,
   * auch wenn ein Resolver ausfällt.
   */
  it('sagt, von wo aus gefragt wird und was die Flagge bedeutet', () => {
    render(<View results={results([[['A', '192.0.2.1']], { error: 'Timeout' }])} types={HOST} />);

    const hint = screen.getByText(/diggy fragt aus Deutschland/);
    expect(hint).toHaveTextContent(/nächstgelegenen Rechenzentrum \(Anycast\)/);
    expect(hint).toHaveTextContent(/keine weltweite Verteilung/);
    expect(hint).toHaveTextContent(/Die Flagge zeigt den Sitz des Anbieters/);
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
    vi.mocked(api.lookupAuthoritative).mockImplementation(async (domain, type) => ({
      domain,
      type,
      nameservers: [],
      error: 'lookup_failed',
    }));
    let answer!: (value: Awaited<ReturnType<typeof api.lookupPropagation>>) => void;
    vi.mocked(api.lookupPropagation).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} />);
    expect(api.lookupPropagation).not.toHaveBeenCalled();

    await userEvent.click(typeButton('MX'));
    expect(api.lookupPropagation).toHaveBeenCalledWith('example.com', 'MX');
    // Eine Ansage: Die Live-Region kommt leer, der Text danach (#108). Die
    // Nameserver (#133) haben ihre eigene, solange sie laden — hier sind sie
    // schon da.
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
    // Zwei MX: Mehrzahl.
    expect(screen.getByText('Alle Resolver liefern dieselben MX-Records — sauber propagiert.')).toBeInTheDocument();
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

/* ─── #133: autoritative Nameserver und erwarteter Wert ─────────────────── */

type Server = AuthoritativeResult['nameservers'][number];

function nameserver(host: string, records: [RecordType, string][], extra: Partial<Server> = {}): Server {
  if (extra.error) return { host, ip: extra.ip ?? '192.0.2.53', records: [], responseTimeMs: 2500, error: extra.error };
  return {
    host,
    ip: '192.0.2.53',
    records: records.map(([type, value]) => ({ type, name: 'example.com', value, ttl: 3600 })),
    serial: '2026101901',
    primary: 'ns1.example.net',
    responseTimeMs: 18,
    ...extra,
  };
}

function authoritative(type: RecordType, servers: Server[], extra: Partial<AuthoritativeResult> = {}): AuthoritativeResult {
  return { domain: 'example.com', type, zone: 'example.com', nameservers: servers, ...extra };
}

const authBlock = () => screen.findByRole('region', { name: 'Autoritative Nameserver' });
const resolverCard = () => screen.getByRole('region', { name: 'Öffentliche Resolver' });

describe('PropagationView — autoritative Nameserver (#133)', () => {
  it('fragt die Nameserver für den gezeigten Typ, beim Typwechsel neu, nach einem Tab-Wechsel nicht', async () => {
    vi.mocked(api.lookupAuthoritative).mockImplementation(async (_domain, type) => authoritative(type, []));
    vi.mocked(api.lookupPropagation).mockResolvedValue({ propagation: results([[]]), findings: [] });
    const report = results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }]);

    const view = render(<View results={report} types={HOST} />);
    expect(api.lookupAuthoritative).toHaveBeenCalledWith('example.com', 'A');
    await userEvent.click(typeButton('MX'));
    expect(api.lookupAuthoritative).toHaveBeenLastCalledWith('example.com', 'MX');
    view.unmount();

    render(<View results={report} types={HOST} />);
    await authBlock();
    expect(api.lookupAuthoritative).toHaveBeenCalledTimes(2);
  });

  it('vergleicht die Resolver mit den einigen Nameservern statt mit der Mehrheit', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('TXT', [
        nameserver('ns1.example.net', [['TXT', NEW_KEY]]),
        nameserver('ns2.example.net', [['TXT', NEW_KEY]], { ip: '198.51.100.53' }),
      ])
    );
    // Die Mehrheit hat noch den alten Schlüssel.
    render(
      <View
        results={results([[['TXT', OLD_KEY]], [['TXT', OLD_KEY]], [['TXT', NEW_KEY]], [['TXT', OLD_KEY]], [['TXT', NEW_KEY]]])}
        types={DNS_ENTRY}
      />
    );

    const block = await authBlock();
    expect(await within(block).findByText('einig')).toBeInTheDocument();
    expect(within(block).getByText('ns1.example.net')).toBeInTheDocument();
    expect(within(block).getByText('192.0.2.53')).toBeInTheDocument();
    expect(within(block).getAllByText('SOA 2026101901')).toHaveLength(2);
    expect(within(block).getByText(/Die Nameserver sind sich einig/)).toBeInTheDocument();
    expect(within(block).getByRole('region', { name: 'Antwort 1' })).toHaveTextContent(/NEUESENDEwIDAQAB/);

    const card = resolverCard();
    expect(within(card).getByText('Verglichen mit den autoritativen Nameservern')).toBeInTheDocument();
    expect(
      within(card).getByText(/Noch nicht auf dem Stand der autoritativen Nameserver: 3 von 5 Resolvern/)
    ).toBeInTheDocument();
    // Die Antwort der Nameserver steht vorn, mit Wort statt nur Farbe.
    const first = within(card).getByRole('region', { name: 'Antwort A' });
    expect(first).toHaveTextContent(/NEUESENDEwIDAQAB/);
    expect(within(first).getByText('wie autoritativ')).toBeInTheDocument();
    expect(within(within(card).getByRole('region', { name: 'Antwort B' })).getByText('weicht ab')).toBeInTheDocument();
  });

  it('zeigt uneinige Nameserver deutlich und vergleicht dann mit der Mehrheit', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('TXT', [
        nameserver('ns1.example.net', [['TXT', NEW_KEY]], { serial: '2026101902' }),
        nameserver('ns2.example.net', [['TXT', OLD_KEY]], { serial: '2026101901', ip: '198.51.100.53' }),
        nameserver('ns3.example.net', [['TXT', NEW_KEY]], { serial: '2026101902', ip: '203.0.113.53' }),
      ])
    );
    render(<View results={results([[['TXT', OLD_KEY]], [['TXT', OLD_KEY]], [['TXT', NEW_KEY]]])} types={DNS_ENTRY} />);

    const block = await authBlock();
    expect(await within(block).findByText('uneinig')).toBeInTheDocument();
    expect(within(block).getByText(/Ihre Seriennummern weichen ab/)).toBeInTheDocument();
    // Die abweichende Seriennummer und Antwort tragen Wort und Icon.
    expect(within(block).getByText('SOA 2026101901').closest('.badge')).toHaveClass('badge-warning');
    expect(within(block).getByText('Antwort 2 · weicht ab')).toBeInTheDocument();
    expect(within(resolverCard()).getByText('Verglichen mit der Mehrheit der Resolver')).toBeInTheDocument();
    expect(within(resolverCard()).getByText(/1 von 3 Resolvern weicht ab/)).toBeInTheDocument();
  });

  it('nennt mehrere Anbieter mit eigener Seriennummer neutral — keine Uneinigkeit', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('TXT', [
        nameserver('dns1.p08.nsone.net', [['TXT', NEW_KEY]], { serial: '1656468023', primary: 'dns1.p08.nsone.net' }),
        nameserver('ns-421.awsdns-52.com', [['TXT', NEW_KEY]], { serial: '1', primary: 'ns-1707.awsdns-21.co.uk' }),
      ])
    );
    render(<View results={results([[['TXT', NEW_KEY]]])} types={DNS_ENTRY} />);

    const block = await authBlock();
    expect(await within(block).findByText('einig')).toBeInTheDocument();
    expect(within(block).getByText(/Die Zone liegt bei 2 Anbietern/)).toBeInTheDocument();
    expect(within(block).queryByText('uneinig')).not.toBeInTheDocument();
    expect(block.querySelector('.badge-warning')).toBeNull();
  });

  it('zeigt verschiedene Adressen der Nameserver als Hinweis, nicht als Warnung', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('A', [
        nameserver('ns1.example.net', [['A', '140.82.121.3']]),
        nameserver('ns2.example.net', [['A', '140.82.121.4']], { ip: '198.51.100.53' }),
      ])
    );
    render(<View results={results([{ records: [{ type: 'A', value: '140.82.121.3', ttl: 60 }] }])} types={HOST} />);

    const block = await authBlock();
    expect(await within(block).findByText('verschieden')).toBeInTheDocument();
    expect(within(block).getByText(/bei Lastverteilung oder GeoDNS üblich/)).toBeInTheDocument();
    expect(block.querySelector('.text-warning')).toBeNull();
  });

  it('zeigt „nicht prüfbar“ mit Grund, wenn Port 53 gesperrt ist — die Resolver bleiben', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('A', [
        nameserver('ns1.example.net', [], { error: 'timeout' }),
        nameserver('ns2.example.net', [], { error: 'network', ip: '2001:db8::53' }),
      ])
    );
    render(<View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} />);

    const block = await authBlock();
    expect(await within(block).findByText('nicht prüfbar')).toBeInTheDocument();
    expect(within(block).getByText('keine Antwort')).toBeInTheDocument();
    expect(within(block).getByText('nicht erreichbar')).toBeInTheDocument();
    expect(within(block).getByText(/DNS über Port 53 womöglich gesperrt/)).toBeInTheDocument();
    expect(within(resolverCard()).getByText(/Alle Resolver liefern dasselbe Ergebnis/)).toBeInTheDocument();
  });

  /** In einem Container ohne IPv6 — eine Aussage über diggy, nicht über die Nameserver. */
  it('sagt, wenn der diggy-Server kein IPv6 hat, statt Nameserver als unerreichbar zu zeigen', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative(
        'A',
        [
          nameserver('ns1.example.net', [['A', '192.0.2.1']]),
          nameserver('ns2.example.net', [], { error: 'no_ipv6', ip: '2606:4700:4700::1111' }),
        ],
        { ipv6Skipped: true }
      )
    );
    render(<View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} />);

    const block = await authBlock();
    expect(await within(block).findByText('diggy ohne IPv6')).toBeInTheDocument();
    expect(within(block).getByText('Gefragt nur über IPv4: Der diggy-Server hat kein IPv6.')).toBeInTheDocument();
    expect(within(block).queryByText('nicht erreichbar')).toBeNull();
    expect(within(block).getByText('einig')).toBeInTheDocument();
  });

  it('sagt, wenn sich die Zone nicht ermitteln ließ', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(authoritative('A', [], { zone: undefined, error: 'no_zone' }));
    render(<View results={results([[]])} types={HOST} />);
    const block = await authBlock();
    expect(await within(block).findByText(/keine Zone finden/)).toBeInTheDocument();
    expect(within(block).getByText('nicht prüfbar')).toBeInTheDocument();
  });

  it('zeigt einen gescheiterten Abruf mit erneutem Versuch', async () => {
    vi.mocked(api.lookupAuthoritative)
      .mockRejectedValueOnce(new Error('Zu viele Abfragen an autoritative Nameserver.'))
      .mockResolvedValueOnce(authoritative('A', [nameserver('ns1.example.net', [['A', '192.0.2.1']])]));
    render(<View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} />);

    const block = await authBlock();
    expect(await within(block).findByText('Zu viele Abfragen an autoritative Nameserver.')).toBeInTheDocument();
    await userEvent.click(within(block).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await within(block).findByText('einig')).toBeInTheDocument();
  });

  it('nennt einen CNAME aus der Zone hinaus', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('TXT', [
        {
          ...nameserver('ns1.example.net', []),
          records: [{ type: 'CNAME', name: 'example.com', value: 'dkim.provider.example', ttl: 300 }],
        },
      ])
    );
    render(<View results={results([[['TXT', NEW_KEY]]])} types={DNS_ENTRY} />);
    const block = await authBlock();
    expect(await within(block).findByText(/ist ein CNAME auf/)).toBeInTheDocument();
    expect(within(block).getByText('dkim.provider.example').parentElement).toHaveTextContent('→ dkim.provider.example');
    expect(within(block).getByText(/ist ein CNAME auf dkim.provider.example/)).toBeInTheDocument();
  });

  it('fasst die Adressen eines Nameservers zusammen, solange sie dasselbe antworten', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('A', [
        nameserver('hera.ns.cloudflare.com', [['A', '192.0.2.1']], { ip: '172.64.32.162' }),
        nameserver('hera.ns.cloudflare.com', [['A', '192.0.2.1']], { ip: '2803:f800:50::6ca2:c0a2' }),
        nameserver('elliott.ns.cloudflare.com', [['A', '192.0.2.1']], { ip: '162.159.44.228' }),
        nameserver('elliott.ns.cloudflare.com', [['A', '192.0.2.9']], { ip: '2803:f800:50::6ca2:c3e4' }),
      ])
    );
    render(<View results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }])} types={HOST} />);
    const block = await authBlock();
    await within(block).findByText('verschieden');
    expect(within(block).getAllByText('hera.ns.cloudflare.com')).toHaveLength(1);
    // Antworten zwei Adressen verschieden, steht jede für sich.
    expect(within(block).getAllByText('elliott.ns.cloudflare.com')).toHaveLength(2);
  });
});

describe('PropagationView — erwarteter Wert (#133)', () => {
  it('hebt Resolver und Nameserver ohne den erwarteten Wert hervor — normalisiert wie der Vergleich', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('MX', [
        nameserver('ns1.example.net', [['MX', '10 mx.new.example']]),
        nameserver('ns2.example.net', [['MX', '10 mx.old.example']], { serial: '2026101900', ip: '198.51.100.53' }),
      ])
    );
    vi.mocked(api.lookupPropagation).mockResolvedValue({
      propagation: results([
        { records: [{ type: 'MX', value: 'mx.new.example', priority: 10, ttl: 300 }] },
        { records: [{ type: 'MX', value: 'mx.old.example', priority: 10, ttl: 300 }] },
      ]),
      findings: [],
    });
    render(<View results={results([[]])} types={HOST} initial="MX" />);
    const block = await authBlock();
    await within(block).findByText('uneinig');
    await screen.findByRole('region', { name: 'Öffentliche Resolver' });

    await userEvent.type(screen.getByRole('textbox', { name: 'Erwarteter Wert' }), 'MX.New.Example.');

    const card = resolverCard();
    expect(
      await within(card).findByText('Verglichen mit dem erwarteten Wert — er muss in der Antwort stehen')
    ).toBeInTheDocument();
    expect(within(card).getByText('Noch ohne den erwarteten Wert: 1 von 2 Resolvern.')).toBeInTheDocument();
    expect(within(within(card).getByRole('region', { name: 'Antwort A' })).getByText('erwartet')).toBeInTheDocument();
    expect(
      within(block).getByText('Noch ohne den erwarteten Wert: 1 von 2 Nameservern — dort ist die Änderung nicht angekommen.')
    ).toBeInTheDocument();

    // Leeren: wieder gegen die Mehrheit, die Nameserver sind uneinig.
    await userEvent.click(screen.getByRole('button', { name: 'Erwarteten Wert löschen' }));
    expect(await within(card).findByText('Verglichen mit der Mehrheit der Resolver')).toBeInTheDocument();
  });

  it('übernimmt einen Wert von außen (Link) und bestätigt, wenn alle ihn liefern', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(
      authoritative('AAAA', [nameserver('ns1.example.net', [['AAAA', '2001:db8::1']])])
    );
    render(
      <View
        results={results([
          { records: [{ type: 'AAAA', value: '2001:db8::1', ttl: 60 }] },
          { records: [{ type: 'AAAA', value: '2001:db8::1', ttl: 60 }] },
        ])}
        types={HOST}
        initial="AAAA"
        expected="2001:DB8:0:0:0:0:0:1"
      />
    );

    expect(screen.getByRole('textbox', { name: 'Erwarteter Wert' })).toHaveValue('2001:DB8:0:0:0:0:0:1');
    expect(within(resolverCard()).getByText('Alle Resolver liefern den erwarteten Wert.')).toBeInTheDocument();
    expect(await within(await authBlock()).findByText('Die Nameserver liefern den erwarteten Wert.')).toBeInTheDocument();
  });

  it('zählt gegen den erwarteten Wert auch Resolver ohne Eintrag als abweichend', () => {
    render(
      <View
        results={results([{ records: [{ type: 'A', value: '192.0.2.1', ttl: 60 }] }, { records: [] }])}
        types={HOST}
        expected="192.0.2.1"
      />
    );
    expect(within(resolverCard()).getByText('Noch ohne den erwarteten Wert: 1 von 2 Resolvern.')).toBeInTheDocument();
  });
});

describe('PropagationView — SOA bei mehreren Anbietern (#133)', () => {
  it('steht nicht als gestört da, auch wenn die Nameserver nicht prüfbar sind', async () => {
    vi.mocked(api.lookupAuthoritative).mockResolvedValue(authoritative('SOA', [], { error: 'lookup_failed' }));
    vi.mocked(api.lookupPropagation).mockResolvedValue({
      propagation: results([
        { records: [{ type: 'SOA', value: 'ns-1707.awsdns-21.co.uk. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400', ttl: 900 }] },
        { records: [{ type: 'SOA', value: 'dns1.p08.nsone.net. hostmaster.nsone.net. 1656468023 43200 7200 1209600 3600', ttl: 3600 }] },
        { records: [{ type: 'SOA', value: 'dns1.p08.nsone.net. hostmaster.nsone.net. 1656468023 43200 7200 1209600 3600', ttl: 3600 }] },
      ]),
      findings: [],
    });
    render(<View results={results([[]])} types={HOST} initial="SOA" />);

    const card = await screen.findByRole('region', { name: 'Öffentliche Resolver' });
    expect(within(card).getByText(/Die Zone liegt bei 2 Anbietern mit eigener Seriennummer/)).toBeInTheDocument();
    expect(within(card).getByText('Alle Resolver liefern die Seriennummer ihres Anbieters — sauber propagiert.')).toBeInTheDocument();
    expect(within(card).queryByText(/weicht ab/)).not.toBeInTheDocument();
  });
});
