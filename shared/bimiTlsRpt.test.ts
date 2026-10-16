import { describe, expect, it } from 'vitest';
import { bimiDmarcGap, isHttpsUrl, parseBimi, parseTlsRpt } from './bimiTlsRpt.js';
import type { MailSecurity } from './types/dns.js';

describe('parseBimi', () => {
  it('liest Logo und Zertifikat aus einem üblichen Record', () => {
    // So veröffentlicht ihn paypal.com (Stand Oktober 2026).
    const record =
      'v=BIMI1; l=https://www.paypalobjects.com/marketing/web/logos/paypal_ppe.svg; a=https://www.paypalobjects.com/marketing/web/logos/PPE_UK_DE_paypal_inc.pem';
    expect(parseBimi([record])).toEqual({
      present: true,
      records: [record],
      logoUrl: 'https://www.paypalobjects.com/marketing/web/logos/paypal_ppe.svg',
      evidenceUrl: 'https://www.paypalobjects.com/marketing/web/logos/PPE_UK_DE_paypal_inc.pem',
    });
  });

  it('kommt ohne Zertifikat aus — a= ist optional', () => {
    const bimi = parseBimi(['v=BIMI1; l=https://example.com/logo.svg;']);
    expect(bimi).toMatchObject({ present: true, logoUrl: 'https://example.com/logo.svg' });
    expect(bimi.evidenceUrl).toBeUndefined();
    expect(bimi.invalid).toBeUndefined();
  });

  it('meldet einen fehlenden Record als fehlend', () => {
    expect(parseBimi([])).toEqual({ present: false });
  });

  /** mailbox.org hat unter default._bimi ein Token stehen, keinen BIMI-Record. */
  it('übergeht fremde TXT-Records unter dem Namen', () => {
    expect(parseBimi(['mmdxtly5wtl64qpt6hn4jgpfsr1hl0np'])).toEqual({ present: false });
    expect(parseBimi(['v=spf1 -all'])).toEqual({ present: false });
  });

  /** Leeres l= und a= ist ein ausdrücklicher Verzicht (Draft §4.3.1), kein Fehler. */
  it.each(['v=BIMI1; l=; a=;', 'v=BIMI1; l=', 'v=BIMI1;l=;a='])(
    'erkennt den bewussten Verzicht: %s',
    (record) => {
      const bimi = parseBimi([record]);
      expect(bimi).toMatchObject({ present: true, declined: true });
      expect(bimi.invalid).toBeUndefined();
      expect(bimi.logoUrl).toBeUndefined();
    }
  );

  it('lässt Leerzeichen um = und ; zu (Draft §4.3: *WSP)', () => {
    expect(parseBimi([' v = BIMI1 ; l = https://example.com/logo.svg ; a = '])).toMatchObject({
      present: true,
      logoUrl: 'https://example.com/logo.svg',
    });
  });

  it.each([
    ['l=https://example.com/logo.svg; v=BIMI1', 'v=BIMI1 muss als erstes Tag stehen'],
    ['l=https://example.com/logo.svg', 'v=BIMI1 fehlt am Anfang'],
    // Schreibfehler korrigieren Empfänger nicht (§4.3).
    ['v=bimi1; l=https://example.com/logo.svg', 'Die Version muss genau v=BIMI1 lauten, nicht v=bimi1'],
    ['v=BIMI1', 'l= fehlt — das Tag ist Pflicht, zum Verzichten leer'],
    ['v=BIMI1; l=http://example.com/logo.svg', 'Die Logo-URL in l= muss mit https:// beginnen'],
    ['v=BIMI1; l=https://example.com/logo.PNG', 'Das Logo muss ein SVG sein (SVG Tiny PS), kein Pixelbild'],
    ['v=BIMI1; l=https://example.com/logo.svg; a=http://example.com/vmc.pem', 'Die Zertifikats-URL in a= muss mit https:// beginnen'],
    ['v=BIMI1; l=; a=https://example.com/vmc.pem', 'l= ist leer, a= aber gesetzt — ohne Logo-URL zeigen Empfänger kein Logo'],
  ])('nennt den Grund für einen ungültigen Record: %s', (record, invalid) => {
    expect(parseBimi([record])).toMatchObject({ present: true, records: [record], invalid });
  });

  it('meldet zwei BIMI-Records als ungültig (Draft §7.2)', () => {
    const records = ['v=BIMI1; l=https://example.com/a.svg', 'v=BIMI1; l=https://example.com/b.svg'];
    expect(parseBimi(records)).toEqual({
      present: true,
      records,
      invalid: '2 BIMI-Records — es darf nur einen geben',
    });
  });

  /** Was nicht mit v=BIMI1 beginnt, verwerfen Empfänger — es bleibt einer übrig. */
  it('wertet den einen gültigen neben einem verworfenen aus', () => {
    expect(
      parseBimi(['v=bimi1; l=https://example.com/a.svg', 'v=BIMI1; l=https://example.com/b.svg'])
    ).toMatchObject({ present: true, logoUrl: 'https://example.com/b.svg' });
  });

  it('lässt keine fremden Schemes als Logo-Link durch', () => {
    const bimi = parseBimi(['v=BIMI1; l=javascript:alert(1)']);
    expect(bimi.logoUrl).toBeUndefined();
    expect(bimi.invalid).toBe('Die Logo-URL in l= muss mit https:// beginnen');
  });
});

