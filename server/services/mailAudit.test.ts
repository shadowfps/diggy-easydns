import { promises as dnsPromises } from 'node:dns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeSpf, auditMail, checkMxReverse, countSpfLookups, summarizeMx } from './mailAudit.js';

describe('auditMail: Mail-TXT-Tags', () => {
  beforeEach(() => {
    // Alle Lookups ersetzen: die Regression lässt sich ohne DNS oder Ports prüfen.
    vi.spyOn(dnsPromises.Resolver.prototype, 'resolveTxt').mockResolvedValue([]);
    vi.spyOn(dnsPromises.Resolver.prototype, 'resolveMx').mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['v=DMARC1; sp=none; p=reject', 'reject'],
    ['v=DMARC1; p=reject; sp=none', 'reject'],
    ['v=DMARC1; p=REJECT', 'reject'],
    [' v = DMARC1 ; P \t= QuArAnTiNe ; sp=none ', 'quarantine'],
    ['v=DMARC1; p=none', 'none'],
    ['v=DMARC1; sp=none', undefined],
    ['v=DMARC1; p=invalid', undefined],
    ['v=DMARC1; p=none; p=reject', 'none'],
    ['v=DMARC1; p=; p=reject', undefined],
  ])('liest die DMARC-Policy aus %s', async (record, policy) => {
    vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) =>
      name === '_dmarc.example.com' ? [[record]] : []
    );
    const mail = await auditMail('example.com');
    expect(mail.dmarc).toEqual({ present: true, record, policy, rua: undefined });
  });

  it('erhält einen üblichen Record samt Report-Adresse', async () => {
    const record = 'v=DMARC1; p=reject; rua=mailto:Reports@example.com';
    vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) =>
      name === '_dmarc.example.com' ? [[record]] : []
    );
    expect((await auditMail('example.com')).dmarc).toEqual({
      present: true, record, policy: 'reject', rua: 'mailto:Reports@example.com',
    });
  });

  /** #107: Bei mehreren Records wenden Empfänger DMARC nicht an (RFC 7489 §6.6.3, Schritt 5). */
  it('liefert bei mehreren DMARC-Records alle mit, andere TXT-Records nicht', async () => {
    const first = 'v=DMARC1; p=reject';
    const second = 'v=DMARC1; p=none; rua=mailto:dmarc@example.com';
    vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) =>
      name === '_dmarc.example.com' ? [[first], ['google-site-verification=abc'], [second]] : []
    );
    expect((await auditMail('example.com')).dmarc).toEqual({
      present: true, record: first, records: [first, second], policy: 'reject', rua: undefined,
    });
  });

  it.each(['p=reject; v=DMARC1', 'v=DMARC2; p=reject', 'sp=none; p=reject'])(
    'verwirft einen DMARC-Record ohne v=DMARC1 an erster Stelle: %s',
    async (record) => {
      vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) =>
        name === '_dmarc.example.com' ? [[record]] : []
      );
      expect((await auditMail('example.com')).dmarc).toEqual({ present: false });
    }
  );

  it.each([
    ['v=DKIM1; sp=; p=AbC123==', true],
    ['v=DKIM1; sp=AbC123==; p=', false],
    ['v=DKIM1; p=; p=AbC123==', false],
    ['v=DKIM1; p=AbC123==', true],
    // v= und k= sind optional (RFC 6376 §3.6.1)
    ['p=AbC123==', true],
    ['k=rsa; p=AbC123==', true],
    [' v = DKIM1 ; p=AbC123==', true],
    ['k=rsa; p=', false],
    ['v=DKIM2; p=AbC123==', false],
    ['google-site-verification=AbC123', false],
  ])('prüft beim DKIM-Schlüssel nur das vollständige p-Tag: %s', async (record, present) => {
    vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) =>
      name === 'default._domainkey.example.com' ? [[record]] : []
    );
    expect((await auditMail('example.com')).dkim.selectors).toEqual(
      present ? [{ selector: 'default', present: true, record }] : []
    );
  });
});

/** So wirft node:dns: Fehlercode am Error-Objekt. */
const dnsError = (code: string) => Object.assign(new Error(code), { code });

