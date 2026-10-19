import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DnsRecord, RecordType } from '../types.js';
import type { NameserverReply, QueryOptions } from './dnsPort53.js';

/**
 * #133: Zone finden, Nameserver auflösen, nur öffentliche Adressen fragen —
 * mit festen Grenzen. DoH und Port 53 sind ersetzt: `dns` ist die Welt, wie
 * Cloudflare sie sieht, `nameservers` antwortet je Adresse.
 */

type Answer = DnsRecord[] | 'fail' | 'nxdomain';
const dns = new Map<string, Answer>();
const nameservers = new Map<string, (name: string, type: RecordType) => NameserverReply>();
const asked: { ip: string; name: string; type: RecordType; options: QueryOptions }[] = [];
const dohCalls: string[] = [];

vi.mock('./doh.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./doh.js')>()),
  dohQuery: vi.fn(async (_resolver: unknown, name: string, type: RecordType) => {
    dohCalls.push(`${name}|${type}`);
    const entry = dns.get(`${name}|${type}`) ?? [];
    if (entry === 'fail') throw new Error('Timeout');
    return { records: entry === 'nxdomain' ? [] : entry, authenticated: false, status: entry === 'nxdomain' ? 3 : 0, responseTimeMs: 5 };
  }),
}));

vi.mock('./dnsPort53.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dnsPort53.js')>()),
  queryNameserver: vi.fn(async (ip: string, name: string, type: RecordType, options: QueryOptions) => {
    asked.push({ ip, name, type, options });
    const server = nameservers.get(ip);
    return server ? server(name, type) : { ok: false, failure: 'timeout', responseTimeMs: options.timeoutMs };
  }),
}));

const {
  AUTHORITATIVE_LIMITS,
  authoritativeSection,
  checkAuthoritative,
  discoverNameservers,
  resetDestinationBudgets,
  selectTargets,
  takeDestinationBudget,
  zoneCandidates,
} = await import('./authoritative.js');
const { clearCache } = await import('../lib/cache.js');

const rr = (type: RecordType, name: string, value: string, extra: Partial<DnsRecord> = {}): DnsRecord => ({
  type,
  name,
  value,
  ttl: 300,
  ...extra,
});

/** Eine Zone in der DoH-Welt: NS-Records und Adressen der Nameserver. */
function zone(apex: string, hosts: Record<string, string[]>) {
  dns.set(`${apex}|NS`, Object.keys(hosts).map((host) => rr('NS', apex, host)));
  for (const [host, ips] of Object.entries(hosts)) {
    dns.set(`${host}|A`, ips.filter((ip) => !ip.includes(':')).map((ip) => rr('A', host, ip)));
    dns.set(`${host}|AAAA`, ips.filter((ip) => ip.includes(':')).map((ip) => rr('AAAA', host, ip)));
  }
}

/** Ein autoritativer Server: SOA der Zone und Records je Name und Typ. */
function authoritative(
  ip: string,
  zoneName: string,
  records: Record<string, DnsRecord[]>,
  { serial = '2026101901', primary = `ns1.${zoneName}`, aa = true, rcode = 0 } = {}
) {
  nameservers.set(ip, (name, type) => {
    const soa = rr('SOA', zoneName, `${primary}. hostmaster.${zoneName}. ${serial} 7200 900 1209600 300`);
    const found = type === 'SOA' && name === zoneName ? [soa] : (records[`${name}|${type}`] ?? []);
    return { ok: true, authoritative: aa, rcode, records: found, responseTimeMs: 12 };
  });
}

beforeEach(() => {
  dns.clear();
  nameservers.clear();
  asked.length = 0;
  dohCalls.length = 0;
  clearCache();
  resetDestinationBudgets();
});

