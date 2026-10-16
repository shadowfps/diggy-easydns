import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateScore } from '../../shared/scoring.js';
import type { Finding } from '../types.js';

/**
 * „Fehlt“ oder „nicht prüfbar“? (#101)
 *
 * Je Check beide Fälle: eine echte Abwesenheit (NXDOMAIN/NODATA, unsignierte
 * Zone) wird gemeldet wie bisher, ein Ausfall (Timeout, SERVFAIL) wird ein
 * Hinweis ohne Punktabzug. Die Ausgangslage ist eine sonst einwandfreie
 * Mail-Domain, damit der Score allein den einen Check zeigt: 100 heißt kein
 * Abzug.
 */

const dns = vi.hoisted(() => ({ resolveTxt: vi.fn(), resolveMx: vi.fn() }));

vi.mock('node:dns', () => {
  class Resolver {
    setServers() {}
    resolveTxt = dns.resolveTxt;
    resolveMx = dns.resolveMx;
  }
  return { promises: { Resolver } };
});

vi.mock('./doh.js', () => ({
  DOH_RESOLVERS: [{ id: 'cloudflare' }, { id: 'google' }],
  dohQuery: vi.fn(),
}));

const { auditMail } = await import('./mailAudit.js');
const { lookupSpfRecord } = await import('./dnsLookup.js');
const { checkDnssec } = await import('./dnssec.js');
const { dnssecFindings, mailFindings } = await import('./reportBuilder.js');
const { dohQuery } = await import('./doh.js');

const DOMAIN = 'example.com';
const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** TXT-Antworten je Name; nicht genannte Namen gibt es nicht (ENOTFOUND). */
function txt(overrides: Record<string, string | Error> = {}) {
  const answers: Record<string, string | Error> = {
    [DOMAIN]: 'v=spf1 mx -all',
    [`_dmarc.${DOMAIN}`]: 'v=DMARC1; p=reject',
    [`default._domainkey.${DOMAIN}`]: 'v=DKIM1; k=rsa; p=MIIBIjANBgkq',
    [`_mta-sts.${DOMAIN}`]: 'v=STSv1; id=1',
    // BIMI und TLS-RPT (#83) kosten zwar keine Punkte, gehören aber zu einer
    // einwandfreien Mail-Domain — ohne sie stünden ihre Hinweise in der Liste.
    [`_smtp._tls.${DOMAIN}`]: `v=TLSRPTv1; rua=mailto:tls@${DOMAIN}`,
    [`default._bimi.${DOMAIN}`]: `v=BIMI1; l=https://${DOMAIN}/bimi/logo.svg`,
    ...overrides,
  };
  dns.resolveTxt.mockImplementation(async (name: string) => {
    const answer = answers[name] ?? dnsError('ENOTFOUND');
    if (answer instanceof Error) throw answer;
    return [[answer]];
  });
}

async function mailCheck() {
  const mail = await auditMail(DOMAIN, await lookupSpfRecord(DOMAIN));
  const findings = mailFindings(mail, DOMAIN);
  return { mail, findings, ids: ids(findings), score: calculateScore(findings).score };
}

const ids = (findings: Finding[]) => findings.map((finding) => finding.id);

beforeEach(() => {
  vi.clearAllMocks();
  dns.resolveMx.mockResolvedValue([{ exchange: `mx.${DOMAIN}`, priority: 10 }]);
});

describe('Ausgangslage', () => {
  it('meldet die einwandfreie Mail-Domain ohne Abzug', async () => {
    txt();
    const { ids: found, score } = await mailCheck();
    expect(found).toEqual([
      'spf-ok',
      'dmarc-present',
      'dkim-present',
      'tls-rpt-present',
      'bimi-present',
    ]);
    expect(score).toBe(100);
  });
});