describe('parseTlsRpt', () => {
  it('liest das Berichtsziel', () => {
    // google.com, ohne Leerzeichen nach dem Semikolon.
    expect(parseTlsRpt(['v=TLSRPTv1;rua=mailto:sts-reports@google.com'])).toEqual({
      present: true,
      records: ['v=TLSRPTv1;rua=mailto:sts-reports@google.com'],
      rua: ['mailto:sts-reports@google.com'],
    });
  });

  it('liest mehrere, kommagetrennte Ziele — auch https (RFC 8460 §3)', () => {
    expect(
      parseTlsRpt(['v=TLSRPTv1; rua=mailto:tls@example.com , https://reports.example.net/tlsrpt;'])
        .rua
    ).toEqual(['mailto:tls@example.com', 'https://reports.example.net/tlsrpt']);
  });

  it('lässt Leerzeichen um ; zu (field-delim) und erhält Großbuchstaben in Adressen', () => {
    expect(parseTlsRpt(['  v=TLSRPTv1 ;  rua=mailto:TLS@Example.com  '])).toMatchObject({
      present: true,
      rua: ['mailto:TLS@Example.com'],
    });
    expect(parseTlsRpt(['v=TLSRPTv1; rua=MAILTO:tls@example.com']).invalid).toBeUndefined();
  });

  it('meldet einen fehlenden Record als fehlend', () => {
    expect(parseTlsRpt([])).toEqual({ present: false });
    expect(parseTlsRpt(['some-verification=abc'])).toEqual({ present: false });
  });

  it.each([
    ['rua=mailto:tls@example.com; v=TLSRPTv1', 'v=TLSRPTv1 muss als erstes Tag stehen'],
    ['rua=mailto:tls@example.com', 'v=TLSRPTv1 fehlt am Anfang'],
    // RFC 8460 schreibt die Version als %s"…": mit Groß-/Kleinschreibung.
    ['v=tlsrptv1; rua=mailto:tls@example.com', 'Die Version muss genau v=TLSRPTv1 lauten, nicht v=tlsrptv1'],
    ['v=TLSRPTv1', 'rua= fehlt — ohne Ziel verschickt niemand Berichte'],
    ['v=TLSRPTv1; rua=', 'rua= fehlt — ohne Ziel verschickt niemand Berichte'],
    ['v=TLSRPTv1; rua=http://example.com/report', '„http://example.com/report“ ist kein Berichtsziel — erlaubt sind mailto: und https:'],
    ['v=TLSRPTv1; rua=tls@example.com', '„tls@example.com“ ist kein Berichtsziel — erlaubt sind mailto: und https:'],
  ])('nennt den Grund für einen ungültigen Record: %s', (record, invalid) => {
    expect(parseTlsRpt([record])).toMatchObject({ present: true, records: [record], invalid });
  });

  it('meldet mehrere TLS-RPT-Records als ungültig (RFC 8460 §3)', () => {
    const records = ['v=TLSRPTv1; rua=mailto:a@example.com', 'v=TLSRPTv1; rua=mailto:b@example.com'];
    expect(parseTlsRpt(records)).toEqual({
      present: true,
      records,
      invalid: '2 TLS-RPT-Records — RFC 8460 verlangt genau einen',
    });
  });

  it('zählt nur Records, die mit v=TLSRPTv1 beginnen', () => {
    expect(
      parseTlsRpt(['v=TLSRPTv1; rua=mailto:a@example.com', 'google-site-verification=abc'])
    ).toMatchObject({ present: true, rua: ['mailto:a@example.com'] });
    expect(
      parseTlsRpt(['v=TLSRPTv1; rua=mailto:a@example.com', 'v=tlsrptv1; rua=mailto:b@example.com'])
        .invalid
    ).toBeUndefined();
  });
});

