import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { errorText, findingText, setLanguage, spfIssueText } from '@/i18n';
import english from '@/i18n/en';
import { ApiError } from '@/lib/api';
import { FindingsList } from '@/modules/findings/FindingsList';
import { MailView } from '@/modules/mail/MailView';
import type { Finding, MailSecurity, SpfIssueKey, SslInfo, TextParams } from '@/types/dns';
import {
  dnsFindings,
  dnssecFindings,
  mailFindings,
  propagationFindings,
  sslFindings,
  whoisFindings,
} from '../../server/services/reportBuilder';

/**
 * Findings und Server-Meldungen auf Englisch (#86).
 *
 * Der erste Block ist der Vertrag zwischen Server und Wörterbuch: alle
 * Erzeuger laufen mit Eingaben, die jedes Finding mindestens einmal
 * auslösen, und jedes Ergebnis muss sich vollständig übersetzen lassen —
 * Kennung bekannt, alle Platzhalter mit Werten versorgt.
 *
 * Die SPF-Analyse (mailAudit.ts) bleibt außen vor: sie lädt node:dns, das
 * der Client-Typcheck nicht kennt. Ihre Kennungen prüft mailAudit.test.ts,
 * hier stehen sie so, wie analyzeSpf() sie liefert.
 */

const DAY = 86_400_000;

function ssl(overrides: Partial<SslInfo>): SslInfo {
  return {
    valid: true,
    issuer: "Let's Encrypt",
    subject: 'example.com',
    validFrom: '2026-09-01T00:00:00.000Z',
    validTo: '2026-12-01T00:00:00.000Z',
    daysUntilExpiry: 60,
    sans: [],
    tlsVersion: 'TLSv1.3',
    signatureAlgorithm: 'sha256WithRSAEncryption',
    isWildcard: false,
    ...overrides,
  };
}

function mail(overrides: Partial<MailSecurity>): MailSecurity {
  return {
    spf: { present: false, valid: false, issues: [] },
    dmarc: { present: false },
    dkim: { selectors: [] },
    mtaSts: { present: false },
    hasMx: true,
    ...overrides,
  };
}

/** SPF-Ergebnis wie von analyzeSpf(): deutscher Satz plus Kennung. */
function spf(...issues: [text: string, key: SpfIssueKey, params?: TextParams][]): MailSecurity['spf'] {
  return {
    present: true,
    record: 'v=spf1 …',
    lookupCount: 1,
    valid: issues.length === 0,
    issues: issues.map(([text]) => text),
    issueDetails: issues.map(([, key, params]) => (params ? { key, params } : { key })),
  };
}

const resolver = (id: string, values: string[]) => ({
  resolver: { id, name: id, ip: '1.1.1.1', country: 'DE', flag: '', provider: id },
  records: values.map((value) => ({ type: 'A' as const, name: 'example.com', value, ttl: 60 })),
  responseTimeMs: 10,
});