describe('auditMail: BIMI und TLS-RPT (#83)', () => {
  beforeEach(() => {
    vi.spyOn(dnsPromises.Resolver.prototype, 'resolveTxt').mockResolvedValue([]);
    vi.spyOn(dnsPromises.Resolver.prototype, 'resolveMx').mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

  it('fragt default._bimi und _smtp._tls ab und setzt geteilte TXT-Strings zusammen', async () => {
    vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) => {
      if (name === 'default._bimi.example.com') {
        return [['v=BIMI1; l=https://example.com/', 'logo.svg']];
      }
      if (name === '_smtp._tls.example.com') return [['v=TLSRPTv1; rua=mailto:tls@example.com']];
      return [];
    });
    const mail = await auditMail('example.com');
    expect(mail.bimi).toEqual({
      present: true,
      records: ['v=BIMI1; l=https://example.com/logo.svg'],
      logoUrl: 'https://example.com/logo.svg',
    });
    expect(mail.tlsRpt).toEqual({
      present: true,
      records: ['v=TLSRPTv1; rua=mailto:tls@example.com'],
      rua: ['mailto:tls@example.com'],
    });
  });

  it.each(['ENOTFOUND', 'ENODATA'])('meldet bei %s „fehlt“', async (code) => {
    vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockRejectedValue(dnsError(code));
    const mail = await auditMail('example.com');
    expect(mail.bimi).toEqual({ present: false });
    expect(mail.tlsRpt).toEqual({ present: false });
  });

  /** Ein Timeout sagt nichts darüber, ob der Record existiert. */
  it.each([
    ['ETIMEOUT', 'timeout'],
    ['ESERVFAIL', 'servfail'],
    ['ECONNREFUSED', 'network'],
  ] as const)(
    'meldet bei %s „nicht prüfbar“ (%s) statt „fehlt“ — und der Rest des Reports bleibt',
    async (code, reason) => {
      const dmarc = 'v=DMARC1; p=reject';
      vi.mocked(dnsPromises.Resolver.prototype.resolveTxt).mockImplementation(async (name) => {
        if (name === 'default._bimi.example.com' || name === '_smtp._tls.example.com') {
          throw dnsError(code);
        }
        return name === '_dmarc.example.com' ? [[dmarc]] : [];
      });
      const mail = await auditMail('example.com');
      expect(mail.bimi).toEqual({ present: false, lookupFailed: reason });
      expect(mail.tlsRpt).toEqual({ present: false, lookupFailed: reason });
      expect(mail.dmarc).toEqual({ present: true, record: dmarc, policy: 'reject', rua: undefined });
    }
  );
});

/**
 * Der Lookup-Zähler entscheidet über ein critical-Finding mit -25 Score-
 * Punkten. Die alte Regex verlangte einen Doppelpunkt und hat die blanken
 * Mechanismen a/mx/ptr übersehen — für `v=spf1 a mx include:… -all` ergab sie
 * 1 statt 3.
 */
describe('countSpfLookups', () => {
  it('zählt include, exists und redirect', () => {
    expect(countSpfLookups('v=spf1 include:_spf.google.com ~all')).toBe(1);
    expect(countSpfLookups('v=spf1 exists:%{i}.spf.example.com -all')).toBe(1);
    expect(countSpfLookups('v=spf1 redirect=_spf.example.com')).toBe(1);
  });

  it('zählt BLANKE a/mx/ptr — das war der Fehler', () => {
    expect(countSpfLookups('v=spf1 a mx include:spf.protection.outlook.com -all')).toBe(3);
    expect(countSpfLookups('v=spf1 ptr -all')).toBe(1);
    expect(countSpfLookups('v=spf1 a mx -all')).toBe(2);
  });

  it('zählt a/mx mit Domain-Spec und CIDR-Länge je einmal', () => {
    expect(countSpfLookups('v=spf1 a:mail.example.com mx:mail.example.com -all')).toBe(2);
    expect(countSpfLookups('v=spf1 a/24 mx/24 -all')).toBe(2);
    expect(countSpfLookups('v=spf1 a:x.de/24 -all')).toBe(1);
  });

  it('respektiert Qualifier', () => {
    expect(countSpfLookups('v=spf1 -a +mx ~ptr ?include:x.de -all')).toBe(4);
  });

  it('zählt ip4/ip6/all NICHT', () => {
    expect(countSpfLookups('v=spf1 ip4:1.2.3.4 ip6:2001:db8::1 -all')).toBe(0);
    expect(countSpfLookups('v=spf1 -all')).toBe(0);
    expect(countSpfLookups('v=spf1 all')).toBe(0);
    // "ip4" enthält kein a-Mechanismus, "mail" kein mx.
    expect(countSpfLookups('v=spf1 ip4:10.0.0.0/8 -all')).toBe(0);
  });

  it('verrechnet sich nicht an der Version', () => {
    expect(countSpfLookups('v=spf1')).toBe(0);
  });

  it('zählt realistische Provider-Records korrekt', () => {
    // Google Workspace
    expect(countSpfLookups('v=spf1 include:_spf.google.com ~all')).toBe(1);
    // Microsoft 365 mit eigenem Mailserver
    expect(countSpfLookups('v=spf1 a mx include:spf.protection.outlook.com -all')).toBe(3);
    // Mailchimp + SendGrid + eigener Server
    expect(
      countSpfLookups('v=spf1 a mx include:servers.mcsv.net include:sendgrid.net ~all')
    ).toBe(4);
  });
});