describe('zoneCandidates', () => {
  it('geht von dem Namen bis zur registrierbaren Domain', () => {
    expect(zoneCandidates('_dmarc.example.com')).toEqual(['_dmarc.example.com', 'example.com']);
    expect(zoneCandidates('s1._domainkey.mail.example.co.uk')).toEqual([
      's1._domainkey.mail.example.co.uk',
      '_domainkey.mail.example.co.uk',
      'mail.example.co.uk',
      'example.co.uk',
    ]);
    expect(zoneCandidates('example.com')).toEqual(['example.com']);
  });

  it('nimmt bei privaten Suffixen die Zone des Anbieters mit (user.github.io liegt in github.io)', () => {
    expect(zoneCandidates('user.github.io')).toEqual(['user.github.io', 'github.io']);
  });

  it('fragt höchstens acht Stufen: die tiefsten und die registrierbare Domain', () => {
    const deep = `${Array.from({ length: 12 }, (_, i) => `l${i}`).join('.')}.example.com`;
    const candidates = zoneCandidates(deep);
    expect(candidates).toHaveLength(AUTHORITATIVE_LIMITS.zoneCandidates);
    expect(candidates[0]).toBe(deep);
    expect(candidates.at(-1)).toBe('example.com');
  });
});

describe('discoverNameservers', () => {
  it('findet die Zone eines DNS-Eintrags über die NS-Records darüber', async () => {
    zone('example.com', { 'ns2.example.net': ['192.0.2.2'], 'ns1.example.net': ['192.0.2.1', '2001:db8::1'] });
    const delegation = await discoverNameservers('_dmarc.example.com');
    expect(delegation).toEqual({
      zone: 'example.com',
      hosts: [
        { host: 'ns1.example.net', v4: ['192.0.2.1'], v6: ['2001:db8::1'] },
        { host: 'ns2.example.net', v4: ['192.0.2.2'], v6: [] },
      ],
      omitted: 0,
    });
  });

  it('nimmt die tiefste Stufe mit eigenem NS-Set — eine delegierte Subdomain', async () => {
    zone('example.com', { 'ns1.example.net': ['192.0.2.1'] });
    zone('cloud.example.com', { 'ns-1.cloud.example': ['198.51.100.1'] });
    expect(await discoverNameservers('www.cloud.example.com')).toMatchObject({ zone: 'cloud.example.com' });
  });

  it('zählt einen CNAME nicht als Zone, auch wenn die Antwort NS-Records des Ziels enthält', async () => {
    zone('example.com', { 'ns1.example.net': ['192.0.2.1'] });
    dns.set('s1._domainkey.example.com|NS', [
      rr('CNAME', 's1._domainkey.example.com', 'dkim.provider.example'),
      rr('NS', 'dkim.provider.example', 'ns.provider.example'),
    ]);
    expect(await discoverNameservers('s1._domainkey.example.com')).toMatchObject({ zone: 'example.com' });
  });

  it('bleibt offen, wenn die Abfrage einer tieferen Stufe scheitert', async () => {
    zone('example.com', { 'ns1.example.net': ['192.0.2.1'] });
    dns.set('www.example.com|NS', 'fail');
    expect(await discoverNameservers('www.example.com')).toEqual({ error: 'lookup_failed' });
  });

  it('meldet `no_zone`, wenn bis oben kein NS-Record kommt', async () => {
    dns.set('gibt-es-nicht.example|NS', 'nxdomain');
    expect(await discoverNameservers('www.gibt-es-nicht.example')).toEqual({ error: 'no_zone' });
  });

  it('löst höchstens acht Nameserver auf und zählt den Rest', async () => {
    const hosts = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`ns${i}.example.net`, [`192.0.2.${i + 1}`]]));
    zone('example.com', hosts);
    const delegation = await discoverNameservers('example.com');
    expect(delegation).toMatchObject({ omitted: 2 });
    expect(delegation.error === undefined && delegation.hosts).toHaveLength(8);
    expect(dohCalls.filter((c) => c.endsWith('|A'))).toHaveLength(8);
  });
});

