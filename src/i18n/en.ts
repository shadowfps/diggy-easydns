import type { Dictionary } from './de';
import { apiErrors, findings, type FindingText } from './en.server';
import type { ApiErrorCode, FindingKey } from '@/types/dns';

/**
 * Englisches Wörterbuch (#86).
 *
 * Eigener Chunk: `i18n/index.ts` lädt ihn per `import()` erst, wenn Englisch
 * gewählt ist — deutsche Besucher laden davon nichts.
 *
 * Schlüssel sind die deutschen Texte aus `de.ts`. Fehlt einer oder ist einer
 * zu viel, meldet das der Compiler. Platzhalter wie `{count}` müssen in beiden
 * Sprachen gleich heißen (geprüft in i18n.test.ts).
 *
 * Ton: wie das Deutsche — freundlich, knapp, „you“ statt Passiv. Fachbegriffe
 * (SPF, DKIM, DMARC, TTL, Records) bleiben stehen. Amerikanische Schreibweise.
 */
const ui: Dictionary = {
  // ─── Header, Menü, Footer, Seitentitel ───────────────────────────────
  'Zur Startseite': 'Go to home page',
  'Menü öffnen': 'Open menu',
  'Menü schließen': 'Close menu',
  History: 'History',
  'Available Check': 'Availability check',
  About: 'About',
  Sprache: 'Language',
  Impressum: 'Legal notice',
  Datenschutz: 'Privacy policy',
  Rechtliches: 'Legal',

  // ─── Startseite ──────────────────────────────────────────────────────
  'Was steckt hinter deiner Domain?': 'What’s behind your domain?',
  'DNS, SSL, Mail-Security und Propagation auf einen Blick.':
    'DNS, SSL, email security and propagation at a glance.',
  'Ohne Fachchinesisch, mit Empfehlungen.': 'No jargon — just clear recommendations.',
  'Alles, was du wissen musst — in einem Tool.': 'Everything you need to know — in one tool.',
  'Was diggy prüft': 'What diggy checks',
  'Sechs Bereiche, ein Befund': 'Six areas, one verdict',
  'Jeder Bereich fließt in den Health Score ein. PageSpeed und VirusTotal gibt es auf Klick dazu.':
    'Every area counts towards the Health Score. PageSpeed and VirusTotal are one click away.',
  'A, AAAA, MX, NS, TXT, CAA, SOA und CNAME — mit dem Netzbetreiber hinter jeder IP.':
    'A, AAAA, MX, NS, TXT, CAA, SOA and CNAME — plus the network behind every IP.',
  'Mail-Schutz': 'Email protection',
  'SPF, DKIM, DMARC und MTA-STS: Kann jemand in deinem Namen Mails fälschen?':
    'SPF, DKIM, DMARC and MTA-STS: can someone fake emails in your name?',
  'Zertifikat, Aussteller und Ablaufdatum — bevor Besucher eine Warnung sehen.':
    'Certificate, issuer and expiry date — before your visitors see a warning.',
  'Sind die Antworten signiert, und hält die Vertrauenskette?':
    'Are the answers signed, and does the chain of trust hold?',
  'Fünf öffentliche Resolver im Vergleich: Ist eine Änderung überall angekommen?':
    'Five public resolvers side by side: has your change arrived everywhere?',
  'Registrar, Laufzeit und Status — bevor eine Domain unbemerkt ausläuft.':
    'Registrar, term and status — before a domain quietly expires.',
  'Kennst du schon {converter} by diggy?': 'Have you met {converter} by diggy?',
  'Bilder umwandeln, skalieren & komprimieren — direkt im Browser.':
    'Convert, resize & compress images — right in your browser.',
  'Zu Converter': 'Open converter',

  // ─── Suche ───────────────────────────────────────────────────────────
  'Jetzt deine Anfrage starten': 'Look up a domain or IP',
  'Domain oder IP-Adresse': 'Domain or IP address',
  Suchen: 'Search',
  'Zuletzt geprüft': 'Recently checked',
  Beispiele: 'Examples',
  '{value} in die Suche übernehmen': 'Use {value} in the search',

  // ─── Report: Kopf, Tabs, Zustände ────────────────────────────────────
  'Records werden geholt…': 'Fetching records…',
  Zusammenfassung: 'Summary',
  'DNS-Report': 'DNS report',
  'Geprüft am {date}': 'Checked on {date}',
  'Link kopiert': 'Link copied',
  'Permalink kopieren': 'Copy permalink',
  'Permalink kopieren:': 'Copy permalink:',
  'Report-Bereiche': 'Report sections',
  'Multi-Resolver-Propagation': 'Multi-resolver propagation',
  'Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen.':
    'No answers from the resolvers — the lookup may have failed.',
  'Dieser Check ist fehlgeschlagen.': 'This check failed.',

  // ─── Score und Schnellübersicht ──────────────────────────────────────
  Hervorragend: 'Excellent',
  'Solides Setup': 'Solid setup',
  Optimierbar: 'Room to improve',
  Lückenhaft: 'Patchy',
  Kritisch: 'Critical',
  Warnungen: { one: 'warning', other: 'warnings' },
  kritisch: 'critical',
  'Alle Findings': 'All findings',
  'Keine offenen Punkte': 'Nothing left to fix',
  'Wichtigster Punkt': 'Top priority',
  Schnellübersicht: 'At a glance',
  '{count} Tage': { one: '{count} day', other: '{count} days' },
  'kein Cert': 'no cert',
  aktiv: 'active',
  inaktiv: 'inactive',
  gesetzt: 'set',
  fehlt: 'missing',

  // ─── Records und Findings ────────────────────────────────────────────
  Alle: 'All',
  Warnung: 'Warning',
  Hinweis: 'Info',
  OK: 'OK',
  'Snippet kopiert': 'Snippet copied',
  'Snippet kopieren': 'Copy snippet',

  // ─── Security ────────────────────────────────────────────────────────
  'Nicht anwendbar: Namen mit Unterstrich sind DNS-Einträge, keine Hosts — unter ihnen läuft kein Webserver mit Zertifikat.':
    'Not applicable: names with an underscore are DNS entries, not hosts — there’s no web server with a certificate behind them.',
  'Kein TLS auf Port 443 erreichbar': 'No TLS reachable on port 443',
  gültig: 'valid',
  'nicht vertrauenswürdig': 'not trusted',
  Aussteller: 'Issuer',
  Gültig: 'Valid',
  Protokoll: 'Protocol',
  'noch {count} Tage': { one: '{count} day left', other: '{count} days left' },
  'seit {count} Tagen abgelaufen': {
    one: 'expired {count} day ago',
    other: 'expired {count} days ago',
  },
  'nicht aktiviert': 'not enabled',
  'DNSSEC schützt deine Domain gegen DNS-Spoofing. Die meisten Registrare bieten DNSSEC mit einem Klick — beim Hosting-Panel nachsehen.':
    'DNSSEC protects your domain against DNS spoofing. Most registrars switch it on with a single click — have a look in your hosting panel.',
  'aktiv & valide': 'active & valid',
  'Chain of Trust valide': 'Chain of trust valid',
  Algorithmus: 'Algorithm',
  unbekannt: 'unknown',
  'DS- und DNSKEY-Records vorhanden, von Cloudflare und Quad9 validiert.':
    'DS and DNSKEY records present, validated by Cloudflare and Quad9.',
  'Chain unterbrochen': 'Chain broken',
  'Die Domain hat einen DNSKEY, aber der Parent-DS-Record fehlt. Resolver können die Signatur nicht prüfen → DNSSEC ist effektiv aus. Beim Registrar den DS-Record nachtragen.':
    'The domain has a DNSKEY, but the DS record in the parent zone is missing. Resolvers can’t verify the signature → DNSSEC is effectively off. Add the DS record at your registrar.',
  'Validierung fehlgeschlagen': 'Validation failed',
  'DS und DNSKEY sind da, aber die Chain validiert nicht. Möglicherweise abgelaufene Signaturen oder falsche Schlüssel.':
    'DS and DNSKEY are there, but the chain doesn’t validate. Possibly expired signatures or the wrong keys.',

  // ─── Mail ────────────────────────────────────────────────────────────
  'Wer darf in deinem Namen senden?': 'Who may send email in your name?',
  'Kein SPF-Record gefunden': 'No SPF record found',
  problematisch: 'has issues',
  'Was passiert mit Spoofing-Versuchen?': 'What happens to spoofing attempts?',
  'Kein DMARC-Record auf _dmarc.<domain>': 'No DMARC record at _dmarc.<domain>',
  'rua gesetzt': 'rua set',
  'Welche Selectors signieren ausgehende Mails?': 'Which selectors sign outgoing email?',
  'Keine gängigen DKIM-Selectors gefunden (default, google, selector1, k1, …)':
    'No common DKIM selectors found (default, google, selector1, k1, …)',
  'Erzwingt TLS für eingehende Mail': 'Enforces TLS for incoming email',
  aktiviert: 'enabled',
  'nicht eingerichtet': 'not set up',
  'MTA-STS verhindert Downgrade-Angriffe, bei denen sich Angreifer zwischen Sender und Empfänger setzen und TLS abschalten.':
    'MTA-STS prevents downgrade attacks, where an attacker sits between sender and recipient and switches TLS off.',

  // ─── WHOIS ───────────────────────────────────────────────────────────
  'WHOIS / RDAP nicht verfügbar': 'WHOIS / RDAP not available',
  'Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.':
    'This TLD doesn’t support RDAP, or the lookup failed.',
  Registrierung: 'Registration',
  Erstellt: 'Created',
  'Läuft ab': 'Expires',
  Geändert: 'Updated',
  'vor {count} Tagen': { one: '{count} day ago', other: '{count} days ago' },
  '{count} Monate': { one: '{count} month', other: '{count} months' },
  '{count} Jahre': { one: '{count} year', other: '{count} years' },
  'Nameserver (laut Registry)': 'Nameservers (per registry)',
  'Keine Nameserver gemeldet.': 'No nameservers reported.',
  'Domain-Status': 'Domain status',
  'Keine Status-Codes.': 'No status codes.',
  'DNSSEC bei Registry: {status}': 'DNSSEC at the registry: {status}',
  delegiert: 'delegated',
  'nicht delegiert': 'not delegated',
  'Transfer-Sperre (Client)': 'Transfer lock (client)',
  'Transfer-Sperre (Registry)': 'Transfer lock (registry)',
  'Lösch-Sperre (Client)': 'Delete lock (client)',
  'Lösch-Sperre (Registry)': 'Delete lock (registry)',
  'Update-Sperre (Client)': 'Update lock (client)',
  'Update-Sperre (Registry)': 'Update lock (registry)',
  'Renewal-Sperre (Client)': 'Renewal lock (client)',
  Aktiv: 'Active',
  Inaktiv: 'Inactive',
  'Erstellung läuft': 'Creation pending',
  'Renewal läuft': 'Renewal pending',
  'Update läuft': 'Update pending',
  'Transfer läuft': 'Transfer pending',
  'Löschung läuft': 'Deletion pending',
  'Restore läuft': 'Restore pending',
  'Redemption Period': 'Redemption period',
  'Client-Hold (nicht aufgelöst!)': 'Client hold (not resolving!)',
  'Server-Hold (nicht aufgelöst!)': 'Server hold (not resolving!)',

  // ─── Propagation ─────────────────────────────────────────────────────
  '{count} von {total} Resolvern weichen ab — möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.':
    {
      one: '{count} of {total} resolvers differs — maybe not propagated yet, or GeoDNS / Anycast on purpose.',
      other:
        '{count} of {total} resolvers differ — maybe not propagated yet, or GeoDNS / Anycast on purpose.',
    },
  'Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.':
    'All resolvers return the same answer — DNS has propagated cleanly.',
  '— kein Eintrag': '— no record',

  // ─── PageSpeed ───────────────────────────────────────────────────────
  'Scan abgeschlossen': 'Scan complete',
  'Top Optimierungspotenziale': 'Top opportunities',
  'Keine kritischen Opportunities gefunden.': 'No critical opportunities found.',
  'Verbinde mit PageSpeed Insights…': 'Connecting to PageSpeed Insights…',
  'Starte Lighthouse Runner…': 'Starting Lighthouse…',
  'Messe Core Web Vitals…': 'Measuring Core Web Vitals…',
  'Analysiere Render-Pfad…': 'Analyzing the render path…',
  'Bereite Ergebnisse auf…': 'Preparing results…',
  'Analyse läuft': 'Analysis running',
  gut: 'good',
  verbesserungswürdig: 'needs improvement',
  schlecht: 'poor',

  // ─── VirusTotal ──────────────────────────────────────────────────────
  'Prüft die Domain gegen 80+ Sicherheits-Engines auf Malware, Phishing und Blacklists.':
    'Checks the domain against 80+ security engines for malware, phishing and blocklists.',
  'Scan starten': 'Start scan',
  'Community-Bewertung (negativ = schlechter Ruf)': 'Community rating (negative = bad reputation)',
  'Letzte Analyse: {date}': 'Last analysis: {date}',
  '{count} Engines haben angeschlagen': {
    one: '{count} engine flagged this domain',
    other: '{count} engines flagged this domain',
  },
  'Kategorisierung durch Sicherheits-Engines': 'Categories assigned by security engines',
  '{count} Engines haben die Domain als unbedenklich eingestuft.': {
    one: '{count} engine rated the domain as harmless.',
    other: '{count} engines rated the domain as harmless.',
  },
  Sauber: 'Clean',
  'Keine Bedrohungen erkannt': 'No threats detected',
  Verdächtig: 'Suspicious',
  'Einige Engines haben Bedenken': 'Some engines have concerns',
  Schädlich: 'Malicious',
  'Domain als Bedrohung eingestuft': 'Domain classified as a threat',
  '{flagged} von {total} Engines haben angeschlagen': '{flagged} of {total} engines flagged this domain',
  'Verbinde mit VirusTotal…': 'Connecting to VirusTotal…',
  'Prüfe 80+ Security-Engines…': 'Checking 80+ security engines…',
  'Analysiere Blacklists…': 'Checking blocklists…',
  'Werte Reputation aus…': 'Evaluating reputation…',
  'Scan läuft': 'Scan running',

  // ─── IP-Details ──────────────────────────────────────────────────────
  'IP-Lookup': 'IP lookup',
  'Reverse-DNS wird ermittelt…': 'Looking up reverse DNS…',
  'Für diese IP ist kein PTR-Record konfiguriert.': 'No PTR record is configured for this IP.',
  'IP-Details werden geladen…': 'Loading IP details…',
  'IP-, Netzwerk- und Geolocation-Details': 'IP, network and geolocation details',
  'Details zu {ip} anzeigen': 'Show details for {ip}',
  'Details zu {ip}': 'Details for {ip}',
  'IP kopieren:': 'Copy IP:',
  'IP kopiert': 'IP copied',
  'IP kopieren': 'Copy IP',
  'Details schließen': 'Close details',
  Schließen: 'Close',
  'nicht konfiguriert': 'not configured',
  'nicht verfügbar': 'not available',
  Organisation: 'Organization',
  Netzwerk: 'Network',
  Standort: 'Location',
  Koordinaten: 'Coordinates',
  Zeitzone: 'Time zone',

  // ─── History ─────────────────────────────────────────────────────────
  'Letzte Suchanfragen': 'Recent lookups',
  'History löschen': 'Clear history',
  'Noch keine History': 'No history yet',
  'Erfolgreiche Domain-Lookups erscheinen hier automatisch.':
    'Successful domain lookups show up here automatically.',
  'SSL fehlt': 'No SSL',
  'SSL gültig': 'SSL valid',
  'SSL {count} Tage': { one: 'SSL {count} day', other: 'SSL {count} days' },
  'DNSSEC aktiv': 'DNSSEC active',
  'DNSSEC inaktiv': 'DNSSEC inactive',
  'DMARC gesetzt': 'DMARC set',
  'DMARC fehlt': 'DMARC missing',
  'Scan erneut': 'Scan again',
  '+{count} weitere': '+{count} more',
  'keine Daten': 'no data',
  'gerade eben': 'just now',
  'vor {count} min': '{count} min ago',
  'vor {count} h': '{count} h ago',

  // ─── Available Check ─────────────────────────────────────────────────
  'Finde die passende Domain für dein Projekt — mit Alternativen zu gängigen TLDs.':
    'Find the right domain for your project — with alternatives across popular TLDs.',
  'meinprojekt oder meinprojekt.de': 'myproject or myproject.com',
  Prüfen: 'Check',
  '{count} Vorschläge für {label}': {
    one: '{count} suggestion for {label}',
    other: '{count} suggestions for {label}',
  },
  Verfügbar: 'Available',
  Vergeben: 'Taken',
  Unklar: 'Unclear',
  'Domain kopieren:': 'Copy domain:',
  'Domain kopiert': 'Domain copied',
  'Domain kopieren': 'Copy domain',
  'Du suchst qualitatives Hosting für dein neues Projekt? Dann schau doch mal bei {mittwald} vorbei — Managed Webhosting aus Deutschland, gemacht für Agenturen und Freelancer.':
    'Looking for quality hosting for your new project? Take a look at {mittwald} — managed web hosting from Germany, made for agencies and freelancers.',

  // ─── About ───────────────────────────────────────────────────────────
  'Warum diggy existiert': 'Why diggy exists',
  'diggy ist ein privates Lern- und Entwicklungsprojekt. Ich nutze es, um besser zu verstehen, wie DNS, Domains, SSL, Mail-Security und Web-Performance in der Praxis zusammenspielen.':
    'diggy is a personal learning and side project. I use it to better understand how DNS, domains, SSL, email security and web performance work together in practice.',
  'Ich arbeite bei einem Webhoster und habe dadurch täglich Berührungspunkte mit Domains, Hosting und technischen Setups. Dieses Tool ist aus genau dieser Neugier entstanden: Dinge sichtbar machen, die sonst oft in verschiedenen Tools, Terminals oder Panels verteilt sind.':
    'I work at a web hosting company, so domains, hosting and technical setups are part of my everyday work. This tool grew out of exactly that curiosity: making visible what is usually scattered across different tools, terminals and panels.',
  'Gleichzeitig lerne ich noch, probiere Ideen aus und entwickle nebenbei auch an anderen Projekten. diggy ist also bewusst nicht „fertig“, sondern wächst Schritt für Schritt weiter.':
    'I’m still learning, trying out ideas and working on other projects on the side. So diggy is deliberately not “finished” — it keeps growing step by step.',
  'Ich stelle das Tool gerne öffentlich zur Verfügung, damit andere schnell einen kompakten Blick auf eine Domain bekommen können. Wenn es jemandem hilft, ein Problem schneller zu verstehen, hat sich das Projekt schon gelohnt.':
    'I’m happy to share the tool publicly so others can get a quick, compact look at a domain. If it helps someone understand a problem faster, the project has already paid off.',
  Lernprojekt: 'Learning project',
  'Gebaut, um Hosting- und DNS-Themen besser zu verstehen.':
    'Built to understand hosting and DNS topics better.',
  'Webhosting-Bezug': 'Rooted in web hosting',
  'Inspiriert von realen Fragen rund um Domains, Mail und SSL.':
    'Inspired by real questions about domains, email and SSL.',
  'Öffentlich nutzbar': 'Free for everyone',
  'Ein kleines Tool für schnelle Checks, nicht nur für mich allein.':
    'A small tool for quick checks — not just for me.',
  'Was diggy sein soll': 'What diggy wants to be',
  'Ein ruhiger Ort für Domain-Checks: DNS Records, Health Score, Mail Security, WHOIS/RDAP, Propagation und Speed in einer Oberfläche.':
    'A calm place for domain checks: DNS records, Health Score, email security, WHOIS/RDAP, propagation and speed in one interface.',
  'Was noch kommt': 'What’s next',
  'Mehr Feinschliff, bessere Erklärungen, sauberere Reports und kleine Features, die beim Lernen und Debuggen wirklich helfen.':
    'More polish, better explanations, cleaner reports and small features that genuinely help with learning and debugging.',

  // ─── Kontaktformular ─────────────────────────────────────────────────
  Kontaktformular: 'Contact form',
  'Schreib mir alternativ direkt über das Formular — ich melde mich per E-Mail zurück.':
    'Or write to me right here — I’ll get back to you by email.',
  'Name, E-Mail und Nachricht werden per E-Mail an mich zugestellt und nur zur Beantwortung genutzt. An deine Adresse geht eine Empfangsbestätigung. Details unter {link}.':
    'Your name, email address and message are sent to me by email and only used to reply. You’ll get a confirmation at your address. Details in the {link}.',
  'Danke! Deine Nachricht wurde gesendet.': 'Thanks! Your message has been sent.',
  'E-Mail': 'Email',
  Nachricht: 'Message',
  'Worum geht es?': 'What’s it about?',
  'Noch mindestens {count} Zeichen': {
    one: 'At least {count} more character',
    other: 'At least {count} more characters',
  },
  'Formular wird geladen…': 'Loading form…',
  'Gleich bereit ({count} s)': 'Ready in {count} s',
  'Nachricht senden': 'Send message',
  'Kontaktformular konnte nicht initialisiert werden. Bitte Seite neu laden.':
    'The contact form couldn’t be loaded. Please reload the page.',
  'Das Formular ist in {count} Sekunden bereit.': {
    one: 'The form will be ready in {count} second.',
    other: 'The form will be ready in {count} seconds.',
  },
  'Die Nachricht sollte mindestens {count} Zeichen lang sein.':
    'Your message should be at least {count} characters long.',
  'Bitte lade die Seite neu und versuche es erneut.': 'Please reload the page and try again.',
  'Nachricht konnte nicht gesendet werden.': 'Your message couldn’t be sent.',

  // ─── Fehler ──────────────────────────────────────────────────────────
  'Da ist etwas schiefgelaufen': 'Something went wrong',
  'Die Ansicht konnte nicht dargestellt werden. Ein Neuladen hilft meistens.':
    'This view couldn’t be displayed. Reloading usually helps.',
  'Neu laden': 'Reload',
  'Dieser Bereich konnte nicht dargestellt werden': 'This section couldn’t be displayed',
  'Erneut versuchen': 'Try again',
  'Die übrigen Bereiche des Reports funktionieren weiter.': 'The rest of the report still works.',
  'IP-Details konnten nicht geladen werden.': 'Couldn’t load the IP details.',
  'Lookup fehlgeschlagen': 'Lookup failed',
  'Propagation-Check fehlgeschlagen': 'Propagation check failed',
  'DNSSEC-Check fehlgeschlagen': 'DNSSEC check failed',
  'SSL-Check fehlgeschlagen': 'SSL check failed',
  'Mail-Audit fehlgeschlagen': 'Email audit failed',
  'WHOIS-Lookup fehlgeschlagen': 'WHOIS lookup failed',
  'Tech-Stack-Erkennung fehlgeschlagen': 'Tech stack detection failed',
  'PageSpeed fehlgeschlagen': 'PageSpeed failed',
  'VirusTotal-Scan fehlgeschlagen': 'VirusTotal scan failed',
  'IP-Details fehlgeschlagen': 'Couldn’t load the IP details',
  'Verfügbarkeits-Check fehlgeschlagen': 'Availability check failed',
  'Kontaktformular konnte nicht geladen werden.': 'The contact form couldn’t be loaded.',
  'Nachricht konnte nicht gesendet werden ({status})': 'Your message couldn’t be sent ({status})',
};

export interface EnglishPack {
  ui: Dictionary;
  findings: Record<FindingKey, FindingText>;
  apiErrors: Record<ApiErrorCode, string>;
}

const pack: EnglishPack = { ui, findings, apiErrors };

export default pack;
