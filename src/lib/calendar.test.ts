import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildExpiryCalendar,
  calendarFilename,
  escapeText,
  foldLine,
  type ExpiryReminder,
} from './calendar';

const NOW = new Date('2026-10-16T08:30:15.123Z');
const ORIGIN = 'https://diggydns.cloud';

const certificate: ExpiryReminder = {
  kind: 'certificate',
  subject: 'www.example.com',
  expiresAt: '2026-12-01T12:00:00.000Z',
  reportDomain: 'www.example.com',
};

const domain: ExpiryReminder = {
  kind: 'domain',
  subject: 'example.com',
  expiresAt: '2027-09-14T04:00:00Z',
  reportDomain: 'www.example.com',
};

function build(reminders: ExpiryReminder[] = [certificate]) {
  return buildExpiryCalendar(reminders, { now: NOW, origin: ORIGIN });
}

/** Macht die Faltung rückgängig (RFC 5545, 3.1) und liefert logische Zeilen. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').slice(0, -1);
}

function value(lines: string[], name: string): string | undefined {
  const line = lines.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
  return line?.slice(line.indexOf(':') + 1);
}

/** Inhalt zwischen BEGIN:<name> und END:<name>, je Vorkommen. */
function blocks(lines: string[], name: string): string[][] {
  const result: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === `BEGIN:${name}`) current = [];
    else if (line === `END:${name}` && current) {
      result.push(current);
      current = null;
    } else current?.push(line);
  }
  return result;
}

/*
 * Der Kalendertag folgt der Zeitzone des Browsers (wie die Karten). Damit die
 * Tests auf jeder Maschine dasselbe sehen, ist sie hier fest eingestellt —
 * über stubEnv, weil unstubAllEnvs auch einen vorher nicht gesetzten Wert
 * sauber wiederherstellt (statt TZ="undefined").
 */
beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Berlin');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildExpiryCalendar', () => {
  it('erzeugt einen Kalender mit allen Pflichtfeldern', () => {
    const lines = unfold(build());

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('CALSCALE:GREGORIAN');
    expect(value(lines, 'PRODID')).toMatch(/^-\/\/diggy\/\//);

    const [event] = blocks(lines, 'VEVENT');
    expect(event).toBeDefined();
    expect(value(event!, 'UID')).toBe('zertifikat-20261201-www.example.com@diggydns.cloud');
    expect(value(event!, 'DTSTAMP')).toBe('20261016T083015Z');
    expect(value(event!, 'SUMMARY')).toBe('Zertifikat von www.example.com läuft ab');
    expect(value(event!, 'URL')).toBe('https://diggydns.cloud/lookup/www.example.com');
  });

  it('trennt Zeilen mit CRLF und endet mit einem CRLF', () => {
    const ics = build([certificate, domain]);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    // Kein LF ohne CR davor und kein CR ohne LF danach.
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).not.toMatch(/\r[^\n]/);
  });


  it('nennt im Text Ablaufzeit und Link zum Report', () => {
    const [event] = blocks(unfold(build()), 'VEVENT');
    const description = value(event!, 'DESCRIPTION');
    expect(description).toContain('01.12.2026 um 13:00 MEZ');
    // Absätze stehen escaped als \n in der Zeile, nicht als echter Umbruch.
    expect(description).toContain(
      '\\n\\nAktueller Stand im Report: https://diggydns.cloud/lookup/www.example.com'
    );
  });

  it('erinnert 14 Tage und einen Tag vorher, jeweils um 9 Uhr', () => {
    const [event] = blocks(unfold(build()), 'VEVENT');
    const alarms = blocks(event!, 'VALARM');
    expect(alarms).toHaveLength(2);
    for (const alarm of alarms) {
      expect(alarm).toContain('ACTION:DISPLAY');
      // DISPLAY-Alarme brauchen eine DESCRIPTION (RFC 5545, 3.6.6).
      expect(value(alarm, 'DESCRIPTION')).toMatch(/^Zertifikat von www\.example\.com läuft /);
    }
    expect(alarms.map((alarm) => value(alarm, 'TRIGGER'))).toEqual(['-P13DT15H', '-PT15H']);
  });

  it('beschreibt eine Domain anders als ein Zertifikat und verlinkt den Report', () => {
    const [event] = blocks(unfold(build([domain])), 'VEVENT');
    expect(value(event!, 'UID')).toBe('domain-20270914-example.com@diggydns.cloud');
    expect(value(event!, 'SUMMARY')).toBe('Domain example.com läuft ab');
    expect(value(event!, 'DESCRIPTION')).toContain('Registrierung von example.com');
    // Der Link führt zum Report, der geprüft wurde — nicht zur Apex-Domain.
    expect(value(event!, 'URL')).toBe('https://diggydns.cloud/lookup/www.example.com');
  });

  it('schreibt mehrere Erinnerungen als eigene Termine in eine Datei', () => {
    const events = blocks(unfold(build([certificate, domain])), 'VEVENT');
    expect(events).toHaveLength(2);
  });

  it('hält die UID stabil, damit ein zweiter Import keinen Doppeltermin anlegt', () => {
    const uid = (ics: string) => value(blocks(unfold(ics), 'VEVENT')[0]!, 'UID');
    const first = buildExpiryCalendar([certificate], { now: NOW, origin: ORIGIN });
    const later = buildExpiryCalendar([certificate], {
      now: new Date('2026-11-01T12:00:00Z'),
      origin: 'http://localhost:5173',
    });
    expect(uid(later)).toBe(uid(first));

    const renewed = build([{ ...certificate, expiresAt: '2027-03-01T12:00:00Z' }]);
    expect(uid(renewed)).not.toBe(uid(first));
  });

  it('wirft bei einem ungültigen Datum, statt einen falschen Termin zu schreiben', () => {
    expect(() => build([{ ...certificate, expiresAt: 'kein Datum' }])).toThrow(RangeError);
  });

  it('faltet lange Zeilen UTF-8-sicher', () => {
    // Ein langer Name aus Mehrbyte-Zeichen: ü (2 Oktette) und 😀 (4 Oktette).
    const subject = `${'ü'.repeat(40)}${'😀'.repeat(30)}.example`;
    const ics = build([{ ...certificate, subject }]);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });

    for (const line of ics.split('\r\n')) {
      const bytes = encoder.encode(line);
      expect(bytes.length).toBeLessThanOrEqual(75);
      // Würde mitten in einem Zeichen geschnitten, wäre die Zeile kein
      // gültiges UTF-8 mehr und `fatal` würde werfen.
      expect(() => decoder.decode(bytes)).not.toThrow();
    }

    const [event] = blocks(unfold(ics), 'VEVENT');
    expect(value(event!, 'SUMMARY')).toBe(`Zertifikat von ${subject} läuft ab`);
  });

  describe('Kalendertag', () => {
    /** Der Tag, den SSL- und WHOIS-Karte anzeigen, als YYYYMMDD. */
    const cardDay = (iso: string) => {
      const [day, month, year] = new Date(iso)
        .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .split('.');
      return `${year}${month}${day}`;
    };

    it('stellt die Zeitzone wirklich um — sonst wären die Fälle unten wertlos', () => {
      vi.stubEnv('TZ', 'America/Los_Angeles');
      expect(new Date('2027-07-01T00:00:00Z').getTimezoneOffset()).toBe(420);
    });

    it.each([
      // Viele Zertifikate enden um 23:59:59 UTC — in Berlin schon der Folgetag.
      ['Europe/Berlin', '2026-11-29T23:59:59Z', '20261130', '20261201'],
      ['UTC', '2026-11-29T23:59:59Z', '20261129', '20261130'],
      // Kurz nach Mitternacht UTC ist in Los Angeles noch der Vorabend.
      ['America/Los_Angeles', '2026-12-02T01:00:00Z', '20261201', '20261202'],
      // Reines Datum, wie es manche Registries liefern: UTC-Mitternacht.
      ['Pacific/Kiritimati', '2027-09-14', '20270914', '20270915'],
      ['America/Los_Angeles', '2027-09-14', '20270913', '20270914'],
      // Das exklusive Ende über Monats- und Jahresgrenze, und über die
      // Zeitumstellung hinweg.
      ['Europe/Berlin', '2026-12-31T10:00:00Z', '20261231', '20270101'],
      ['Europe/Berlin', '2027-03-28T10:00:00Z', '20270328', '20270329'],
    ])('%s, Ablauf %s → ganztägig am %s', (tz, expiresAt, start, end) => {
      vi.stubEnv('TZ', tz);
      const [event] = blocks(unfold(build([{ ...certificate, expiresAt }])), 'VEVENT');

      // Ganztägig heißt: nur ein Datum, keine Uhrzeit, keine Zeitzone. DTEND
      // ist exklusiv — ein Tag Dauer.
      expect(event!.filter((line) => /^DT(START|END)/.test(line))).toEqual([
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
      ]);
      // Derselbe Tag wie auf der Karte neben dem Button.
      expect(start).toBe(cardDay(expiresAt));
    });
  });
});

describe('escapeText', () => {
  it('escaped Backslash, Semikolon, Komma und Zeilenumbrüche', () => {
    expect(escapeText('a\\b;c,d')).toBe('a\\\\b\\;c\\,d');
    expect(escapeText('eins\nzwei\r\ndrei\rvier')).toBe('eins\\nzwei\\ndrei\\nvier');
  });

  it('escaped den Backslash nur einmal', () => {
    expect(escapeText('\\;')).toBe('\\\\\\;');
  });
});

describe('foldLine', () => {
  it('lässt Zeilen bis 75 Oktette unverändert', () => {
    const line = 'x'.repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it('beginnt Folgezeilen mit einem Leerzeichen, das mitzählt', () => {
    const folded = foldLine('x'.repeat(200));
    const parts = folded.split('\r\n');
    expect(parts[0]).toHaveLength(75);
    expect(parts.slice(1).every((p) => p.startsWith(' ') && p.length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe('x'.repeat(200));
  });

  it('schneidet nie mitten in einem Mehrbyte-Zeichen', () => {
    // 37 × „ä“ = 74 Oktette; das 38. passt nicht mehr ganz in die erste Zeile.
    const parts = foldLine('ä'.repeat(38)).split('\r\n');
    expect(parts[0]).toBe('ä'.repeat(37));
    expect(parts[1]).toBe(' ä');
  });
});

describe('calendarFilename', () => {
  it('benennt die Datei nach Domain und Art', () => {
    expect(calendarFilename(certificate)).toBe('www.example.com-zertifikat-ablauf.ics');
    expect(calendarFilename(domain)).toBe('example.com-domain-ablauf.ics');
  });
});
