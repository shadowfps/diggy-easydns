import type { Verdict } from '@shared/scoring';

/**
 * Deutsche Texte — die Quelle aller Übersetzungen (#86).
 *
 * Der deutsche Text ist zugleich der Schlüssel (warum: siehe i18n/index.ts).
 * Diese Datei legt fest, welche Schlüssel es gibt:
 *
 * - `DeText` zählt jeden Text auf, der durch `t()` läuft. Nur ein Typ — er
 *   kostet im Bundle nichts. `t('Tippfehler')` scheitert am Compiler, ebenso
 *   ein Eintrag hier, der in `en.ts` fehlt.
 * - `DE_PLURALS` hält die Texte mit Einzahl und Mehrzahl. Das ist das einzige
 *   Stück Wörterbuch, das wirklich ausgeliefert wird: die Einzahl braucht die
 *   Laufzeit, sie steht an keiner Aufrufstelle.
 *
 * Neuer Text: hier eintragen, in `en.ts` übersetzen, im Code `t('…')`.
 * Gleicher Text an zwei Stellen ist ein Schlüssel — braucht das Englische
 * zwei verschiedene Übersetzungen, muss sich auch der deutsche Text
 * unterscheiden. Vorgehen und Regeln: docs/I18N.md.
 *
 * Gruppiert nach Bereich in derselben Reihenfolge wie `en.ts`.
 */

