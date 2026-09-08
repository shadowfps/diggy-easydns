import { describe, expect, it } from 'vitest';
import { getApexDomain, isValidDomain, normalizeDomain } from './dnsLookup.js';

/**
 * isValidDomain ist die EINZIGE Eingabe-Guard vor allen DNS-, HTTP- und
 * TLS-Aufrufen. Was hier durchkommt, landet in einem ausgehenden Request.
 */
describe('isValidDomain', () => {
  it('akzeptiert normale Domains und Subdomains', () => {
    for (const domain of ['example.com', 'www.example.com', 'a.b.c.example.co.uk', 'x-y.de']) {
      expect(isValidDomain(domain), domain).toBe(true);
    }
  });

  it('akzeptiert Punycode', () => {
    expect(isValidDomain('xn--mnsterland-9db.it')).toBe(true);
  });

  it('lehnt IP-Literale ab — sonst wäre der SSRF-Guard umgehbar', () => {
    for (const input of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '2130706433', '0x7f000001']) {
      expect(isValidDomain(input), input).toBe(false);
    }
  });

  it('lehnt URLs, Ports, Pfade und Unterstriche ab', () => {
    for (const input of [
      'http://example.com',
      'example.com/pfad',
      'example.com:8080',
      'foo_bar.de',
      'localhost',
      '[::1]',
      '',
      'example..com',
      '-example.com',
      'example-.com',
    ]) {
      expect(isValidDomain(input), input).toBe(false);
    }
  });

  it('lehnt Namen über 253 Zeichen ab', () => {
    expect(isValidDomain(`${'a'.repeat(250)}.com`)).toBe(false);
  });

  it('läuft auch bei vielen Labels schnell (kein Backtracking-Blowup)', () => {
    const pathological = `${'a.'.repeat(120)}!`;
    const start = Date.now();
    isValidDomain(pathological);
    expect(Date.now() - start).toBeLessThan(200);
  });
});

describe('normalizeDomain', () => {
  it('entfernt Protokoll, Pfad, Port und Trailing Dot', () => {
    expect(normalizeDomain('https://Example.com/pfad?x=1')).toBe('example.com');
    expect(normalizeDomain('http://example.com:8080')).toBe('example.com');
    expect(normalizeDomain('example.com.')).toBe('example.com');
    expect(normalizeDomain('  Example.COM  ')).toBe('example.com');
  });

  it('konvertiert IDN nach Punycode', () => {
    expect(normalizeDomain('münsterland.it')).toBe('xn--mnsterland-9db.it');
  });

  it('gibt bei unbrauchbarer Eingabe die Rohform zurück, damit die Guard ablehnen kann', () => {
    expect(isValidDomain(normalizeDomain('!!!'))).toBe(false);
  });
});

/**
 * Die Apex-Auflösung war laut Git-History (f67d4ea) schon einmal falsch: eine
 * "letzte zwei Labels"-Heuristik behandelte echte Apex-Domains als Subdomain.
 */
describe('getApexDomain', () => {
  it('behandelt mehrteilige Suffixe korrekt', () => {
    expect(getApexDomain('bbc.co.uk')).toBe('bbc.co.uk');
    expect(getApexDomain('www.bbc.co.uk')).toBe('bbc.co.uk');
    expect(getApexDomain('sydney.edu.au')).toBe('sydney.edu.au');
  });

  it('löst Subdomains auf den Apex auf', () => {
    expect(getApexDomain('www.example.com')).toBe('example.com');
    expect(getApexDomain('a.b.c.example.com')).toBe('example.com');
  });

  it('geht bei Hosting-Suffixen eine Ebene tiefer', () => {
    // Für myapp.github.io ist github.io GitHubs Domain, nicht die des Nutzers —
    // ein SPF-/WHOIS-Check dort wäre wertlos.
    expect(getApexDomain('myapp.github.io')).toBe('myapp.github.io');
  });

  it('gibt den Namen selbst zurück, wenn er ein Public Suffix ist', () => {
    expect(getApexDomain('co.uk')).toBe('co.uk');
  });
});
