import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEurid, parseIcannWhois, parseNicAt, parseNicIt, WhoisTextError, type WhoisTextParser } from './whoisText.js';

/**
 * Echte Antworten vom 20.10.2026, gekürzt: Hinweistexte verkürzt, Werte in
 * Kontaktblöcken durch REDACTED ersetzt, Abuse-Kontakte entfernt. Die
 * Struktur — Kontaktblöcke an derselben Stelle wie im Original — bleibt,
 * damit die Tests zeigen, dass die Parser sie überspringen.
 */
const FIXTURES = new URL('../test/fixtures/whois/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

describe('.io (ICANN-Format, whois.nic.io)', () => {
  it('liest Daten, Status, Registrar, Nameserver und DNSSEC', () => {
    expect(parseIcannWhois(fixture('io-found.txt'), 'github.io')).toEqual({
      found: true,
      fields: {
        registrar: 'MarkMonitor Inc.',
        createdAt: '2013-03-08T19:12:48.000Z',
        expiresAt: '2027-03-08T19:12:48.000Z',
        updatedAt: '2026-08-12T09:08:04.000Z',
        nameServers: [
          'ns-692.awsdns-22.net',
          'ns-1622.awsdns-10.co.uk',
          'dns1.p05.nsone.net',
          'dns2.p05.nsone.net',
          'dns3.p05.nsone.net',
        ],
        status: ['clientDeleteProhibited', 'clientTransferProhibited', 'clientUpdateProhibited'],
        dnssecDelegated: false,
      },
    });
  });

  it('erkennt „Domain not found.“ trotz CRLF und trotz „too many queries“ in den Nutzungsbedingungen', () => {
    const text = fixture('io-not-found.txt');
    expect(text).toContain('\r\n');
    expect(text).toMatch(/too many queries/);
    expect(parseIcannWhois(text, 'diggy-frei-8317465.io')).toEqual({ found: false });
  });

  it('erkennt signierte Delegationen', () => {
    const text = fixture('io-found.txt').replace('DNSSEC: unsigned', 'DNSSEC: signedDelegation');
    expect(parseIcannWhois(text, 'github.io')).toMatchObject({ fields: { dnssecDelegated: true } });
  });

  it('nimmt einen Datensatz einer anderen Domain nicht als Treffer', () => {
    expect(() => parseIcannWhois(fixture('io-found.txt'), 'gitlab.io')).toThrow(WhoisTextError);
  });
});

describe('.at (whois.nic.at)', () => {
  it('liest nur den Domain-Block: Registrierung, Änderung, Registrar, Nameserver', () => {
    expect(parseNicAt(fixture('at-found.txt'), 'orf.at')).toEqual({
      found: true,
      fields: {
        registrar: 'APA-IT Informations Technologie GmbH',
        // Ortszeit Wien: 20:31 MESZ = 18:31 UTC, 14:51 MESZ = 12:51 UTC.
        createdAt: '2000-08-25T18:31:02.000Z',
        updatedAt: '2023-08-01T12:51:59.000Z',
        nameServers: ['ns3.apa.at', 'ns4.apa.net'],
        status: [],
      },
    });
  });

  it('liest DNSSEC, fasst doppelte Nameserver zusammen und lässt einen leeren Registrar weg', () => {
    const result = parseNicAt(fixture('at-signed.txt'), 'nic.at');
    expect(result).toMatchObject({
      found: true,
      fields: {
        registrar: undefined,
        dnssecDelegated: true,
        // Winterzeit: 16:03 MEZ = 15:03 UTC.
        updatedAt: '2020-04-27T14:03:40.000Z',
        nameServers: ['ns1.nic.at', 'ns10.univie.ac.at', 'ns2.nic.at', 'ns5.nic.at', 'ns5.univie.ac.at'],
      },
    });
  });

  it('erkennt „% nothing found“', () => {
    expect(parseNicAt(fixture('at-not-found.txt'), 'diggy-frei-8317465.at')).toEqual({ found: false });
  });
});

describe('.it (whois.nic.it)', () => {
  it('liest Kopf, Registrar-Organisation und Nameserver, aber keine Kontakte', () => {
    expect(parseNicIt(fixture('it-found.txt'), 'repubblica.it')).toEqual({
      found: true,
      fields: {
        registrar: 'Gandi SAS',
        createdAt: '1996-05-14T22:00:00.000Z',
        updatedAt: '2026-01-31T23:44:11.000Z',
        // Nur ein Datum: Mitternacht in Rom.
        expiresAt: '2027-01-15T23:00:00.000Z',
        nameServers: ['ns-1541.awsdns-00.co.uk', 'ns-1477.awsdns-56.org', 'ns-723.awsdns-26.net', 'ns-353.awsdns-44.com'],
        status: ['ok'],
        dnssecDelegated: false,
      },
    });
  });

  it('teilt zusammengesetzte Status auf', () => {
    const text = fixture('it-found.txt').replace('Status:             ok', 'Status:             pendingDelete / redemptionPeriod');
    expect(parseNicIt(text, 'repubblica.it')).toMatchObject({ fields: { status: ['pendingDelete', 'redemptionPeriod'] } });
  });

  it('erkennt „Status: AVAILABLE“', () => {
    expect(parseNicIt(fixture('it-not-found.txt'), 'diggy-frei-8317465.it')).toEqual({ found: false });
  });
});

describe('.eu (whois.eu)', () => {
  it('liest Registrar und Nameserver, keine Daten und kein DNSSEC', () => {
    expect(parseEurid(fixture('eu-found.txt'), 'europa.eu')).toEqual({
      found: true,
      fields: {
        registrar: 'ClearMedia NV',
        nameServers: [
          'ns4az1.europa.eu',
          'ans2.cw.net',
          'ns3bru.europa.eu',
          'ns2bru.europa.eu',
          'ns3lux.europa.eu',
          'ns4az2.europa.eu',
          'ns1bru.europa.eu',
          'ans1.cw.net',
          'ns1lux.europa.eu',
          'ns2lux.europa.eu',
        ],
        status: [],
      },
    });
  });

  it('erkennt „Status: AVAILABLE“', () => {
    expect(parseEurid(fixture('eu-not-found.txt'), 'diggy-frei-8317465.eu')).toEqual({ found: false });
  });
});

describe('Sperren und unbekannte Antworten', () => {
  const PARSERS: [string, WhoisTextParser, string][] = [
    ['.io', parseIcannWhois, 'example.io'],
    ['.at', parseNicAt, 'example.at'],
    ['.it', parseNicIt, 'example.it'],
    ['.eu', parseEurid, 'example.eu'],
  ];

  /*
   * Die Sätze sind nachgestellt — echte Rate-Limit-Antworten ließen sich
   * nicht gezielt auslösen. Die Sperre von nic.ch ist echt.
   */
  const REFUSALS = [
    fixture('ch-refused.txt'),
    '% Quota exceeded\n',
    'WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS\r\n',
    '%% Excessive querying, grace period of 60 seconds.\n',
    'Too many requests, please try again later.\n',
  ];

  for (const [tld, parse, domain] of PARSERS) {
    it.each(REFUSALS)(`${tld}: wirft bei einer Sperre, statt „frei“ zu melden: %j`, (text) => {
      expect(() => parse(text, domain)).toThrow(expect.objectContaining({ refused: true }));
    });

    it(`${tld}: wirft bei leerer oder unbekannter Antwort`, () => {
      expect(() => parse('', domain)).toThrow(expect.objectContaining({ refused: false }));
      expect(() => parse('Something completely different\n', domain)).toThrow(WhoisTextError);
    });
  }

  /*
   * Ein Server, der drosselt und dabei trotzdem den Satz für freie Domains
   * schickt, darf kein „frei“ ergeben (Befund aus dem Codex-Review). Die
   * Hinweise der Registries selbst lösen das nicht aus: at- und
   * eu-not-found.txt tragen sie ungekürzt.
   */
  it.each<[string, WhoisTextParser, string, string]>([
    ['.io', parseIcannWhois, 'diggy-frei-1.io', 'WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS\r\nDomain not found.\r\n'],
    ['.at', parseNicAt, 'diggy-frei-1.at', '% Quota exceeded\n% nothing found\n'],
    ['.it', parseNicIt, 'diggy-frei-1.it', 'Too many requests, please try again later.\nDomain: diggy-frei-1.it\nStatus: AVAILABLE\n'],
    ['.eu', parseEurid, 'diggy-frei-1.eu', '%% Excessive querying, grace period of 60 seconds.\nDomain: diggy-frei-1.eu\nStatus: AVAILABLE\n'],
  ])('%s: wirft bei einer Sperre neben „nicht gefunden“', (_tld, parse, domain, text) => {
    expect(() => parse(text, domain)).toThrow(expect.objectContaining({ refused: true }));
  });

  it('nennt im Fehler nur das Stichwort, nicht den Text der Antwort', () => {
    expect(() => parseNicAt('% Quota exceeded for 192.0.2.1\n', 'example.at')).toThrow('abgelehnt („exceeded“)');
  });
});

describe('Personendaten', () => {
  /**
   * Die Fixtures enthalten keine echten Kontaktdaten; die Kontaktfelder
   * tragen REDACTED. Taucht das in einem Ergebnis auf, hätte ein Parser
   * einen Kontaktblock gelesen.
   */
  it('kein Parser übernimmt einen Wert aus einem Kontaktblock', () => {
    const cases: [WhoisTextParser, string, string][] = [
      [parseIcannWhois, 'io-found.txt', 'github.io'],
      [parseNicAt, 'at-found.txt', 'orf.at'],
      [parseNicAt, 'at-signed.txt', 'nic.at'],
      [parseNicIt, 'it-found.txt', 'repubblica.it'],
      [parseEurid, 'eu-found.txt', 'europa.eu'],
    ];
    for (const [parse, file, domain] of cases) {
      expect(JSON.stringify(parse(fixture(file), domain)), file).not.toContain('REDACTED');
    }
  });

  it('die Fixtures enthalten keine E-Mail-Adressen und Telefonnummern', () => {
    for (const file of readdirSync(FIXTURES)) {
      const text = fixture(file);
      expect(text, file).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(text, file).not.toMatch(/\+\d{1,3}\.\d{6,}/);
    }
  });
});