describe('bimiDmarcGap', () => {
  const dmarc = (record: string, policy?: 'none' | 'quarantine' | 'reject'): MailSecurity['dmarc'] => ({
    present: true,
    record,
    policy,
  });

  it.each([
    ['v=DMARC1; p=reject', 'reject' as const],
    ['v=DMARC1; p=quarantine', 'quarantine' as const],
    ['v=DMARC1; p=quarantine; pct=100', 'quarantine' as const],
    // Für reject verlangt der Draft kein pct=100 (§7.1).
    ['v=DMARC1; p=reject; pct=50', 'reject' as const],
    ['v=DMARC1; p=quarantine; sp=reject', 'quarantine' as const],
  ])('lässt BIMI zu bei %s', (record, policy) => {
    expect(bimiDmarcGap(dmarc(record, policy))).toBeUndefined();
  });

  it('nennt, was an DMARC fehlt', () => {
    expect(bimiDmarcGap({ present: false })).toBe('kein DMARC-Record');
    expect(bimiDmarcGap(dmarc('v=DMARC1; p=invalid'))).toBe(
      'DMARC-Record wirkt nicht (p=invalid ist ungültig)'
    );
    expect(bimiDmarcGap(dmarc('v=DMARC1; p=none', 'none'))).toBe('DMARC p=none');
    expect(bimiDmarcGap(dmarc('v=DMARC1; p=quarantine; pct=50', 'quarantine'))).toBe(
      'DMARC p=quarantine mit pct=50'
    );
    expect(bimiDmarcGap(dmarc('v=DMARC1; p=reject; sp=none', 'reject'))).toBe('DMARC sp=none');
  });

  /** #107: Ohne gültiges p= zählt die wirksame Policy (RFC 7489 §6.6.3), nicht sp=. */
  it('nennt bei fehlendem oder ungültigem p= die wirksame Policy und den Mangel', () => {
    expect(bimiDmarcGap(dmarc('v=DMARC1; rua=mailto:x@y'))).toBe('DMARC wirkt wie p=none (p= fehlt)');
    expect(bimiDmarcGap(dmarc('v=DMARC1; p=foo; rua=mailto:x@y'))).toBe(
      'DMARC wirkt wie p=none (p=foo ist ungültig)'
    );
    expect(bimiDmarcGap(dmarc('v=DMARC1; sp=reject'))).toBe('DMARC-Record wirkt nicht (p= fehlt)');
    expect(bimiDmarcGap(dmarc('v=DMARC1; sp=reject; rua=mailto:x@y'))).toBe(
      'DMARC wirkt wie p=none (p= fehlt)'
    );
  });
});

describe('isHttpsUrl', () => {
  it('lässt nur https durch', () => {
    expect(isHttpsUrl('https://example.com/logo.svg')).toBe(true);
    expect(isHttpsUrl('HTTPS://example.com/logo.svg')).toBe(true);
    expect(isHttpsUrl('http://example.com/logo.svg')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});
