import type { Verdict } from '@shared/scoring';
import type { PhraseText } from '@shared/textKeys';

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
  | 'Vergleichen'

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
  | 'Permalink kopieren:'
  | 'Report-Bereiche'
  | 'Multi-Resolver-Propagation'
  | 'Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen.'
  | 'Dieser Check ist fehlgeschlagen.'
  | 'Link kopieren'
  | 'Mit einer zweiten Domain vergleichen'
  | 'JSON herunterladen'
  | 'Report als JSON herunterladen'
  | 'Permalink zu diesem Report kopieren'
  | 'nicht prüfbar'
  | 'Der {name}-Check scheiterte ({reason}). Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.'
  | 'Der {name}-Check scheiterte. Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.'

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
  | 'unwirksam'
  | 'keine Mails (Null-MX)'
  | 'Unvollständig:'

  // ─── Records und Findings ────────────────────────────────────────────
  | 'Alle'
  | 'Warnung'
  | 'Hinweis'
  | 'OK'
  | 'Snippet kopiert'
  | 'Snippet kopieren'
  | 'ohne Punktabzug'
  | 'TTL unbekannt'
  | 'Null-MX'
  | 'Null-MX — keine Mails'

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
  | 'Bleibt es bei SERVFAIL, steckt meist eine fehlerhafte Signatur dahinter.'

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
  | 'keine'
  | 'wie {policy}'
  | 'rua ungültig'
  | 'MTA-STS schützt den Weg eingehender Mails. Diese Domain nimmt per Null-MX keine an — es gibt nichts zu schützen.'
  | 'Keine Mails (Null-MX)'
  | 'Die Domain nimmt bewusst keine Mails an'
  | 'Der Null-MX {record} (RFC 7505) sagt jedem Absender: Hier kommt keine Mail an. DKIM und MTA-STS braucht die Domain deshalb nicht.'
  | 'SPF und DMARC sorgen dafür, dass Empfänger Mails in ihrem Namen abweisen.'
  | 'Damit Empfänger auch Mails in ihrem Namen abweisen, gehören SPF -all und DMARC p=reject dazu.'
  | 'erlaubt Absender'
  | 'wie none, {flaw}'
  | 'unwirksam, {flaw}'
  | 'Nicht nötig: Eine Domain ohne Mails (Null-MX) hat nichts zu signieren.'
  | 'nicht nötig'
  | 'Markenlogo neben deinen Mails'
  | 'Nicht nötig: Eine Domain ohne Mails (Null-MX) verschickt nichts, neben dem ein Logo stünde.'
  | 'Kein BIMI-Record auf default._bimi.<domain>'
  | 'Mit BIMI zeigen Postfächer dein Markenlogo neben authentifizierten Mails — vorausgesetzt, DMARC steht auf p=quarantine oder p=reject. Das ließ sich gerade nicht prüfen.'
  | 'BIMI setzt DMARC mit p=quarantine oder p=reject voraus, jetzt: {gap}. Erst DMARC verschärfen, dann lohnt sich BIMI.'
  | 'Mit BIMI zeigen Postfächer dein Markenlogo neben authentifizierten Mails. Die DMARC-Voraussetzung ist erfüllt.'
  | 'l= und a= sind leer: Die Domain verzichtet ausdrücklich auf ein Logo.'
  | 'Zertifikat (VMC/CMC)'
  | 'hinterlegt'
  | 'keins'
  | 'Ob Postfächer das Logo zeigen, hängt an DMARC — dessen Abfrage ist gescheitert.'
  | 'Postfächer zeigen das Logo erst bei DMARC mit p=quarantine oder p=reject, jetzt: {gap}.'
  | 'Berichte über gescheiterte TLS-Zustellung'
  | 'Nicht nötig: Eine Domain ohne Mails (Null-MX) bekommt keine Zustellungen, über die jemand berichten könnte.'
  | 'Kein TLS-RPT-Record auf _smtp._tls.<domain>'
  | 'Mit TLS-RPT (RFC 8460) melden Absender, wenn die verschlüsselte Zustellung an deine Mailserver scheitert — die Rückmeldung zu MTA-STS.'
  | 'Berichte an'
  | 'ungültig'
  | 'wirkt nicht'
  | 'abgemeldet'

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
  | 'Alle Resolver liefern denselben {type}-Record — sauber propagiert.'
  | 'Kein Resolver liefert einen {types} unter diesem Namen.'
  | '{type}-Record'
  | '{types}- oder {last}-Record'
  | 'Antwort {letter}'
  | 'kein Eintrag'
  | '{label} · weicht ab'
  | 'Mehrheit'
  | 'weicht ab'
  | 'Gekürzt zeigen'
  | 'Ganzen Wert zeigen ({count} Zeichen)'

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
  | 'PageSpeed-Analyse läuft…'

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
  | 'VirusTotal-Scan läuft…'

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

  // ─── Record-Erklärungen ──────────────────────────────────────────────
  | 'IPv4-Adresse'
  | 'IPv6-Adresse'
  | 'Alias für einen anderen Namen'
  | 'Mailserver'
  | 'Zuständige Nameserver'
  | 'Freier Text'
  | 'Erlaubte Zertifizierungsstellen'
  | 'Stammdaten der Zone'
  | 'Erlaubte Absender'
  | 'Digitale Unterschrift'
  | 'Regel gegen Fälschungen'
  | 'Verschlüsselung erzwingen'
  | 'Markenlogo im Postfach'
  | 'Berichte über Zustellprobleme'
  | 'Kein Mail-Empfang'
  | 'Die IPv4-Adresse des Servers hinter diesem Namen – dorthin verbinden sich Browser und Apps. Die Sekunden rechts zeigen die TTL: Sie sagt, wie lange DNS-Server die Antwort zwischenspeichern dürfen, deshalb kommen Änderungen nicht sofort überall an.'
  | 'Wie der A-Record, nur mit einer IPv6-Adresse, dem neueren Adressformat. Fehlt er, ist die Domain nur über IPv4 erreichbar.'
  | 'Macht diesen Namen zum Alias eines anderen: Wer ihn abfragt, bekommt die Einträge des Ziels. Eigene weitere Einträge darf ein Name mit CNAME nicht haben – was sonst in der Liste steht, kommt vom Ziel.'
  | 'Nennt die Server, die E-Mails für die Domain annehmen. Die Zahl davor ist die Priorität: Der kleinste Wert wird zuerst versucht, die anderen springen ein, wenn er nicht erreichbar ist.'
  | 'Die DNS-Server, die für die Domain verbindlich Auskunft geben. Auf ihnen sind alle anderen Einträge gespeichert.'
  | 'Beliebiger Text zu einem Namen. Damit weist du etwa Google oder Microsoft nach, dass dir die Domain gehört, und auch Mail-Regeln wie SPF stehen hier.'
  | 'Legt fest, welche Zertifizierungsstellen (etwa Let’s Encrypt) TLS-Zertifikate für die Domain ausstellen dürfen. Gibt es keinen CAA-Record, darf das jede.'
  | 'Nennt den primären Nameserver, eine Kontaktadresse und eine Seriennummer, die bei jeder Änderung steigen sollte. Die Zahlen danach regeln, wie oft sich die Nameserver abgleichen und wie lange „gibt es nicht“-Antworten gemerkt werden.'
  | 'Eine Liste der Server, die E-Mails im Namen deiner Domain verschicken dürfen. Empfänger prüfen damit, ob eine Mail von einem erlaubten Server kommt.'
  | 'Dein Mailserver unterschreibt ausgehende Mails, der passende öffentliche Schlüssel steht im DNS unter <selector>._domainkey. So kann der Empfänger prüfen, dass die Mail wirklich von deiner Domain stammt und unterwegs nicht verändert wurde.'
  | 'Sagt Empfängern, was mit Mails passieren soll, die deine Domain als Absender zeigen, aber weder per SPF noch per DKIM für genau diese Domain bestätigt sind: nichts tun (none), in den Spamordner (quarantine) oder ablehnen (reject). Mit rua bekommst du Berichte.'
  | 'Verlangt von anderen Mailservern, Mails an deine Domain nur verschlüsselt und an Server mit gültigem Zertifikat zuzustellen. Ohne einen solchen Schutz kann ein Angreifer unterwegs die Verschlüsselung abschalten und mitlesen.'
  | 'Hinterlegt ein Logo, das Postfächer neben deinen Mails zeigen können. Das klappt nur mit DMARC auf quarantine oder reject; Gmail und Apple Mail verlangen zusätzlich ein Markenzertifikat (VMC oder CMC).'
  | 'Nennt eine Adresse, an die andere Mailserver berichten, wenn die verschlüsselte Zustellung an deine Domain scheitert. So fällt auf, wenn etwa ein abgelaufenes Zertifikat oder MTA-STS Mails aufhält.'
  | 'Priorität 0 und als Ziel nur ein Punkt, also kein Server: So sagt eine Domain allen Mailservern, dass sie keine E-Mails annimmt (RFC 7505). Mails an sie kommen sofort als unzustellbar zurück, nicht erst nach tagelangen Zustellversuchen.'
  | 'Was bedeutet {term}?'

  // ─── Seit dem letzten Check ──────────────────────────────────────────
  | 'Seit dem letzten Check'
  | 'Wird verglichen, sobald alle Checks fertig sind …'
  | 'Keine Änderungen seit {date}'
  | 'dem letzten Check'
  | 'Zeitpunkt unbekannt'
  | 'Ausblenden'
  | 'Anzeigen'
  | 'gestiegen'
  | 'gefallen'
  | 'erneuert'
  | 'getauscht'
  | 'deaktiviert'
  | 'neu'
  | 'entfallen'
  | 'geändert'
  | 'Zertifikat gilt jetzt bis {date}'
  | 'Zertifikat getauscht, gilt nur noch bis {date}'
  | 'Zertifikat ungültig oder abgelaufen'
  | 'Zertifikat jetzt gültig bis {date}'
  | 'DNSSEC ist jetzt aktiv'
  | 'DNSSEC ist nicht mehr aktiv'
  | 'DMARC-Record entfernt'
  | 'DMARC-Record gesetzt, Policy {policy}'
  | 'DMARC-Record gesetzt'
  | 'DMARC-Policy {from} → {to}'

  // ─── Kalender ────────────────────────────────────────────────────────
  | 'Termin am Ablaufdatum mit Erinnerung 14 Tage und 1 Tag vorher (.ics)'
  | 'In den Kalender'
  | 'Die Kalender-Datei ließ sich nicht laden. Lade die Seite neu und versuch es noch einmal.'
  | 'Zertifikat von {subject}'
  | '{label} läuft ab'
  | '{label} läuft in 14 Tagen ab'
  | '{label} läuft morgen ab'
  | 'Das TLS-Zertifikat von {subject} läuft am {date} ab. Danach zeigen Browser eine Sicherheitswarnung. Prüfen, ob die automatische Erneuerung greift.'
  | 'Die Registrierung von {subject} läuft am {date} ab. Ohne Verlängerung kann die Domain abgeschaltet und neu vergeben werden. Prüfen, ob die automatische Verlängerung beim Registrar aktiv ist.'
  | 'Aktueller Stand im Report: {url}'
  | '{day} um {time}'

  // ─── Vergleich ───────────────────────────────────────────────────────
  | 'Vergleich'
  | 'Zwei Domains vergleichen'
  | 'Zum Beispiel alter gegen neuen Hoster während eines Umzugs oder {apex} gegen {www}. Abweichungen sind markiert.'
  | 'Zwei Domains eintragen'
  | 'Verglichen werden Health Score, Records je Typ, Mail-Schutz, Zertifikat und DNSSEC.'
  | 'Domains im Vergleich'
  | 'Domains tauschen'
  | '{domain} vergleichen'
  | '{label} eintragen'
  | 'Trag oben eine zweite Domain ein, um sie mit {domain} zu vergleichen.'
  | 'Trag oben eine Domain ein.'
  | 'Nur Domains vergleichbar'
  | 'IP-Adresse ansehen'
  | '{ip} ist eine IP-Adresse. Records, Mail-Schutz und Zertifikat gehören zu Domains — für IPs gibt es die Einzelansicht mit Reverse DNS.'
  | 'Vollständigen Report öffnen'
  | 'Score wird berechnet'
  | 'Wird noch geladen …'
  | 'Keine Unterschiede'
  | 'Score gleichauf'
  | 'Gegenüberstellung'
  | 'Records je Typ'
  | 'Zertifikat'
  | 'Nameserver & DNSSEC'
  | 'keine Unterschiede'
  | 'Unterschied'
  | 'Gleich eingestuft, im Detail verschieden'
  | 'gleichwertig'
  | 'gleich'
  | 'nur hier'
  | 'Check fehlgeschlagen'
  | 'gültig, mit Hinweisen'
  | 'keine gefunden'
  | 'DMARC-Policy'
  | 'Restlaufzeit'
  | 'läuft heute ab'
  | 'nicht anwendbar'
  | 'kein TLS erreichbar'
  | 'Nameserver-Anbieter'
  | 'keine eigenen'

  // ─── Satzbausteine aus shared/ und vom Server ────────────────────────
  // Die Liste steht in shared/textKeys.ts (`PhraseText`): so nimmt `phrase()`
  // in shared/ und im Server nur Texte an, die hier — und damit in en.ts — stehen.
  | PhraseText

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
  | 'Nachricht konnte nicht gesendet werden ({status})'
  | 'Diese Seite konnte nicht geladen werden'
  | 'Meist hilft ein Neuladen, etwa nach einem Update von diggy.';

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
  '{count} von {total} Resolvern weichen ab — eine Änderung ist noch nicht überall angekommen. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).':
    '{count} von {total} Resolvern weicht ab — eine Änderung ist noch nicht überall angekommen. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).',
  '{label} {count} Checks nicht prüfbar': '{label} {count} Check nicht prüfbar',
  '{count} Änderungen seit {date}': '{count} Änderung seit {date}',
  '{type}-Records': '{type}-Record',
  '{count} Unterschiede in {total} Punkten': '{count} Unterschied in {total} Punkten',
  '{domain} liegt {count} Punkte vorn': '{domain} liegt {count} Punkt vorn',
  '{count} Unterschiede': '{count} Unterschied',
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
