import { describe, expect, it } from 'vitest';
import {
  dmarcPct,
  isNullMx,
  noMailProtection,
  spfAllowsNoSender,
  spfMechanisms,
} from './nullMx.js';
import type { MailSecurity } from './types/dns.js';

describe('isNullMx', () => {
  /**
   * So kommt `MX 0 .` von example.com tatsächlich an: `resolveMx` liefert das
   * leere Ziel als Leerstring, der DoH-Parser schneidet den Punkt ab.
   */
  it('erkennt den Null-MX mit leerem Ziel', () => {
    expect(isNullMx([{ priority: 0, value: '' }])).toBe(true);
  });

  it('erkennt ihn auch in Zonendatei-Schreibweise', () => {
    expect(isNullMx([{ priority: 0, value: '.' }])).toBe(true);
  });

  it('verlangt Präferenz 0 (RFC 7505 §3)', () => {
    expect(isNullMx([{ priority: 10, value: '' }])).toBe(false);
    expect(isNullMx([{ value: '' }])).toBe(false);
  });

  /** Neben einem echten MX stellen Absender dorthin zu — die Domain empfängt. */
  it('gilt nicht, wenn noch ein weiterer MX daneben steht', () => {
    expect(
      isNullMx([
        { priority: 0, value: '' },
        { priority: 10, value: 'mx.example.com' },
      ])
    ).toBe(false);
  });

  it('ist kein Null-MX bei echten oder fehlenden MX', () => {
    expect(isNullMx([{ priority: 0, value: 'mx.example.com' }])).toBe(false);
    expect(isNullMx([])).toBe(false);
  });
});

describe('spfAllowsNoSender', () => {
  it('akzeptiert genau v=spf1 -all', () => {
    expect(spfAllowsNoSender('v=spf1 -all')).toBe(true);
    expect(spfAllowsNoSender('  V=SPF1   -ALL ')).toBe(true);
  });

  it('lehnt Softfail und erlaubte Absender ab', () => {
    expect(spfAllowsNoSender('v=spf1 ~all')).toBe(false);
    expect(spfAllowsNoSender('v=spf1 include:_spf.google.com -all')).toBe(false);
    expect(spfAllowsNoSender('v=spf1 mx -all')).toBe(false);
  });

  it('ist ohne Record falsch', () => {
    expect(spfAllowsNoSender(undefined)).toBe(false);
    expect(spfAllowsNoSender('')).toBe(false);
  });

  /** RFC 7208 §6: exp= ist nur der Ablehnungstext, redirect= gilt neben all nicht. */
  it('lässt Modifier neben -all zu', () => {
    expect(spfAllowsNoSender('v=spf1 -all exp=explain._spf.example.com')).toBe(true);
    expect(spfAllowsNoSender('v=spf1 -all redirect=_spf.example.net')).toBe(true);
  });

  /** Ohne all entscheidet der Ziel-Record — und der kann Absender erlauben. */
  it('lehnt redirect ohne -all ab', () => {
    expect(spfAllowsNoSender('v=spf1 redirect=_spf.example.net')).toBe(false);
  });

  it('verlangt das Versions-Tag am Anfang', () => {
    expect(spfAllowsNoSender('-all v=spf1')).toBe(false);
    expect(spfAllowsNoSender('v=spf10 -all')).toBe(false);
  });
});

describe('spfMechanisms', () => {
  it('liefert nur die Mechanismen, kleingeschrieben', () => {
    expect(spfMechanisms('v=spf1 MX include:_spf.example.net ~ALL exp=x.example.com')).toEqual([
      'mx',
      'include:_spf.example.net',
      '~all',
    ]);
  });

  it('ist ohne SPF-Version undefined', () => {
    expect(spfMechanisms('google-site-verification=abc')).toBeUndefined();
  });
});