describe('selectTargets', () => {
  it('fragt nur öffentliche Adressen — auch nicht über IPv6 und Übergangspräfixe', () => {
    const targets = selectTargets([
      { host: 'ok.example.net', v4: ['10.0.0.1', '192.0.2.1', '8.8.4.4'], v6: ['fd00::1'] },
      {
        host: 'intern.example.net',
        v4: ['127.0.0.1', '169.254.169.254', '100.64.0.1', '192.168.1.1', '172.16.0.1', '0.0.0.0', '224.0.0.1'],
        v6: ['::1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::53', '64:ff9b::a00:1'],
      },
      { host: 'leer.example.net', v4: [], v6: [] },
      { host: 'kaputt.example.net', v4: [], v6: [], lookupFailed: true },
    ]);
    // 192.0.2.1 ist TEST-NET-1 — ebenfalls kein Ziel.
    expect(targets).toEqual([
      { host: 'ok.example.net', ip: '8.8.4.4' },
      { host: 'intern.example.net', error: 'blocked' },
      { host: 'leer.example.net', error: 'no_address' },
      { host: 'kaputt.example.net', error: 'no_address' },
    ]);
  });

  it('nimmt reihum je Nameserver eine Adresse, IPv4 zuerst, höchstens acht', () => {
    const hosts = Array.from({ length: 3 }, (_, h) => ({
      host: `ns${h}.example.net`,
      v4: [`1.1.${h}.1`, `1.1.${h}.2`, `1.1.${h}.3`],
      v6: [`2606:4700:${h}::1`, `2606:4700:${h}::2`],
    }));
    const targets = selectTargets(hosts);
    expect(targets.filter((t) => t.ip)).toHaveLength(8);
    // Jeder Nameserver kommt dran; je Nameserver IPv4 vor IPv6.
    expect(targets.map((t) => `${t.host} ${t.ip}`)).toEqual([
      'ns0.example.net 1.1.0.1',
      'ns0.example.net 1.1.0.2',
      'ns0.example.net 2606:4700:0::1',
      'ns1.example.net 1.1.1.1',
      'ns1.example.net 1.1.1.2',
      'ns1.example.net 2606:4700:1::1',
      'ns2.example.net 1.1.2.1',
      'ns2.example.net 2606:4700:2::1',
    ]);
  });

  it('fragt eine Adresse unter zwei Namen nur einmal, zeigt aber beide Namen', () => {
    const targets = selectTargets([
      { host: 'a.example.net', v4: ['8.8.8.8'], v6: [] },
      { host: 'b.example.net', v4: ['8.8.8.8'], v6: [] },
    ]);
    expect(targets).toEqual([
      { host: 'a.example.net', ip: '8.8.8.8' },
      { host: 'b.example.net', ip: '8.8.8.8' },
    ]);
  });
});