describe('analyzeSpf', () => {
  it('meldet fehlenden Record', () => {
    expect(analyzeSpf(undefined)).toEqual({ present: false, valid: false, issues: [] });
  });

  it('bewertet +all als kritisch', () => {
    const result = analyzeSpf('v=spf1 +all');
    expect(result.present).toBe(true);
    expect(result.issues.join(' ')).toContain('+all');
  });

  it('warnt bei fehlendem all-Mechanismus', () => {
    expect(analyzeSpf('v=spf1 include:x.de').issues.join(' ')).toContain('Kein "all"');
  });

  it('schlägt beim RFC-Limit an — auch wenn die Lookups blank stehen', () => {
    // 11 Lookups: 1 blankes a, 1 blankes mx, 9 includes.
    const record =
      'v=spf1 a mx ' +
      Array.from({ length: 9 }, (_, i) => `include:s${i}.example.com`).join(' ') +
      ' -all';
    const result = analyzeSpf(record);
    expect(result.lookupCount).toBe(11);
    expect(result.issues.join(' ')).toContain('RFC-Limit');
  });

  it('gibt einen sauberen Record ohne Beanstandung durch', () => {
    const result = analyzeSpf('v=spf1 include:_spf.google.com -all');
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.lookupCount).toBe(1);
  });

  // #86: jedes Problem zusätzlich als Kennung mit Werten, in derselben
  // Reihenfolge wie der deutsche Satz.
  it('liefert die Probleme auch als Kennung für die Übersetzung', () => {
    const record =
      'v=spf1 ' + Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(' ') + ' +all';
    const result = analyzeSpf(record);
    expect(result.issueDetails).toEqual([
      { key: 'spf-lookups-over-limit', params: { count: 11 } },
      { key: 'spf-plus-all' },
    ]);
    expect(result.issues).toHaveLength(2);
  });
});

/**
 * #77: example.com veröffentlicht `MX 0 .` (RFC 7505). Node liefert das als
 * `{ exchange: '', priority: 0 }` — ein MX-Record, der sagt, dass hier keine
 * Mail ankommt.
 */
describe('summarizeMx', () => {
  it('erkennt den Null-MX so, wie resolveMx ihn liefert', () => {
    expect(summarizeMx([{ exchange: '', priority: 0 }])).toEqual({ hasMx: true, nullMx: true });
  });

  it('meldet echte MX unverändert als vorhanden', () => {
    expect(
      summarizeMx([
        { exchange: 'mx1.example.com', priority: 10 },
        { exchange: 'mx2.example.com', priority: 20 },
      ])
    ).toEqual({ hasMx: true, nullMx: false });
  });

  it('meldet fehlende MX als fehlend', () => {
    expect(summarizeMx([])).toEqual({ hasMx: false, nullMx: false });
  });
});