describe('DMARC', () => {
  it('Timeout: Hinweis „nicht prüfbar“, kein Abzug', async () => {
    txt({ [`_dmarc.${DOMAIN}`]: dnsError('ETIMEOUT') });
    const { mail, findings, score } = await mailCheck();

    expect(mail.dmarc).toEqual({ present: false, lookupFailed: 'timeout' });
    const finding = findings.find((f) => f.id === 'dmarc-unchecked');
    expect(finding).toMatchObject({ severity: 'info', unchecked: true, category: 'mail' });
    expect(finding?.title).toBe('DMARC konnte nicht geprüft werden — Zeitüberschreitung');
    expect(ids(findings)).not.toContain('no-dmarc');
    expect(score).toBe(100);
  });

  it('SERVFAIL: ebenso, mit dem Grund im Titel', async () => {
    txt({ [`_dmarc.${DOMAIN}`]: dnsError('ESERVFAIL') });
    const { mail, findings, score } = await mailCheck();

    expect(mail.dmarc.lookupFailed).toBe('servfail');
    expect(findings.find((f) => f.id === 'dmarc-unchecked')?.title).toMatch(/SERVFAIL$/);
    expect(score).toBe(100);
  });

  it.each(['ENOTFOUND', 'ENODATA'])('%s: „fehlt“ wie bisher, als Warnung', async (code) => {
    txt({ [`_dmarc.${DOMAIN}`]: dnsError(code) });
    const { mail, ids: found, score } = await mailCheck();

    expect(mail.dmarc).toEqual({ present: false });
    expect(found).toContain('no-dmarc');
    expect(score).toBe(92);
  });
});

describe('SPF', () => {
  it('Timeout: Hinweis „nicht prüfbar“, kein Abzug', async () => {
    txt({ [DOMAIN]: dnsError('ETIMEOUT') });
    const { mail, ids: found, score } = await mailCheck();

    expect(mail.spf).toMatchObject({ present: false, lookupFailed: 'timeout' });
    expect(found).toContain('spf-unchecked');
    expect(found).not.toContain('no-spf');
    expect(score).toBe(100);
  });

  it('kein SPF-Record: „fehlt“ wie bisher', async () => {
    txt({ [DOMAIN]: dnsError('ENODATA') });
    const { mail, ids: found, score } = await mailCheck();

    expect(mail.spf).not.toHaveProperty('lookupFailed');
    expect(found).toContain('no-spf');
    expect(score).toBe(92);
  });
});

describe('DKIM', () => {
  it('ohne Fund und mit gescheiterter Probe: nicht prüfbar', async () => {
    txt({
      [`default._domainkey.${DOMAIN}`]: dnsError('ENOTFOUND'),
      [`google._domainkey.${DOMAIN}`]: dnsError('ETIMEOUT'),
    });
    const { mail, ids: found, score } = await mailCheck();

    expect(mail.dkim).toEqual({ selectors: [], lookupFailed: 'timeout' });
    expect(found).toContain('dkim-unchecked');
    expect(found).not.toContain('no-dkim-found');
    expect(score).toBe(100);
  });

  it('mit Fund zählt eine gescheiterte Probe nicht', async () => {
    txt({ [`google._domainkey.${DOMAIN}`]: dnsError('ETIMEOUT') });
    const { mail, ids: found } = await mailCheck();

    expect(mail.dkim).not.toHaveProperty('lookupFailed');
    expect(found).toContain('dkim-present');
  });

  it('kein Selector gefunden: Hinweis wie bisher', async () => {
    txt({ [`default._domainkey.${DOMAIN}`]: dnsError('ENOTFOUND') });
    const { ids: found, score } = await mailCheck();

    expect(found).toContain('no-dkim-found');
    expect(score).toBe(98);
  });
});

describe('MTA-STS', () => {
  it('SERVFAIL: Hinweis „nicht prüfbar“, kein Abzug', async () => {
    txt({ [`_mta-sts.${DOMAIN}`]: dnsError('ESERVFAIL') });
    const { mail, ids: found, score } = await mailCheck();

    expect(mail.mtaSts).toEqual({ present: false, lookupFailed: 'servfail' });
    expect(found).toContain('mta-sts-unchecked');
    expect(found).not.toContain('no-mta-sts');
    expect(score).toBe(100);
  });

  it('nicht eingerichtet: Hinweis wie bisher', async () => {
    txt({ [`_mta-sts.${DOMAIN}`]: dnsError('ENOTFOUND') });
    const { ids: found, score } = await mailCheck();

    expect(found).toContain('no-mta-sts');
    expect(score).toBe(98);
  });
});