/** Möglichst jedes Finding einmal — je Zeile ein Erzeuger mit Eingabe. */
function everyFinding(): Finding[] {
  const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  return [
    ...dnsFindings([], 'example.com', 'example.com'),
    ...dnsFindings([], 'www.example.com', 'example.com'),
    ...dnsFindings([], 's1._domainkey.example.com', 'example.com'),
    ...dnsFindings(
      [{ type: 'CAA', name: 'example.com', value: '0 issue "letsencrypt.org"', ttl: 60 }],
      'example.com',
      'example.com'
    ),
    ...mailFindings(mail({}), 'example.com'),
    ...mailFindings(mail({ hasMx: false }), 'example.com'),
    ...mailFindings(
      mail({
        spf: spf(
          ['11 DNS-Lookups — RFC-Limit ist 10, SPF schlägt fehl.', 'spf-lookups-over-limit', { count: 11 }],
          ['+all erlaubt jeden Sender — bietet effektiv keinen Schutz.', 'spf-plus-all']
        ),
        dmarc: { present: true, policy: 'none' },
      }),
      'example.com'
    ),
    ...mailFindings(
      mail({
        spf: spf(
          ['9 DNS-Lookups — knapp am 10er-Limit.', 'spf-lookups-near-limit', { count: 9 }],
          ['Kein "all"-Mechanismus am Ende — ungewöhnlich, prüfe Policy.', 'spf-no-all']
        ),
        dmarc: { present: true },
      }),
      'example.com'
    ),
    ...mailFindings(
      mail({
        spf: spf(),
        dmarc: { present: true, policy: 'reject' },
        dkim: { selectors: [{ selector: 'google', present: true }] },
        mtaSts: { present: true },
      }),
      'example.com'
    ),
    // Gecachte Daten ohne Kennung: fällt auf die allgemeine zurück.
    ...mailFindings(mail({ spf: { present: true, valid: false, issues: ['Altes Problem'] } }), 'example.com'),
    ...dnssecFindings({ enabled: false, valid: false, chainOfTrust: 'none' }),
    ...dnssecFindings({ enabled: true, valid: false, chainOfTrust: 'incomplete' }),
    ...dnssecFindings({ enabled: true, valid: false, chainOfTrust: 'invalid' }),
    ...dnssecFindings({ enabled: true, valid: true, chainOfTrust: 'valid', algorithm: 'ECDSAP256SHA256' }),
    ...dnssecFindings({ enabled: true, valid: true, chainOfTrust: 'valid' }),
    ...sslFindings(null),
    ...sslFindings(ssl({ valid: false })),
    ...sslFindings(ssl({ valid: false, daysUntilExpiry: -3 })),
    ...sslFindings(ssl({ daysUntilExpiry: 1, tlsVersion: 'TLSv1' })),
    ...sslFindings(ssl({})),
    ...propagationFindings([resolver('a', ['1.1.1.1']), resolver('b', ['2.2.2.2'])]),
    ...propagationFindings([resolver('a', ['1.1.1.1']), resolver('b', ['1.1.1.1'])]),
    ...whoisFindings({ expiresAt: iso(-10) }),
    ...whoisFindings({ status: ['client hold', 'serverHold'] }),
    ...whoisFindings({ expiresAt: iso(3.5), createdAt: iso(-5), status: ['pendingDelete'] }),
    ...whoisFindings({ expiresAt: iso(20.5), status: ['pendingRestore', 'redemptionPeriod'] }),
  ];
}

beforeEach(async () => {
  await setLanguage('en', { persist: false });
});

describe('Vertrag Server ↔ englisches Wörterbuch', () => {
  const all = everyFinding();

  it('deckt jede Kennung der Erzeuger ab', () => {
    const produced = new Set(all.map((f) => f.key ?? f.id));
    const known = new Set(Object.keys(english.findings));
    // Jede erzeugte Kennung hat einen Eintrag …
    expect([...produced].filter((key) => !known.has(key))).toEqual([]);
    // … und jeder Eintrag wird von irgendeiner Eingabe oben erzeugt.
    expect([...known].filter((key) => !produced.has(key))).toEqual([]);
  });

  it('übersetzt jedes Finding vollständig', () => {
    for (const finding of all) {
      const text = findingText(finding);
      expect(text.title, finding.id).not.toBe(finding.title);
      expect(text.title + text.description, finding.id).not.toMatch(/\{\w+\}/);
      if (finding.fix?.explanation) {
        expect(text.fixExplanation, finding.id).toBeDefined();
        expect(text.fixExplanation, finding.id).not.toBe(finding.fix.explanation);
      }
    }
  });

  it('setzt Werte und Mehrzahl ein', () => {
    const [expiring] = sslFindings(ssl({ daysUntilExpiry: 1 }));
    expect(findingText(expiring).title).toBe('Certificate expires in 1 day');
    const [ok] = sslFindings(ssl({ daysUntilExpiry: 1234 }));
    expect(findingText(ok)).toMatchObject({
      title: 'SSL certificate valid (1,234 days left)',
      description: "Issued by Let's Encrypt via TLSv1.3.",
    });
  });
});