/** #147: Zeigt der PTR jeder Mailserver-IP auf einen Namen, der zurück auf sie auflöst? */
describe('checkMxReverse (FCrDNS)', () => {
  const mx = (exchange: string, priority = 10) => ({ exchange, priority });
  const proto = dnsPromises.Resolver.prototype;

  beforeEach(() => {
    vi.spyOn(proto, 'resolve4').mockRejectedValue(dnsError('ENODATA'));
    vi.spyOn(proto, 'resolve6').mockRejectedValue(dnsError('ENODATA'));
    vi.spyOn(proto, 'reverse').mockRejectedValue(dnsError('ENOTFOUND'));
  });

  afterEach(() => vi.restoreAllMocks());

  /** Ein kleines DNS: Name → Adressen, Adresse → PTR. */
  function zone(forward: Record<string, string[]>, ptr: Record<string, string[]>) {
    const lookup = (table: Record<string, string[]>) => async (name: string) => {
      if (table[name]) return table[name];
      throw dnsError('ENOTFOUND');
    };
    const v4 = Object.fromEntries(Object.entries(forward).map(([k, v]) => [k, v.filter((a) => !a.includes(':'))]).filter(([, v]) => v.length));
    const v6 = Object.fromEntries(Object.entries(forward).map(([k, v]) => [k, v.filter((a) => a.includes(':'))]).filter(([, v]) => v.length));
    vi.mocked(proto.resolve4).mockImplementation(lookup(v4) as never);
    vi.mocked(proto.resolve6).mockImplementation(lookup(v6) as never);
    vi.mocked(proto.reverse).mockImplementation(lookup(ptr) as never);
  }

  it('bestätigt einen PTR, der zurück auf die IP auflöst — auch bei IPv6 in anderer Schreibweise', async () => {
    zone(
      { 'mx.example.net': ['192.0.2.1', '2001:db8::1'], 'out.example.net': ['192.0.2.1', '2001:DB8:0:0::1'] },
      { '192.0.2.1': ['out.example.net.'], '2001:db8::1': ['out.example.net'] }
    );
    expect(await checkMxReverse([mx('mx.example.net')])).toEqual([
      {
        host: 'mx.example.net',
        ips: [
          { ip: '192.0.2.1', ptr: ['out.example.net'], confirmed: true },
          { ip: '2001:db8::1', ptr: ['out.example.net'], confirmed: true },
        ],
      },
    ]);
  });

  it('widerlegt einen PTR, der woandershin zeigt, und meldet einen fehlenden PTR als leer', async () => {
    zone(
      { 'mx1.example.net': ['192.0.2.1'], 'mx2.example.net': ['192.0.2.2'], 'other.example.net': ['198.51.100.9'] },
      { '192.0.2.1': ['other.example.net'] }
    );
    const result = await checkMxReverse([mx('mx1.example.net'), mx('mx2.example.net', 20)]);
    expect(result).toEqual([
      { host: 'mx1.example.net', ips: [{ ip: '192.0.2.1', ptr: ['other.example.net'], confirmed: false }] },
      { host: 'mx2.example.net', ips: [{ ip: '192.0.2.2', ptr: [], confirmed: false }] },
    ]);
  });

  it('hält eine gescheiterte Abfrage als nicht prüfbar fest, statt „kein PTR“ zu behaupten', async () => {
    zone({ 'mx.example.net': ['192.0.2.1'] }, {});
    vi.mocked(proto.reverse).mockRejectedValue(dnsError('ETIMEOUT'));
    expect(await checkMxReverse([mx('mx.example.net')])).toEqual([
      { host: 'mx.example.net', ips: [{ ip: '192.0.2.1', ptr: [], confirmed: false, unchecked: true }] },
    ]);
  });

  // Codex-Review: Ein Timeout bei der Adressabfrage erschien als „keine IP-Adresse“.
  it('hält eine gescheiterte Adressabfrage als nicht prüfbar fest', async () => {
    zone({}, {});
    vi.mocked(proto.resolve4).mockRejectedValue(dnsError('ETIMEOUT'));
    expect(await checkMxReverse([mx('mx.example.net')])).toEqual([{ host: 'mx.example.net', ips: [], unchecked: true }]);
  });

  it('unterscheidet „keine Adresse“ von einem Ausfall', async () => {
    zone({}, {});
    expect(await checkMxReverse([mx('mx.example.net')])).toEqual([{ host: 'mx.example.net', ips: [] }]);
  });

  // Codex-Review: Nur drei PTR-Namen werden geprüft — passte keiner, hieß es „passt nicht“,
  // obwohl der vierte zurück auf die IP auflöste.
  it('widerlegt nicht, solange PTR-Namen über dem Budget ungeprüft bleiben', async () => {
    zone(
      {
        'mx.example.net': ['192.0.2.1'],
        'a.example.net': ['198.51.100.1'],
        'b.example.net': ['198.51.100.2'],
        'c.example.net': ['198.51.100.3'],
        'd.example.net': ['192.0.2.1'],
      },
      { '192.0.2.1': ['a.example.net', 'b.example.net', 'c.example.net', 'd.example.net'] }
    );
    const [host] = await checkMxReverse([mx('mx.example.net')]);
    expect(host.ips[0]).toMatchObject({ confirmed: false, unchecked: true });
  });

  it('prüft die wichtigsten vier Server, ohne Null-MX und Duplikate', async () => {
    zone({}, {});
    const result = await checkMxReverse([
      mx('', 0),
      mx('e.example.net', 50),
      mx('a.example.net', 5),
      mx('A.example.net.', 5),
      mx('b.example.net', 10),
      mx('c.example.net', 20),
      mx('d.example.net', 30),
    ]);
    expect(result.map((host) => host.host)).toEqual(['a.example.net', 'b.example.net', 'c.example.net', 'd.example.net']);
  });
});
