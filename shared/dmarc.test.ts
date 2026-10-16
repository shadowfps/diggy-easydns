import { describe, expect, it } from 'vitest';
import {
  declaredDmarcPolicy,
  dmarcPolicyFlawLabel,
  dmarcPolicyFlawText,
  effectiveDmarcPolicy,
  hasDmarcReportUri,
} from './dmarc.js';

/** #107: Ohne gültiges p= gilt RFC 7489 §6.6.3 — mit rua= wie p=none, sonst wie kein DMARC. */
describe('effectiveDmarcPolicy', () => {
  it.each([
    ['v=DMARC1; p=reject', 'reject'],
    ['v=DMARC1; p=quarantine; pct=50', 'quarantine'],
    ['v=DMARC1; p=none; rua=mailto:dmarc@example.com', 'none'],
    ['v=DMARC1; P=REJECT', 'reject'],
    ['v=DMARC1; sp=none; p=reject', 'reject'],
  ] as const)('übernimmt ein gültiges p= unverändert: %s', (record, policy) => {
    expect(effectiveDmarcPolicy(record)).toEqual({ policy });
  });

  it('wertet einen Record ohne p=, aber mit rua= wie p=none', () => {
    expect(effectiveDmarcPolicy('v=DMARC1; rua=mailto:x@y')).toEqual({
      policy: 'none',
      flaw: { kind: 'p-missing' },
    });
  });

  it('ignoriert einen Record ohne p= und ohne rua=', () => {
    expect(effectiveDmarcPolicy('v=DMARC1')).toEqual({ policy: null, flaw: { kind: 'p-missing' } });
  });

  it('behandelt einen ungültigen Wert wie ein fehlendes p=', () => {
    expect(effectiveDmarcPolicy('v=DMARC1; p=foo; rua=mailto:x@y')).toEqual({
      policy: 'none',
      flaw: { kind: 'p-invalid', value: 'foo' },
    });
    expect(effectiveDmarcPolicy('v=DMARC1; p=foo')).toEqual({
      policy: null,
      flaw: { kind: 'p-invalid', value: 'foo' },
    });
  });

  /** Doppelte Tags: Es zählt das erste (mailTags.ts), auch wenn es leer ist. */
  it('zählt ein leeres p= als ungültig, auch wenn später ein gültiges folgt', () => {
    expect(effectiveDmarcPolicy('v=DMARC1; p=; p=reject; rua=mailto:x@y')).toEqual({
      policy: 'none',
      flaw: { kind: 'p-invalid', value: '' },
    });
  });

  /** sp= gilt nur für Subdomains und ersetzt kein p= (RFC 7489 §6.3). */
  it('lässt ein gültiges sp= nicht für das fehlende p= einspringen', () => {
    expect(effectiveDmarcPolicy('v=DMARC1; sp=reject')).toEqual({
      policy: null,
      flaw: { kind: 'p-missing' },
    });
    expect(effectiveDmarcPolicy('v=DMARC1; sp=reject; rua=mailto:x@y').policy).toBe('none');
  });

  /** pct gehört zu einem gültigen p= — beim Ersatz-none ändert es nichts. */
  it('wird von pct nicht beeinflusst', () => {
    expect(effectiveDmarcPolicy('v=DMARC1; pct=0; rua=mailto:x@y').policy).toBe('none');
    expect(effectiveDmarcPolicy('v=DMARC1; pct=100').policy).toBeNull();
  });

  it('liefert ohne Record keine Policy und keinen Mangel', () => {
    expect(effectiveDmarcPolicy(undefined)).toEqual({ policy: null });
  });
});

describe('declaredDmarcPolicy', () => {
  it('liest nur gültige Werte, unabhängig von der Schreibweise', () => {
    expect(declaredDmarcPolicy('v=DMARC1; p=Quarantine')).toBe('quarantine');
    expect(declaredDmarcPolicy('v=DMARC1; p=foo; rua=mailto:x@y')).toBeUndefined();
    expect(declaredDmarcPolicy('v=DMARC1; sp=reject')).toBeUndefined();
  });
});

describe('hasDmarcReportUri', () => {
  it.each([
    'v=DMARC1; rua=mailto:x@y',
    'v=DMARC1; rua=mailto:dmarc@example.com!10m',
    'v=DMARC1; rua=https://reports.example.net/dmarc',
    // Ein gültiges Ziel genügt (§6.6.3: „at least one“).
    'v=DMARC1; rua=dmarc@example.com, mailto:dmarc@example.com',
  ])('erkennt eine gültige Report-Adresse: %s', (record) => {
    expect(hasDmarcReportUri(record)).toBe(true);
  });

  it.each([
    'v=DMARC1',
    'v=DMARC1; rua=',
    'v=DMARC1; rua=mailto:',
    // Häufiger Tippfehler: ohne Schema kein URI.
    'v=DMARC1; rua=dmarc@example.com',
    'v=DMARC1; rua=mailto:a b@example.com',
    // ruf= ist für Einzelberichte, nicht die Bedingung aus §6.6.3.
    'v=DMARC1; ruf=mailto:x@y',
  ])('verwirft fehlende oder ungültige Adressen: %s', (record) => {
    expect(hasDmarcReportUri(record)).toBe(false);
  });
});

describe('dmarcPolicyFlawText / dmarcPolicyFlawLabel', () => {
  it('beschreibt den Mangel', () => {
    expect(dmarcPolicyFlawText({ kind: 'p-missing' })).toBe('p= fehlt');
    expect(dmarcPolicyFlawText({ kind: 'p-invalid', value: '' })).toBe('p= ist leer');
    expect(dmarcPolicyFlawText({ kind: 'p-invalid', value: 'foo' })).toBe('p=foo ist ungültig');
    expect(dmarcPolicyFlawLabel({ kind: 'p-missing' })).toBe('p= fehlt');
    expect(dmarcPolicyFlawLabel({ kind: 'p-invalid', value: 'foo' })).toBe('p= ungültig');
  });

  it('kürzt lange Werte aus fremdem DNS', () => {
    const text = dmarcPolicyFlawText({ kind: 'p-invalid', value: 'x'.repeat(200) });
    expect(text).toBe(`p=${'x'.repeat(20)}… ist ungültig`);
  });
});