describe('DNSSEC', () => {
  /** Antwort mit RCODE `status`; `signed`: mit einem Record des gefragten Typs. */
  type Reply = Error | number | 'signed';

  const timeout = () =>
    Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });

  /** DS und DNSKEY nach Wunsch, die A-Abfrage (AD-Flag) ohne Records. */
  function doh(replies: { DS: Reply; DNSKEY: Reply }) {
    vi.mocked(dohQuery).mockImplementation(async (_resolver, _domain, type) => {
      const reply = type === 'DS' || type === 'DNSKEY' ? replies[type] : 0;
      if (reply instanceof Error) throw reply;
      const value = type === 'DS' ? '2371 13 2 ABCD' : '257 3 13 abcd';
      const records = reply === 'signed' ? [{ type, name: DOMAIN, value, ttl: 300 }] : [];
      return {
        records,
        authenticated: false,
        status: reply === 'signed' ? 0 : reply,
        responseTimeMs: 1,
      };
    });
  }

  async function dnssecCheck() {
    const dnssec = await checkDnssec(DOMAIN);
    const findings = dnssecFindings(dnssec);
    return { dnssec, ids: ids(findings), findings, score: calculateScore(findings).score };
  }

  it('Timeout (abgebrochener DoH-Request): nicht prüfbar, kein Abzug', async () => {
    doh({ DS: 'signed', DNSKEY: timeout() });
    const { dnssec, findings, score } = await dnssecCheck();

    expect(dnssec).toMatchObject({ enabled: false, lookupFailed: 'timeout' });
    expect(findings).toEqual([
      expect.objectContaining({
        id: 'dnssec-unchecked',
        severity: 'info',
        unchecked: true,
        title: 'DNSSEC konnte nicht geprüft werden — Zeitüberschreitung',
      }),
    ]);
    expect(score).toBe(100);
  });

  /**
   * Das Muster einer kaputten Signatur: der Parent kennt einen DS, der
   * validierende Resolver weist die DNSKEY-Antwort mit SERVFAIL ab. Ohne
   * Abfrage mit CD-Flag nicht von einem Ausfall zu trennen — deshalb „nicht
   * prüfbar“, aber mit dem Hinweis darauf.
   */
  it('SERVFAIL bei vorhandenem DS: nicht prüfbar, mit Hinweis auf kaputte Signaturen', async () => {
    doh({ DS: 'signed', DNSKEY: 2 });
    const { dnssec, findings, score } = await dnssecCheck();

    expect(dnssec.lookupFailed).toBe('servfail');
    expect(findings[0].id).toBe('dnssec-unchecked');
    expect(findings[0].description).toMatch(/fehlerhafte DNSSEC-Signatur/);
    expect(score).toBe(100);
  });

  it('HTTP-Fehler des Resolvers: Netzwerkfehler', async () => {
    doh({ DS: new Error('cloudflare HTTP 503'), DNSKEY: 'signed' });
    expect((await dnssecCheck()).dnssec.lookupFailed).toBe('network');
  });

  it.each([
    ['unsignierte Zone (NOERROR ohne Records)', 0],
    ['NXDOMAIN', 3],
  ])('%s: „nicht aktiviert“ wie bisher', async (_label, status) => {
    doh({ DS: status, DNSKEY: status });
    const { dnssec, ids: found, score } = await dnssecCheck();

    expect(dnssec).not.toHaveProperty('lookupFailed');
    expect(found).toEqual(['dnssec-off']);
    expect(score).toBe(98);
  });

  /**
   * Ohne DS beim Parent oder ohne DNSKEY in der Zone ist DNSSEC aus — was die
   * andere Abfrage ergibt, ändert daran nichts. Sonst würde aus der häufigsten
   * Lage, einer unsignierten Domain, bei jedem Ausfall „nicht prüfbar“; und
   * Nameserver, die DNSKEY-Abfragen mit SERVFAIL beantworten, sparten sich
   * den Abzug.
   */
  it.each([
    ['kein DS, DNSKEY mit SERVFAIL', { DS: 0, DNSKEY: 2 }],
    ['kein DS, DNSKEY im Timeout', { DS: 0, DNSKEY: timeout() }],
    ['DS im Timeout, kein DNSKEY', { DS: timeout(), DNSKEY: 0 }],
  ] as const)('%s: „nicht aktiviert“, nicht „nicht prüfbar“', async (_label, replies) => {
    doh(replies);
    const { dnssec, ids: found, score } = await dnssecCheck();

    expect(dnssec).not.toHaveProperty('lookupFailed');
    expect(found).toEqual(['dnssec-off']);
    expect(score).toBe(98);
  });
});
