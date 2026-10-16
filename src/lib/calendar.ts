/**
 * Ablauf-Erinnerungen als Kalender-Datei (iCalendar, RFC 5545).
 *
 * Bewusst eine Datei statt einer Mail-Erinnerung: diggy speichert nichts
 * dauerhaft (der Produktiv-Container hat keinen Speicher), und für eine Mail
 * bräuchten wir eine Adresse — also personenbezogene Daten. Die .ics entsteht
 * komplett im Browser; der Kalender des Nutzers übernimmt das Erinnern.
 *
 * Alles hier ist rein und ohne `window`, damit sich Format und Datum ohne DOM
 * prüfen lassen. Den Download übernimmt `components/calendar/CalendarButton`.
 */

import { lookupPathFor, sanitizeFilename } from '@/lib/lookupPath';

export type ExpiryKind = 'certificate' | 'domain';

export interface ExpiryReminder {
  kind: ExpiryKind;
  /**
   * Wessen Ablauf: beim Zertifikat der geprüfte Host, bei der Domain die
   * registrierte Domain (bei `www.example.com` also `example.com`).
   */
  subject: string;
  /** Ablaufzeitpunkt als ISO-String, so wie Server und RDAP ihn liefern. */
  expiresAt: string;
  /** Domain des Reports, auf den der Termin zurückverlinkt. */
  reportDomain: string;
}

/** Feste Kennung für UIDs — unabhängig davon, unter welchem Host diggy läuft. */
const UID_DOMAIN = 'diggydns.cloud';
const PRODID = '-//diggy//Ablauf-Erinnerung//DE';

/** RFC 5545, 3.1: Zeilen höchstens 75 Oktette, ohne das CRLF. */
const MAX_LINE_OCTETS = 75;
const CRLF = '\r\n';

/**
 * Erinnerungen vor dem Ablauftag.
 *
 * Ein ganztägiger Termin beginnt um 00:00 Ortszeit — ein Alarm „14 Tage
 * vorher“ (`-P14D`) käme also um Mitternacht. `-P13DT15H` landet stattdessen
 * um 9:00 am 14. Tag davor, `-PT15H` um 9:00 am Vortag. So macht es auch der
 * Apple-Kalender bei seinen eigenen Ganztags-Erinnerungen.
 *
 * Zwei Stufen: 14 Tage reichen, um eine Verlängerung anzustoßen; der Vortag
 * fängt ab, wenn die erste Erinnerung untergegangen ist.
 */
const ALARMS = [
  { trigger: '-P13DT15H', when: 'in 14 Tagen' },
  { trigger: '-PT15H', when: 'morgen' },
] as const;

/** Kurzform der Art für UID und Dateinamen. */
const KIND_SLUG: Record<ExpiryKind, string> = {
  certificate: 'zertifikat',
  domain: 'domain',
};

/** Dateiname für den Download, z. B. `example.com-domain-ablauf.ics`. */
export function calendarFilename(reminder: Pick<ExpiryReminder, 'kind' | 'subject'>): string {
  const name = sanitizeFilename(reminder.subject) || 'diggy';
  return `${name}-${KIND_SLUG[reminder.kind]}-ablauf.ics`;
}

/**
 * Baut eine vollständige .ics mit einem Termin je Erinnerung.
 *
 * `origin` (z. B. `https://diggydns.cloud`) kommt vom Aufrufer, damit der
 * Link zum Report auf die Instanz zeigt, von der die Datei stammt. `now` ist
 * der DTSTAMP — Pflichtfeld, das sagt, wann die Datei erzeugt wurde.
 *
 * Wirft bei einem ungültigen Datum: der Button prüft das vorher, und ein
 * leerer oder falscher Termin im Kalender wäre schlimmer als keiner.
 */