export type DeText =
  // ─── Header, Menü, Footer, Seitentitel ───────────────────────────────
  | 'Zur Startseite'
  | 'Menü öffnen'
  | 'Menü schließen'
  | 'History'
  | 'Available Check'
  | 'About'
  | 'Sprache'
  | 'Impressum'
  | 'Datenschutz'
  | 'Rechtliches'

  // ─── Startseite ──────────────────────────────────────────────────────
  | 'Was steckt hinter deiner Domain?'
  | 'DNS, SSL, Mail-Security und Propagation auf einen Blick.'
  | 'Ohne Fachchinesisch, mit Empfehlungen.'
  | 'Alles, was du wissen musst — in einem Tool.'
  | 'Was diggy prüft'
  | 'Sechs Bereiche, ein Befund'
  | 'Jeder Bereich fließt in den Health Score ein. PageSpeed und VirusTotal gibt es auf Klick dazu.'
  | 'A, AAAA, MX, NS, TXT, CAA, SOA und CNAME — mit dem Netzbetreiber hinter jeder IP.'
  | 'Mail-Schutz'
  | 'SPF, DKIM, DMARC und MTA-STS: Kann jemand in deinem Namen Mails fälschen?'
  | 'Zertifikat, Aussteller und Ablaufdatum — bevor Besucher eine Warnung sehen.'
  | 'Sind die Antworten signiert, und hält die Vertrauenskette?'
  | 'Fünf öffentliche Resolver im Vergleich: Ist eine Änderung überall angekommen?'
  | 'Registrar, Laufzeit und Status — bevor eine Domain unbemerkt ausläuft.'
  | 'Kennst du schon {converter} by diggy?'
  | 'Bilder umwandeln, skalieren & komprimieren — direkt im Browser.'
  | 'Zu Converter'

  // ─── Suche ───────────────────────────────────────────────────────────
  | 'Jetzt deine Anfrage starten'
  | 'Domain oder IP-Adresse'
  | 'Suchen'
  | 'Zuletzt geprüft'
  | 'Beispiele'
  | '{value} in die Suche übernehmen'

  // ─── Report: Kopf, Tabs, Zustände ────────────────────────────────────
  | 'Records werden geholt…'
  | 'Zusammenfassung'
  | 'DNS-Report'
  | 'Geprüft am {date}'
  | 'Link kopiert'
  | 'Permalink kopieren'
  | 'Permalink kopieren:'
  | 'Report-Bereiche'
  | 'Multi-Resolver-Propagation'
  | 'Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen.'
  | 'Dieser Check ist fehlgeschlagen.'

  // ─── Score und Schnellübersicht ──────────────────────────────────────
  | Verdict
  | 'kritisch'
  | 'Alle Findings'
  | 'Keine offenen Punkte'
  | 'Wichtigster Punkt'
  | 'Schnellübersicht'
  | 'kein Cert'
  | 'aktiv'
  | 'inaktiv'
  | 'gesetzt'
  | 'fehlt'

  // ─── Records und Findings ────────────────────────────────────────────
  | 'Alle'
  | 'Warnung'
  | 'Hinweis'
  | 'OK'
  | 'Snippet kopiert'
  | 'Snippet kopieren'

  // ─── Security ────────────────────────────────────────────────────────
  | 'Nicht anwendbar: Namen mit Unterstrich sind DNS-Einträge, keine Hosts — unter ihnen läuft kein Webserver mit Zertifikat.'
  | 'Kein TLS auf Port 443 erreichbar'
  | 'gültig'
  | 'nicht vertrauenswürdig'
  | 'Aussteller'
  | 'Gültig'
  | 'Protokoll'
  | 'nicht aktiviert'
  | 'DNSSEC schützt deine Domain gegen DNS-Spoofing. Die meisten Registrare bieten DNSSEC mit einem Klick — beim Hosting-Panel nachsehen.'
  | 'aktiv & valide'
  | 'Chain of Trust valide'
  | 'Algorithmus'
  | 'unbekannt'
  | 'DS- und DNSKEY-Records vorhanden, von Cloudflare und Quad9 validiert.'
  | 'Chain unterbrochen'
  | 'Die Domain hat einen DNSKEY, aber der Parent-DS-Record fehlt. Resolver können die Signatur nicht prüfen → DNSSEC ist effektiv aus. Beim Registrar den DS-Record nachtragen.'
  | 'Validierung fehlgeschlagen'
  | 'DS und DNSKEY sind da, aber die Chain validiert nicht. Möglicherweise abgelaufene Signaturen oder falsche Schlüssel.'

  // ─── Mail ────────────────────────────────────────────────────────────
  | 'Wer darf in deinem Namen senden?'
  | 'Kein SPF-Record gefunden'
  | 'problematisch'
  | 'Was passiert mit Spoofing-Versuchen?'
  | 'Kein DMARC-Record auf _dmarc.<domain>'
  | 'rua gesetzt'
  | 'Welche Selectors signieren ausgehende Mails?'
  | 'Keine gängigen DKIM-Selectors gefunden (default, google, selector1, k1, …)'
  | 'Erzwingt TLS für eingehende Mail'
  | 'aktiviert'
  | 'nicht eingerichtet'
  | 'MTA-STS verhindert Downgrade-Angriffe, bei denen sich Angreifer zwischen Sender und Empfänger setzen und TLS abschalten.'

  // ─── WHOIS ───────────────────────────────────────────────────────────
  | 'WHOIS / RDAP nicht verfügbar'
  | 'Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.'
  | 'Registrierung'
  | 'Erstellt'
  | 'Läuft ab'
  | 'Geändert'
  | 'Nameserver (laut Registry)'
  | 'Keine Nameserver gemeldet.'
  | 'Domain-Status'
  | 'Keine Status-Codes.'
  | 'DNSSEC bei Registry: {status}'
  | 'delegiert'
  | 'nicht delegiert'
  | 'Transfer-Sperre (Client)'
  | 'Transfer-Sperre (Registry)'
  | 'Lösch-Sperre (Client)'
  | 'Lösch-Sperre (Registry)'
  | 'Update-Sperre (Client)'
  | 'Update-Sperre (Registry)'
  | 'Renewal-Sperre (Client)'
  | 'Aktiv'
  | 'Inaktiv'
  | 'Erstellung läuft'
  | 'Renewal läuft'
  | 'Update läuft'
  | 'Transfer läuft'
  | 'Löschung läuft'
  | 'Restore läuft'
  | 'Redemption Period'
  | 'Client-Hold (nicht aufgelöst!)'
  | 'Server-Hold (nicht aufgelöst!)'

  // ─── Propagation ─────────────────────────────────────────────────────
  | 'Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.'
  | '— kein Eintrag'

  // ─── PageSpeed ───────────────────────────────────────────────────────
  | 'Scan abgeschlossen'
  | 'Top Optimierungspotenziale'
  | 'Keine kritischen Opportunities gefunden.'
  | 'Verbinde mit PageSpeed Insights…'
  | 'Starte Lighthouse Runner…'
  | 'Messe Core Web Vitals…'
  | 'Analysiere Render-Pfad…'
  | 'Bereite Ergebnisse auf…'
  | 'Analyse läuft'
  | 'gut'
  | 'verbesserungswürdig'
  | 'schlecht'

  // ─── VirusTotal ──────────────────────────────────────────────────────
  | 'Prüft die Domain gegen 80+ Sicherheits-Engines auf Malware, Phishing und Blacklists.'
  | 'Scan starten'
  | 'Community-Bewertung (negativ = schlechter Ruf)'
  | 'Letzte Analyse: {date}'
  | 'Kategorisierung durch Sicherheits-Engines'
  | 'Sauber'
  | 'Keine Bedrohungen erkannt'
  | 'Verdächtig'
  | 'Einige Engines haben Bedenken'
  | 'Schädlich'
  | 'Domain als Bedrohung eingestuft'
  | '{flagged} von {total} Engines haben angeschlagen'
  | 'Verbinde mit VirusTotal…'
  | 'Prüfe 80+ Security-Engines…'
  | 'Analysiere Blacklists…'
  | 'Werte Reputation aus…'
  | 'Scan läuft'

  // ─── IP-Details ──────────────────────────────────────────────────────
  | 'IP-Lookup'
  | 'Reverse-DNS wird ermittelt…'
  | 'Für diese IP ist kein PTR-Record konfiguriert.'
  | 'IP-Details werden geladen…'
  | 'IP-, Netzwerk- und Geolocation-Details'
  | 'Details zu {ip} anzeigen'
  | 'Details zu {ip}'
  | 'IP kopieren:'
  | 'IP kopiert'
  | 'IP kopieren'
  | 'Details schließen'
  | 'Schließen'
  | 'nicht konfiguriert'
  | 'nicht verfügbar'
  | 'Organisation'
  | 'Netzwerk'
  | 'Standort'
  | 'Koordinaten'
  | 'Zeitzone'

  // ─── History ─────────────────────────────────────────────────────────
  | 'Letzte Suchanfragen'
  | 'History löschen'
  | 'Noch keine History'
  | 'Erfolgreiche Domain-Lookups erscheinen hier automatisch.'
  | 'SSL fehlt'
  | 'SSL gültig'
  | 'DNSSEC aktiv'
  | 'DNSSEC inaktiv'
  | 'DMARC gesetzt'
  | 'DMARC fehlt'
  | 'Scan erneut'
  | '+{count} weitere'
  | 'keine Daten'
  | 'gerade eben'
  | 'vor {count} min'
  | 'vor {count} h'

  // ─── Available Check ─────────────────────────────────────────────────
  | 'Finde die passende Domain für dein Projekt — mit Alternativen zu gängigen TLDs.'
  | 'meinprojekt oder meinprojekt.de'
  | 'Prüfen'
  | 'Verfügbar'
  | 'Vergeben'
  | 'Unklar'
  | 'Domain kopieren:'
  | 'Domain kopiert'
  | 'Domain kopieren'
  | 'Du suchst qualitatives Hosting für dein neues Projekt? Dann schau doch mal bei {mittwald} vorbei — Managed Webhosting aus Deutschland, gemacht für Agenturen und Freelancer.'

  // ─── About ───────────────────────────────────────────────────────────
  | 'Warum diggy existiert'
  | 'diggy ist ein privates Lern- und Entwicklungsprojekt. Ich nutze es, um besser zu verstehen, wie DNS, Domains, SSL, Mail-Security und Web-Performance in der Praxis zusammenspielen.'
  | 'Ich arbeite bei einem Webhoster und habe dadurch täglich Berührungspunkte mit Domains, Hosting und technischen Setups. Dieses Tool ist aus genau dieser Neugier entstanden: Dinge sichtbar machen, die sonst oft in verschiedenen Tools, Terminals oder Panels verteilt sind.'
  | 'Gleichzeitig lerne ich noch, probiere Ideen aus und entwickle nebenbei auch an anderen Projekten. diggy ist also bewusst nicht „fertig“, sondern wächst Schritt für Schritt weiter.'
  | 'Ich stelle das Tool gerne öffentlich zur Verfügung, damit andere schnell einen kompakten Blick auf eine Domain bekommen können. Wenn es jemandem hilft, ein Problem schneller zu verstehen, hat sich das Projekt schon gelohnt.'
  | 'Lernprojekt'
  | 'Gebaut, um Hosting- und DNS-Themen besser zu verstehen.'
  | 'Webhosting-Bezug'
  | 'Inspiriert von realen Fragen rund um Domains, Mail und SSL.'
  | 'Öffentlich nutzbar'
  | 'Ein kleines Tool für schnelle Checks, nicht nur für mich allein.'
  | 'Was diggy sein soll'
  | 'Ein ruhiger Ort für Domain-Checks: DNS Records, Health Score, Mail Security, WHOIS/RDAP, Propagation und Speed in einer Oberfläche.'
  | 'Was noch kommt'
  | 'Mehr Feinschliff, bessere Erklärungen, sauberere Reports und kleine Features, die beim Lernen und Debuggen wirklich helfen.'

  // ─── Kontaktformular ─────────────────────────────────────────────────
  | 'Kontaktformular'
  | 'Schreib mir alternativ direkt über das Formular — ich melde mich per E-Mail zurück.'
  | 'Name, E-Mail und Nachricht werden per E-Mail an mich zugestellt und nur zur Beantwortung genutzt. An deine Adresse geht eine Empfangsbestätigung. Details unter {link}.'
  | 'Danke! Deine Nachricht wurde gesendet.'
  | 'E-Mail'
  | 'Nachricht'
  | 'Worum geht es?'
  | 'Noch mindestens {count} Zeichen'
  | 'Formular wird geladen…'
  | 'Gleich bereit ({count} s)'
  | 'Nachricht senden'
  | 'Kontaktformular konnte nicht initialisiert werden. Bitte Seite neu laden.'
  | 'Die Nachricht sollte mindestens {count} Zeichen lang sein.'
  | 'Bitte lade die Seite neu und versuche es erneut.'
  | 'Nachricht konnte nicht gesendet werden.'

  // ─── Fehler ──────────────────────────────────────────────────────────
  | 'Da ist etwas schiefgelaufen'
  | 'Die Ansicht konnte nicht dargestellt werden. Ein Neuladen hilft meistens.'
  | 'Neu laden'
  | 'Dieser Bereich konnte nicht dargestellt werden'
  | 'Erneut versuchen'
  | 'Die übrigen Bereiche des Reports funktionieren weiter.'
  | 'IP-Details konnten nicht geladen werden.'
  // Ersatztexte aus lib/api.ts, wenn der Server keine JSON-Antwort liefert
  | 'Lookup fehlgeschlagen'
  | 'Propagation-Check fehlgeschlagen'
  | 'DNSSEC-Check fehlgeschlagen'
  | 'SSL-Check fehlgeschlagen'
  | 'Mail-Audit fehlgeschlagen'
  | 'WHOIS-Lookup fehlgeschlagen'
  | 'Tech-Stack-Erkennung fehlgeschlagen'
  | 'PageSpeed fehlgeschlagen'
  | 'VirusTotal-Scan fehlgeschlagen'
  | 'IP-Details fehlgeschlagen'
  | 'Verfügbarkeits-Check fehlgeschlagen'
  | 'Kontaktformular konnte nicht geladen werden.'
  | 'Nachricht konnte nicht gesendet werden ({status})';

