import { describe, expect, it } from 'vitest';
import { analyzeSpf, countSpfLookups } from './mailAudit.js';

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
});