export function buildExpiryCalendar(
  reminders: readonly ExpiryReminder[],
  options: { now: Date; origin: string }
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...reminders.flatMap((reminder) => eventLines(reminder, options)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

function eventLines(reminder: ExpiryReminder, { now, origin }: { now: Date; origin: string }) {
  const expires = new Date(reminder.expiresAt);
  if (Number.isNaN(expires.getTime())) {
    throw new RangeError(`Ungültiges Ablaufdatum: ${reminder.expiresAt}`);
  }

  const start = formatDate(expires);
  // DTEND ist exklusiv: ein Ganztagstermin endet am Folgetag. Weglassen wäre
  // nach RFC erlaubt, Outlook macht daraus aber einen Termin ohne Dauer.
  const end = formatDate(
    new Date(expires.getFullYear(), expires.getMonth(), expires.getDate() + 1)
  );
  const reportUrl = new URL(lookupPathFor(reminder.reportDomain), origin).href;
  const { summary, description } = texts(reminder, expires, reportUrl);

  return [
    'BEGIN:VEVENT',
    // Stabil aus Art, Tag und Domain: wer die Datei zweimal importiert, bekommt
    // keinen doppelten Termin. Ein verlängertes Zertifikat hat einen neuen Tag
    // und damit einen eigenen Termin.
    `UID:${KIND_SLUG[reminder.kind]}-${start}-${escapeText(reminder.subject)}@${UID_DOMAIN}`,
    `DTSTAMP:${formatTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    // URL ist vom Typ URI, nicht TEXT — dort wird nicht escaped.
    `URL:${reportUrl}`,
    // Ein Ablauf-Hinweis blockiert keine Zeit im Kalender.
    'TRANSP:TRANSPARENT',
    ...ALARMS.flatMap((alarm) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`${subjectLabel(reminder)} läuft ${alarm.when} ab`)}`,
      `TRIGGER:${alarm.trigger}`,
      'END:VALARM',
    ]),
    'END:VEVENT',
  ];
}

function subjectLabel(reminder: ExpiryReminder): string {
  return reminder.kind === 'certificate'
    ? `Zertifikat von ${reminder.subject}`
    : `Domain ${reminder.subject}`;
}

function texts(reminder: ExpiryReminder, expires: Date, reportUrl: string) {
  const when = `am ${formatWhen(expires)}`;
  const reason =
    reminder.kind === 'certificate'
      ? `Das TLS-Zertifikat von ${reminder.subject} läuft ${when} ab. Danach zeigen Browser eine Sicherheitswarnung. Prüfen, ob die automatische Erneuerung greift.`
      : `Die Registrierung von ${reminder.subject} läuft ${when} ab. Ohne Verlängerung kann die Domain abgeschaltet und neu vergeben werden. Prüfen, ob die automatische Verlängerung beim Registrar aktiv ist.`;
  return {
    summary: `${subjectLabel(reminder)} läuft ab`,
    description: `${reason}\n\nAktueller Stand im Report: ${reportUrl}`,
  };
}

/* ─── Format ─────────────────────────────────────────────────────────── */

/**
 * Escaping für TEXT-Werte (RFC 5545, 3.3.11).
 *
 * Der Backslash zuerst, sonst würden die danach eingefügten doppelt escaped.
 * Zeilenumbrüche jeder Art werden zu `\n` — ein echter Umbruch würde die
 * Zeile beenden und den Rest als eigene (kaputte) Eigenschaft lesen lassen.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Faltet eine Inhaltszeile auf höchstens 75 Oktette (RFC 5545, 3.1).
 *
 * Gezählt werden UTF-8-Bytes, nicht Zeichen: ein „ä“ sind zwei Oktette, ein
 * Emoji vier. Geschnitten wird nur zwischen Codepoints — ein halbes
 * Mehrbyte-Zeichen am Zeilenende wäre ungültiges UTF-8 und käme im Kalender
 * als Ersatzzeichen an. Folgezeilen beginnen mit einem Leerzeichen, das zu
 * ihren 75 Oktetten zählt.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  let limit = MAX_LINE_OCTETS;

  for (const char of line) {
    const size = utf8Length(char);
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);

  return parts.join(`${CRLF} `);
}

function utf8Length(char: string): number {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/**
 * Kalendertag als `YYYYMMDD` (DATE, RFC 5545, 3.3.4), in Ortszeit.
 *
 * Bewusst der Tag in der Zeitzone des Browsers, nicht der UTC-Tag: genau
 * diesen Tag zeigen SSL- und WHOIS-Karte neben dem Button an. Viele
 * Zertifikate laufen um 23:59:59 UTC ab — in Mitteleuropa ist das schon der
 * Folgetag, mit dem UTC-Tag stünde im Kalender ein anderes Datum als auf der
 * Karte. Westlich von Greenwich landet ein Ablauf kurz nach Mitternacht UTC
 * entsprechend auf dem Vorabend — dort läuft er ja auch dann ab.
 *
 * Der Termin selbst ist ganztägig und ohne Zeitzone: der Kalender zeigt ihn
 * an diesem Tag, egal wo er später geöffnet wird.
 */
function formatDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** DATE-TIME in UTC, Form `YYYYMMDDTHHMMSSZ` (RFC 5545, 3.3.5). */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
}

/**
 * „30.11.2026 um 00:59 MEZ“ — mit Zone, weil die Datei auch noch gelesen
 * wird, wenn der Nutzer gerade woanders ist.
 */
function formatWhen(date: Date): string {
  const day = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${day} um ${time}`;
}
