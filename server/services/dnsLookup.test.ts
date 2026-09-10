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

  /**
   * Die Regex enthält ein `(\.[a-z0-9-]{1,63})*` gefolgt von `\.[a-z]{2,63}` —
   * eine Konstruktion, bei der sich ein Engine-abhängiges Backtracking-Problem
   * einschleichen kann.
   *
   * Der vorherige Test prüfte nur, ob ein einzelner Aufruf unter 200 ms bleibt,
   * und ignorierte das Ergebnis. Das war zu unscharf: katastrophales
   * Backtracking wäre deutlich langsamer, moderates wäre durchgerutscht.
   * Deshalb mehrere Eingabeformen, engere Grenze, und das Ergebnis wird
   * mitgeprüft.
   */
  it('bleibt bei pathologischen Eingaben schnell und antwortet korrekt', () => {
    const cases: [string, boolean][] = [
      // Lange Label-Kette mit ungültigem Abschluss — der Worst Case für die
      // Alternation zwischen Stern-Gruppe und finalem Label.
      [`${'a.'.repeat(120)}!`, false],
      [`${'a.'.repeat(120)}`, false],
      [`${'ab-'.repeat(20)}x.com`, true],
      // Viele Labels, gültig: darf nicht an der Längenprüfung scheitern.
      [`${'a.'.repeat(60)}com`, true],
      // Fast-Treffer, der die Engine bis zum Ende laufen lässt.
      [`${'a.'.repeat(100)}c0m1`, false],
      ['-'.repeat(200), false],
      [`${'.'.repeat(200)}com`, false],
    ];

    for (const [input, expected] of cases) {
      const start = performance.now();
      const result = isValidDomain(input);
      const elapsed = performance.now() - start;

      expect(result, `Ergebnis für ${input.slice(0, 30)}…`).toBe(expected);
      expect(elapsed, `Laufzeit für ${input.slice(0, 30)}…`).toBeLessThan(20);
    }
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