/**
 * Mehrzahl → Einzahl. Schlüssel ist die Mehrzahl (`{count} Tage`), der Wert
 * die Einzahl (`{count} Tag`). `t(key, { count })` wählt die Form.
 *
 * Vorher stand hier fest die Mehrzahl, also auch „noch 1 Tage“ — das
 * korrigiert sich damit nebenbei.
 */
export const DE_PLURALS = {
  '{count} Tage': '{count} Tag',
  'noch {count} Tage': 'noch {count} Tag',
  'seit {count} Tagen abgelaufen': 'seit {count} Tag abgelaufen',
  'vor {count} Tagen': 'vor {count} Tag',
  '{count} Monate': '{count} Monat',
  '{count} Jahre': '{count} Jahr',
  'SSL {count} Tage': 'SSL {count} Tag',
  Warnungen: 'Warnung',
  '{count} von {total} Resolvern weichen ab — möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.':
    '{count} von {total} Resolvern weicht ab — möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.',
  '{count} Engines haben angeschlagen': '{count} Engine hat angeschlagen',
  '{count} Engines haben die Domain als unbedenklich eingestuft.':
    '{count} Engine hat die Domain als unbedenklich eingestuft.',
  '{count} Vorschläge für {label}': '{count} Vorschlag für {label}',
  'Das Formular ist in {count} Sekunden bereit.': 'Das Formular ist in {count} Sekunde bereit.',
} as const satisfies Record<string, string>;

export type DePluralKey = keyof typeof DE_PLURALS;
export type DeKey = DeText | DePluralKey;

export interface Plural {
  one: string;
  other: string;
}

export type Message = string | Plural;

/**
 * Form des englischen Wörterbuchs: jeder deutsche Schlüssel genau einmal.
 *
 * Englisch darf auch dort Einzahl und Mehrzahl unterscheiden, wo das Deutsche
 * keine braucht („noch 3 Zeichen“, aber „3 more characters“) — umgekehrt nicht.
 */
export type Dictionary = { [K in DeText]: Message } & { [K in DePluralKey]: Plural };
