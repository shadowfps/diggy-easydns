import { describe, expect, it } from 'vitest';
import { isNullMx, noMailProtection, spfAllowsNoSender } from './nullMx.js';
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