describe('checkAuthoritative', () => {
  it('fragt jede Adresse nach Typ und SOA der Zone und liefert Wert, Seriennummer und Primary', async () => {
    zone('example.com', { 'ns1.example.net': ['1.1.1.1'], 'ns2.example.net': ['1.0.0.1'] });
    const mx = { '_dmarc.example.com|TXT': [rr('TXT', '_dmarc.example.com', 'v=DMARC1; p=reject')] };
    authoritative('1.1.1.1', 'example.com', mx);
    authoritative('1.0.0.1', 'example.com', mx, { serial: '2026101800' });

    const result = await checkAuthoritative('_dmarc.example.com', 'TXT');
    expect(result).toMatchObject({ domain: '_dmarc.example.com', type: 'TXT', zone: 'example.com' });
    expect(result.nameservers).toEqual([
      {
        host: 'ns1.example.net',
        ip: '1.1.1.1',
        records: [rr('TXT', '_dmarc.example.com', 'v=DMARC1; p=reject')],
        serial: '2026101901',
        primary: 'ns1.example.com',
        responseTimeMs: 12,
      },
      expect.objectContaining({ host: 'ns2.example.net', serial: '2026101800' }),
    ]);
    expect(asked.map((a) => `${a.ip} ${a.name} ${a.type}`).sort()).toEqual([
      '1.0.0.1 _dmarc.example.com TXT',
      '1.0.0.1 example.com SOA',
      '1.1.1.1 _dmarc.example.com TXT',
      '1.1.1.1 example.com SOA',
    ]);
    // Zeit je Frage begrenzt.
    expect(asked.every((a) => a.options.timeoutMs <= AUTHORITATIVE_LIMITS.queryTimeoutMs)).toBe(true);
  });

  it('braucht beim SOA des Apex nur eine Frage', async () => {
    zone('example.com', { 'ns1.example.net': ['1.1.1.1'] });
    authoritative('1.1.1.1', 'example.com', {});
    const result = await checkAuthoritative('example.com', 'SOA');
    expect(asked).toHaveLength(1);
    expect(result.nameservers[0]).toMatchObject({ serial: '2026101901' });
    expect(result.nameservers[0]).not.toHaveProperty('error');
  });

  it('meldet je Nameserver, warum er nicht prüfbar ist — ohne Fehler im Ganzen', async () => {
    zone('example.com', {
      'lahm.example.net': ['1.1.1.1'],
      'refused.example.net': ['1.0.0.1'],
      'stumm.example.net': ['8.8.8.8'],
      'intern.example.net': ['10.0.0.53'],
    });
    authoritative('1.1.1.1', 'example.com', {}, { aa: false });
    authoritative('1.0.0.1', 'example.com', {}, { aa: false, rcode: 5 });
    // 8.8.8.8 antwortet nicht (Port 53 gesperrt).

    const result = await checkAuthoritative('example.com', 'A');
    expect(result.nameservers.map((s) => [s.host, s.error])).toEqual([
      ['intern.example.net', 'blocked'],
      ['lahm.example.net', 'not_authoritative'],
      ['refused.example.net', 'refused'],
      ['stumm.example.net', 'timeout'],
    ]);
    // Die interne Adresse wurde nie gefragt — und steht auch nicht im Ergebnis.
    expect(asked.some((a) => a.ip === '10.0.0.53')).toBe(false);
    expect(result.nameservers[0]).not.toHaveProperty('ip');
  });

  it('fragt höchstens acht Adressen', async () => {
    zone(
      'example.com',
      Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`ns${i}.example.net`, [`1.1.${i}.1`, `1.1.${i}.2`]]))
    );
    await checkAuthoritative('example.com', 'A');
    expect(new Set(asked.map((a) => a.ip)).size).toBe(AUTHORITATIVE_LIMITS.addresses);
  });

  it('gibt Zone-Fehler als Ergebnis zurück', async () => {
    dns.set('example.com|NS', 'fail');
    expect(await checkAuthoritative('example.com', 'A')).toEqual({
      domain: 'example.com',
      type: 'A',
      nameservers: [],
      error: 'lookup_failed',
    });
    expect(asked).toHaveLength(0);
  });

  it('fragt eine Adresse nicht öfter als 120-mal pro Minute — gleich für welche Domain', async () => {
    // Viele Domains mit denselben NS-Records: der Weg, ein fremdes Ziel über diggy zu beschäftigen.
    for (let i = 0; i < 61; i++) zone(`d${i}.example`, { 'ns.opfer.example': ['9.9.9.9'] });
    authoritative('9.9.9.9', 'x.example', {});
    const results = [];
    for (let i = 0; i < 61; i++) results.push(await checkAuthoritative(`d${i}.example`, 'A'));
    expect(asked.filter((a) => a.ip === '9.9.9.9')).toHaveLength(120);
    expect(results.at(-1)!.nameservers[0].error).toBe('rate_limited');
  });
});

describe('takeDestinationBudget', () => {
  it('füllt sich mit der Zeit wieder auf', () => {
    const t0 = 1_000_000;
    expect(takeDestinationBudget('9.9.9.9', 120, t0)).toBe(true);
    expect(takeDestinationBudget('9.9.9.9', 1, t0)).toBe(false);
    // Eine Sekunde später sind zwei Fragen nachgewachsen.
    expect(takeDestinationBudget('9.9.9.9', 2, t0 + 1000)).toBe(true);
    expect(takeDestinationBudget('9.9.9.9', 1, t0 + 1000)).toBe(false);
    // Andere Ziele haben ihr eigenes Budget.
    expect(takeDestinationBudget('1.1.1.1', 2, t0)).toBe(true);
  });
});

describe('authoritativeSection', () => {
  it('wertet mit derselben Funktion wie die Ansicht aus und cached kurz', async () => {
    zone('example.com', { 'ns1.example.net': ['1.1.1.1'], 'ns2.example.net': ['1.0.0.1'] });
    const a = { 'example.com|A': [rr('A', 'example.com', '93.184.216.34')] };
    authoritative('1.1.1.1', 'example.com', a);
    authoritative('1.0.0.1', 'example.com', a);

    const section = await authoritativeSection('example.com', 'A', 15_000);
    expect(section).toMatchObject({ state: 'agreed', values: ['93.184.216.34'], zone: 'example.com' });
    await authoritativeSection('example.com', 'A', 15_000);
    expect(asked).toHaveLength(4);
    // Ein anderer Typ ist eine eigene Abfrage, die Zone kommt aus dem Cache.
    const before = dohCalls.length;
    await authoritativeSection('example.com', 'MX', 15_000);
    expect(asked).toHaveLength(8);
    expect(dohCalls).toHaveLength(before);
  });
});