describe('dmarcPct', () => {
  it('ist ohne pct 100', () => {
    expect(dmarcPct('v=DMARC1; p=reject')).toBe(100);
    expect(dmarcPct(undefined)).toBe(100);
  });

  it('liest pct, auch ohne Leerzeichen und in Großbuchstaben', () => {
    expect(dmarcPct('v=DMARC1; p=reject; pct=50')).toBe(50);
    expect(dmarcPct('v=DMARC1;PCT=0;p=reject')).toBe(0);
  });

  /** RFC 7489 §6.3: Syntaxfehler fallen auf den Standardwert zurück. */
  it('nimmt bei ungültigem Wert den Standard', () => {
    expect(dmarcPct('v=DMARC1; p=reject; pct=abc')).toBe(100);
  });

  it.each(['', '-1', '+50', '50.5', '50abc', '5 0'])('verwirft ungültiges pct=%s', (value) => {
    expect(dmarcPct(`v=DMARC1; pct=${value}`)).toBe(100);
  });

  it('toleriert Leerzeichen und begrenzt den Anteil weiterhin auf 100', () => {
    expect(dmarcPct(' pct \t= 050 ; p=reject')).toBe(50);
    expect(dmarcPct('p=reject; pct=101')).toBe(100);
  });

  it('vergleicht den Namen exakt und nimmt bei Duplikaten nur den ersten Wert', () => {
    expect(dmarcPct('xpct=0; pct=50; pct=0')).toBe(50);
    expect(dmarcPct('xpct=0')).toBe(100);
    expect(dmarcPct('pct=abc; pct=0')).toBe(100);
    expect(dmarcPct('pct=; pct=0')).toBe(100);
  });
});

describe('noMailProtection', () => {
  const mail = (overrides: Partial<MailSecurity> = {}): MailSecurity => ({
    spf: { present: true, record: 'v=spf1 -all', lookupCount: 0, valid: true, issues: [] },
    dmarc: { present: true, record: 'v=DMARC1;p=reject', policy: 'reject' },
    dkim: { selectors: [] },
    mtaSts: { present: false },
    hasMx: true,
    nullMx: true,
    ...overrides,
  });

  it('ist mit Null-MX, SPF -all und DMARC reject vollständig', () => {
    expect(noMailProtection(mail())).toEqual({
      spfAllowsNoSender: true,
      dmarcReject: true,
      complete: true,
    });
  });

  it('ist ohne SPF -all unvollständig', () => {
    const result = noMailProtection(
      mail({ spf: { present: true, record: 'v=spf1 ~all', lookupCount: 0, valid: true, issues: [] } })
    );
    expect(result.spfAllowsNoSender).toBe(false);
    expect(result.complete).toBe(false);
  });

  /** pct=0 heißt: keine Fälschung wird abgelehnt, alle landen nur in Quarantäne. */
  it('ist mit DMARC reject nur für einen Teil der Mails (pct) unvollständig', () => {
    for (const record of ['v=DMARC1; p=reject; pct=0', 'v=DMARC1; p=reject; pct=50']) {
      const result = noMailProtection(mail({ dmarc: { present: true, record, policy: 'reject' } }));
      expect(result.dmarcReject).toBe(false);
      expect(result.complete).toBe(false);
    }
    expect(
      noMailProtection(
        mail({ dmarc: { present: true, record: 'v=DMARC1; p=reject; pct=100', policy: 'reject' } })
      ).complete
    ).toBe(true);
  });

  /**
   * #107: Ohne gültiges p= wirkt der Record höchstens wie p=none (RFC 7489
   * §6.6.3) — auch neben sp=reject, das nur Subdomains regelt.
   */
  it.each([
    'v=DMARC1; sp=reject',
    'v=DMARC1; sp=reject; rua=mailto:dmarc@example.net',
    'v=DMARC1; p=rejected; sp=reject; rua=mailto:dmarc@example.net',
  ])('ist mit DMARC ohne gültiges p= unvollständig: %s', (record) => {
    const result = noMailProtection(mail({ dmarc: { present: true, record } }));
    expect(result.dmarcReject).toBe(false);
    expect(result.complete).toBe(false);
  });

  it('ist mit DMARC quarantine unvollständig', () => {
    const result = noMailProtection(mail({ dmarc: { present: true, policy: 'quarantine' } }));
    expect(result.dmarcReject).toBe(false);
    expect(result.complete).toBe(false);
  });

  /** SPF -all allein macht keine Domain mail-frei: ohne MX greift der A-Fallback. */
  it('ist ohne Null-MX nie vollständig — auch mit SPF -all und DMARC reject', () => {
    expect(noMailProtection(mail({ nullMx: false, hasMx: false })).complete).toBe(false);
  });
});