describe('Rückfall auf den Text des Servers', () => {
  const base: Finding = {
    id: 'ssl-expiring-soon',
    severity: 'warning',
    title: 'Zertifikat läuft in 5 Tagen ab',
    description: 'Jetzt erneuern.',
    category: 'ssl',
    params: { count: 5 },
  };

  it('bei unbekannter Kennung', () => {
    const finding = { ...base, id: 'gibt-es-noch-nicht', params: undefined };
    expect(findingText(finding).title).toBe('Zertifikat läuft in 5 Tagen ab');
  });

  it('bei fehlendem Wert, etwa aus einem alten Report', () => {
    expect(findingText({ ...base, params: undefined })).toMatchObject({
      title: 'Zertifikat läuft in 5 Tagen ab',
      description: 'Jetzt erneuern.',
    });
  });

  it('auf Deutsch immer', async () => {
    await setLanguage('de', { persist: false });
    expect(findingText(base).title).toBe('Zertifikat läuft in 5 Tagen ab');
  });
});

describe('Ansichten auf Englisch', () => {
  it('zeigt die Findings-Liste übersetzt, Unbekanntes deutsch', () => {
    const findings: Finding[] = [
      ...sslFindings(ssl({ daysUntilExpiry: 3 })),
      ...dnsFindings([], 'example.com', 'example.com').filter((f) => f.id === 'no-caa'),
      { id: 'neu-im-server', severity: 'info', title: 'Neuer Befund', description: 'Noch ohne Übersetzung.', category: 'dns' },
    ];
    render(<FindingsList findings={findings} />);

    expect(screen.getByText('Certificate expires in 3 days')).toBeInTheDocument();
    expect(screen.getByText('No CAA record')).toBeInTheDocument();
    expect(screen.getByText('Add a CAA record that only allows the CA you actually use.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy snippet' })).toBeInTheDocument();
    expect(screen.getAllByText('Warning')).not.toHaveLength(0);
    expect(screen.getByText('Neuer Befund')).toBeInTheDocument();
  });

  it('übersetzt die SPF-Probleme in der Mail-Ansicht', () => {
    render(
      <MailView
        mail={mail({
          spf: spf(['+all erlaubt jeden Sender — bietet effektiv keinen Schutz.', 'spf-plus-all']),
        })}
      />
    );
    const card = screen.getByText('Who may send email in your name?').closest('.card') as HTMLElement;
    expect(within(card).getByText('+all allows any sender — it offers effectively no protection.')).toBeInTheDocument();
    expect(within(card).getByText('has issues')).toBeInTheDocument();
    expect(spfIssueText('Altes Problem')).toBe('Altes Problem');
  });
});

describe('Fehlermeldungen', () => {
  it('übersetzt nach Code und setzt Werte ein', () => {
    const error = new ApiError({
      error: 'invalid_domain',
      message: '"x y" sieht nicht nach einer gültigen Domain aus.',
      params: { input: 'x y' },
    });
    expect(errorText(error, 'Lookup fehlgeschlagen')).toBe('"x y" doesn’t look like a valid domain.');
  });

  it('bleibt beim Server-Text, wenn ein Wert fehlt oder der Code unbekannt ist', () => {
    const old = new ApiError({ error: 'invalid_domain', message: 'Alte Meldung' });
    expect(errorText(old, 'Lookup fehlgeschlagen')).toBe('Alte Meldung');
    const unknown = new ApiError({ error: 'ganz_neu', message: 'Neue Meldung' });
    expect(errorText(unknown, 'Lookup fehlgeschlagen')).toBe('Neue Meldung');
  });

  it('nimmt den Ersatztext, wenn der Fehler nichts mitbringt', () => {
    expect(errorText(undefined, 'Lookup fehlgeschlagen')).toBe('Lookup failed');
  });

  it('zeigt auf Deutsch die Meldung des Servers', async () => {
    await setLanguage('de', { persist: false });
    const error = new ApiError({ error: 'invalid_domain', message: 'Server-Text', params: { input: 'x' } });
    expect(errorText(error, 'Lookup fehlgeschlagen')).toBe('Server-Text');
  });
});
