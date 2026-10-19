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
  'Vergleichen': 'Compare',

  // ─── Startseite ──────────────────────────────────────────────────────
  'Was steckt hinter deiner Domain?': 'What’s behind your domain?',
  'DNS, SSL, Mail-Security und Propagation auf einen Blick.':
    'DNS, SSL, email security and propagation at a glance.',
  'Ohne Fachchinesisch, mit Empfehlungen.': 'No jargon — just clear recommendations.',
  'Alles, was du wissen musst — in einem Tool.': 'Everything you need to know — in one tool.',
  'Was diggy prüft': 'What diggy checks',
  'Sechs Bereiche, ein Befund': 'Six areas, one verdict',
  'Jeder Bereich fließt in den Health Score ein. PageSpeed und VirusTotal gibt es auf Klick dazu.':
    'Every area counts toward the Health Score. PageSpeed and VirusTotal are one click away.',
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
  'Kennst du schon {converter} by diggy?': 'Have you tried {converter} by diggy?',
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
  'Permalink kopieren:': 'Copy permalink:',
  'Report-Bereiche': 'Report sections',
  'Multi-Resolver-Propagation': 'Multi-resolver propagation',
  'Keine Resolver-Antworten — Lookup eventuell fehlgeschlagen.':
    'No answers from the resolvers — the lookup may have failed.',
  'Dieser Check ist fehlgeschlagen.': 'This check failed.',
  'Link kopieren': 'Copy link',
  'Mit einer zweiten Domain vergleichen': 'Compare with a second domain',
  'JSON herunterladen': 'Download JSON',
  'Report als JSON herunterladen': 'Download the report as JSON',
  'Permalink zu diesem Report kopieren': 'Copy the permalink to this report',
  'nicht prüfbar': 'couldn’t check',
  'Der {name}-Check scheiterte ({reason}). Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.':
    'The {name} check failed ({reason}). Whether {name} is set up remains unclear — check again later.',
  'Der {name}-Check scheiterte. Ob {name} eingerichtet ist, bleibt offen — später erneut prüfen.':
    'The {name} check failed. Whether {name} is set up remains unclear — check again later.',

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
  'unwirksam': 'no effect',
  'keine Mails (Null-MX)': 'no email (null MX)',
  'Unvollständig:': 'Incomplete:',
  '{label} {count} Checks nicht prüfbar': {
    one: '{label} {count} check couldn’t be run',
    other: '{label} {count} checks couldn’t be run',
  },

  // ─── Records und Findings ────────────────────────────────────────────
  Alle: 'All',
  Warnung: 'Warning',
  Hinweis: 'Info',
  OK: 'OK',
  'Snippet kopiert': 'Snippet copied',
  'Snippet kopieren': 'Copy snippet',
  'ohne Punktabzug': 'no deduction',
  'TTL unbekannt': 'TTL unknown',
  'Null-MX': 'Null MX',
  'Null-MX — keine Mails': 'Null MX — no email',

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
  'Bleibt es bei SERVFAIL, steckt meist eine fehlerhafte Signatur dahinter.':
    'If SERVFAIL persists, a broken signature is usually the cause.',

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
  'keine': 'none',
  'wie {policy}': 'acts as {policy}',
  'rua ungültig': 'rua invalid',
  'MTA-STS schützt den Weg eingehender Mails. Diese Domain nimmt per Null-MX keine an — es gibt nichts zu schützen.':
    'MTA-STS protects the path of incoming email. This domain accepts none (null MX) — there’s nothing to protect.',
  'Keine Mails (Null-MX)': 'No email (null MX)',
  'Die Domain nimmt bewusst keine Mails an': 'The domain deliberately accepts no email',
  'Der Null-MX {record} (RFC 7505) sagt jedem Absender: Hier kommt keine Mail an. DKIM und MTA-STS braucht die Domain deshalb nicht.':
    'The null MX {record} (RFC 7505) tells every sender: no email is accepted here. So the domain doesn’t need DKIM or MTA-STS.',
  'SPF und DMARC sorgen dafür, dass Empfänger Mails in ihrem Namen abweisen.':
    'SPF and DMARC make sure recipients reject email sent in its name.',
  'Damit Empfänger auch Mails in ihrem Namen abweisen, gehören SPF -all und DMARC p=reject dazu.':
    'For recipients to also reject email sent in its name, add SPF -all and DMARC p=reject.',
  'erlaubt Absender': 'allows senders',
  'wie none, {flaw}': 'acts as none, {flaw}',
  'unwirksam, {flaw}': 'no effect, {flaw}',
  'Nicht nötig: Eine Domain ohne Mails (Null-MX) hat nichts zu signieren.':
    'Not needed: a domain without email (null MX) has nothing to sign.',
  'nicht nötig': 'not needed',
  'Markenlogo neben deinen Mails': 'Your brand logo next to your emails',
  'Nicht nötig: Eine Domain ohne Mails (Null-MX) verschickt nichts, neben dem ein Logo stünde.':
    'Not needed: a domain without email (null MX) sends nothing a logo could appear next to.',
  'Kein BIMI-Record auf default._bimi.<domain>': 'No BIMI record at default._bimi.<domain>',
  'Mit BIMI zeigen Postfächer dein Markenlogo neben authentifizierten Mails — vorausgesetzt, DMARC steht auf p=quarantine oder p=reject. Das ließ sich gerade nicht prüfen.':
    'With BIMI, inboxes show your brand logo next to authenticated email — provided DMARC is set to p=quarantine or p=reject. We couldn’t check that just now.',
  'BIMI setzt DMARC mit p=quarantine oder p=reject voraus, jetzt: {gap}. Erst DMARC verschärfen, dann lohnt sich BIMI.':
    'BIMI requires DMARC with p=quarantine or p=reject, currently: {gap}. Tighten DMARC first — then BIMI is worth it.',
  'Mit BIMI zeigen Postfächer dein Markenlogo neben authentifizierten Mails. Die DMARC-Voraussetzung ist erfüllt.':
    'With BIMI, inboxes show your brand logo next to authenticated email. Your DMARC policy already meets the requirement.',
  'l= und a= sind leer: Die Domain verzichtet ausdrücklich auf ein Logo.':
    'l= and a= are empty: the domain explicitly opts out of a logo.',
  'Zertifikat (VMC/CMC)': 'Certificate (VMC/CMC)',
  'hinterlegt': 'on file',
  'keins': 'none',
  'Ob Postfächer das Logo zeigen, hängt an DMARC — dessen Abfrage ist gescheitert.':
    'Whether inboxes show the logo depends on DMARC — and that lookup failed.',
  'Postfächer zeigen das Logo erst bei DMARC mit p=quarantine oder p=reject, jetzt: {gap}.':
    'Inboxes only show the logo with DMARC at p=quarantine or p=reject, currently: {gap}.',
  'Berichte über gescheiterte TLS-Zustellung': 'Reports on failed TLS delivery',
  'Nicht nötig: Eine Domain ohne Mails (Null-MX) bekommt keine Zustellungen, über die jemand berichten könnte.':
    'Not needed: a domain without email (null MX) receives no deliveries anyone could report on.',
  'Kein TLS-RPT-Record auf _smtp._tls.<domain>': 'No TLS-RPT record at _smtp._tls.<domain>',
  'Mit TLS-RPT (RFC 8460) melden Absender, wenn die verschlüsselte Zustellung an deine Mailserver scheitert — die Rückmeldung zu MTA-STS.':
    'With TLS-RPT (RFC 8460), senders report when encrypted delivery to your mail servers fails — the feedback channel for MTA-STS.',
  'Berichte an': 'Reports to',
  'ungültig': 'invalid',
  'wirkt nicht': 'no effect',
  'abgemeldet': 'opted out',

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
  '{count} von {total} Resolvern weichen ab — eine Änderung ist noch nicht überall angekommen. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).': {
    one: '{count} of {total} resolvers differs — a change hasn’t reached everywhere yet. Resolvers keep serving the old state until their cache expires (TTL).',
    other: '{count} of {total} resolvers differ — a change hasn’t reached everywhere yet. Resolvers keep serving the old state until their cache expires (TTL).',
  },
  'Alle Resolver liefern denselben {type}-Record — sauber propagiert.':
    'All resolvers return the same {type} record — fully propagated.',
  'Kein Resolver liefert einen {types} unter diesem Namen.':
    'No resolver returns any {types} under this name.',
  '{type}-Record': '{type} record',
  '{types}- oder {last}-Record': '{types} or {last} record',
  'Antwort {letter}': 'Answer {letter}',
  'kein Eintrag': 'no record',
  '{label} · weicht ab': '{label} · differs',
  'Mehrheit': 'Majority',
  'weicht ab': 'differs',
  'Gekürzt zeigen': 'Show shortened',
  'Ganzen Wert zeigen ({count} Zeichen)': 'Show full value ({count} characters)',
  'diggy fragt aus Deutschland. Die Anbieter antworten jeweils aus ihrem nächstgelegenen Rechenzentrum (Anycast): Du siehst die Caches verschiedener Anbieter an einem Ort, keine weltweite Verteilung. Die Flagge zeigt den Sitz des Anbieters.':
    'diggy asks from Germany. Each provider answers from its nearest data center (anycast): you see the caches of different providers in one place, not a worldwide spread. The flag shows where the provider is based.',

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
  'PageSpeed-Analyse läuft…': 'PageSpeed analysis running…',

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
  'VirusTotal-Scan läuft…': 'VirusTotal scan running…',

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
  'Öffentlich nutzbar': 'Open to everyone',
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

  // ─── Record-Erklärungen ──────────────────────────────────────────────
  'IPv4-Adresse': 'IPv4 address',
  'IPv6-Adresse': 'IPv6 address',
  'Alias für einen anderen Namen': 'Alias for another name',
  'Mailserver': 'Mail servers',
  'Zuständige Nameserver': 'Authoritative nameservers',
  'Freier Text': 'Free-form text',
  'Erlaubte Zertifizierungsstellen': 'Allowed certificate authorities',
  'Stammdaten der Zone': 'Zone master data',
  'Erlaubte Absender': 'Allowed senders',
  'Digitale Unterschrift': 'Digital signature',
  'Regel gegen Fälschungen': 'Rule against forgeries',
  'Verschlüsselung erzwingen': 'Enforce encryption',
  'Markenlogo im Postfach': 'Brand logo in the inbox',
  'Berichte über Zustellprobleme': 'Reports on delivery problems',
  'Kein Mail-Empfang': 'No incoming email',
  'Die IPv4-Adresse des Servers hinter diesem Namen – dorthin verbinden sich Browser und Apps. Die Sekunden rechts zeigen die TTL: Sie sagt, wie lange DNS-Server die Antwort zwischenspeichern dürfen, deshalb kommen Änderungen nicht sofort überall an.':
    'The IPv4 address of the server behind this name – browsers and apps connect to it. The seconds on the right show the TTL: how long DNS servers may cache the answer, which is why changes don’t show up everywhere right away.',
  'Wie der A-Record, nur mit einer IPv6-Adresse, dem neueren Adressformat. Fehlt er, ist die Domain nur über IPv4 erreichbar.':
    'Like the A record, but with an IPv6 address, the newer address format. Without it, the domain is only reachable over IPv4.',
  'Macht diesen Namen zum Alias eines anderen: Wer ihn abfragt, bekommt die Einträge des Ziels. Eigene weitere Einträge darf ein Name mit CNAME nicht haben – was sonst in der Liste steht, kommt vom Ziel.':
    'Makes this name an alias of another one: whoever looks it up gets the target’s records. A name with a CNAME can’t have other records of its own – anything else in the list comes from the target.',
  'Nennt die Server, die E-Mails für die Domain annehmen. Die Zahl davor ist die Priorität: Der kleinste Wert wird zuerst versucht, die anderen springen ein, wenn er nicht erreichbar ist.':
    'Names the servers that accept email for the domain. The number in front is the priority: the lowest value is tried first, the others step in if it’s unreachable.',
  'Die DNS-Server, die für die Domain verbindlich Auskunft geben. Auf ihnen sind alle anderen Einträge gespeichert.':
    'The DNS servers that give authoritative answers for the domain. All the other records are stored on them.',
  'Beliebiger Text zu einem Namen. Damit weist du etwa Google oder Microsoft nach, dass dir die Domain gehört, und auch Mail-Regeln wie SPF stehen hier.':
    'Any text attached to a name. It’s how you prove to Google or Microsoft that you own the domain, for example, and email rules like SPF live here too.',
  'Legt fest, welche Zertifizierungsstellen (etwa Let’s Encrypt) TLS-Zertifikate für die Domain ausstellen dürfen. Gibt es keinen CAA-Record, darf das jede.':
    'Decides which certificate authorities (such as Let’s Encrypt) may issue TLS certificates for the domain. Without a CAA record, any of them may.',
  'Nennt den primären Nameserver, eine Kontaktadresse und eine Seriennummer, die bei jeder Änderung steigen sollte. Die Zahlen danach regeln, wie oft sich die Nameserver abgleichen und wie lange „gibt es nicht“-Antworten gemerkt werden.':
    'Names the primary nameserver, a contact address and a serial number that should go up with every change. The numbers after it control how often the nameservers sync and how long “doesn’t exist” answers are remembered.',
  'Eine Liste der Server, die E-Mails im Namen deiner Domain verschicken dürfen. Empfänger prüfen damit, ob eine Mail von einem erlaubten Server kommt.':
    'A list of the servers allowed to send email on behalf of your domain. Recipients use it to check whether an email comes from an allowed server.',
  'Dein Mailserver unterschreibt ausgehende Mails, der passende öffentliche Schlüssel steht im DNS unter <selector>._domainkey. So kann der Empfänger prüfen, dass die Mail wirklich von deiner Domain stammt und unterwegs nicht verändert wurde.':
    'Your mail server signs outgoing email, and the matching public key sits in DNS under <selector>._domainkey. That lets the recipient check that the email really comes from your domain and wasn’t changed on the way.',
  'Sagt Empfängern, was mit Mails passieren soll, die deine Domain als Absender zeigen, aber weder per SPF noch per DKIM für genau diese Domain bestätigt sind: nichts tun (none), in den Spamordner (quarantine) oder ablehnen (reject). Mit rua bekommst du Berichte.':
    'Tells recipients what to do with email that shows your domain as the sender but isn’t confirmed for exactly this domain by SPF or DKIM: nothing (none), the spam folder (quarantine) or reject it (reject). With rua you get reports.',
  'Verlangt von anderen Mailservern, Mails an deine Domain nur verschlüsselt und an Server mit gültigem Zertifikat zuzustellen. Ohne einen solchen Schutz kann ein Angreifer unterwegs die Verschlüsselung abschalten und mitlesen.':
    'Requires other mail servers to deliver email to your domain only encrypted and only to servers with a valid certificate. Without this protection, an attacker on the way can switch off encryption and read along.',
  'Hinterlegt ein Logo, das Postfächer neben deinen Mails zeigen können. Das klappt nur mit DMARC auf quarantine oder reject; Gmail und Apple Mail verlangen zusätzlich ein Markenzertifikat (VMC oder CMC).':
    'Publishes a logo that inboxes can show next to your email. This only works with DMARC set to quarantine or reject; Gmail and Apple Mail also require a brand certificate (VMC or CMC).',
  'Nennt eine Adresse, an die andere Mailserver berichten, wenn die verschlüsselte Zustellung an deine Domain scheitert. So fällt auf, wenn etwa ein abgelaufenes Zertifikat oder MTA-STS Mails aufhält.':
    'Names an address where other mail servers report when encrypted delivery to your domain fails. That way you notice when, say, an expired certificate or MTA-STS is holding up email.',
  'Priorität 0 und als Ziel nur ein Punkt, also kein Server: So sagt eine Domain allen Mailservern, dass sie keine E-Mails annimmt (RFC 7505). Mails an sie kommen sofort als unzustellbar zurück, nicht erst nach tagelangen Zustellversuchen.':
    'Priority 0 and just a dot as the target, meaning no server: that’s how a domain tells every mail server it doesn’t accept email (RFC 7505). Email sent to it bounces right away instead of after days of delivery attempts.',
  'Was bedeutet {term}?': 'What does {term} mean?',

  // ─── Seit dem letzten Check ──────────────────────────────────────────
  'Seit dem letzten Check': 'Since your last check',
  'Wird verglichen, sobald alle Checks fertig sind …': 'Comparing as soon as all checks are done …',
  'Keine Änderungen seit {date}': 'No changes since {date}',
  '{count} Änderungen seit {date}': {
    one: '{count} change since {date}',
    other: '{count} changes since {date}',
  },
  'dem letzten Check': 'your last check',
  'Zeitpunkt unbekannt': 'time unknown',
  'Ausblenden': 'Hide',
  'Anzeigen': 'Show',
  'gestiegen': 'up',
  'gefallen': 'down',
  'erneuert': 'renewed',
  'getauscht': 'replaced',
  'deaktiviert': 'disabled',
  'neu': 'new',
  'entfallen': 'removed',
  'geändert': 'changed',
  'Zertifikat gilt jetzt bis {date}': 'Certificate now runs until {date}',
  'Zertifikat getauscht, gilt nur noch bis {date}':
    'Certificate replaced, now only valid until {date}',
  'Zertifikat ungültig oder abgelaufen': 'Certificate invalid or expired',
  'Zertifikat jetzt gültig bis {date}': 'Certificate now valid until {date}',
  'DNSSEC ist jetzt aktiv': 'DNSSEC is now active',
  'DNSSEC ist nicht mehr aktiv': 'DNSSEC is no longer active',
  'DMARC-Record entfernt': 'DMARC record removed',
  'DMARC-Record gesetzt, Policy {policy}': 'DMARC record set, policy {policy}',
  'DMARC-Record gesetzt': 'DMARC record set',
  'DMARC-Policy {from} → {to}': 'DMARC policy {from} → {to}',
  '{type}-Records': { one: '{type} record', other: '{type} records' },

  // ─── Kalender ────────────────────────────────────────────────────────
  'Termin am Ablaufdatum mit Erinnerung 14 Tage und 1 Tag vorher (.ics)':
    'Event on the expiry date, with reminders 14 days and 1 day before (.ics)',
  'In den Kalender': 'Add to calendar',
  'Die Kalender-Datei ließ sich nicht laden. Lade die Seite neu und versuch es noch einmal.':
    'Couldn’t load the calendar file. Reload the page and try again.',
  'Zertifikat von {subject}': 'Certificate for {subject}',
  '{label} läuft ab': '{label} expires',
  '{label} läuft in 14 Tagen ab': '{label} expires in 14 days',
  '{label} läuft morgen ab': '{label} expires tomorrow',
  'Das TLS-Zertifikat von {subject} läuft am {date} ab. Danach zeigen Browser eine Sicherheitswarnung. Prüfen, ob die automatische Erneuerung greift.':
    'The TLS certificate for {subject} expires on {date}. After that, browsers show a security warning. Check that automatic renewal is working.',
  'Die Registrierung von {subject} läuft am {date} ab. Ohne Verlängerung kann die Domain abgeschaltet und neu vergeben werden. Prüfen, ob die automatische Verlängerung beim Registrar aktiv ist.':
    'The registration of {subject} expires on {date}. Without a renewal, the domain can be shut down and registered by someone else. Check that auto-renewal is turned on at your registrar.',
  'Aktueller Stand im Report: {url}': 'Current status in the report: {url}',
  '{day} um {time}': '{day} at {time}',

  // ─── Vergleich ───────────────────────────────────────────────────────
  'Vergleich': 'Comparison',
  'Zwei Domains vergleichen': 'Compare two domains',
  'Zum Beispiel alter gegen neuen Hoster während eines Umzugs oder {apex} gegen {www}. Abweichungen sind markiert.':
    'For example, your old host against the new one during a move, or {apex} against {www}. Differences are highlighted.',
  'Zwei Domains eintragen': 'Enter two domains',
  'Verglichen werden Health Score, Records je Typ, Mail-Schutz, Zertifikat und DNSSEC.':
    'Compares the Health Score, records by type, email protection, certificate and DNSSEC.',
  'Domains im Vergleich': 'Domains compared',
  'Domains tauschen': 'Swap domains',
  '{domain} vergleichen': 'Compare {domain}',
  '{label} eintragen': 'Enter {label}',
  'Trag oben eine zweite Domain ein, um sie mit {domain} zu vergleichen.':
    'Enter a second domain above to compare it with {domain}.',
  'Trag oben eine Domain ein.': 'Enter a domain above.',
  'Nur Domains vergleichbar': 'Only domains can be compared',
  'IP-Adresse ansehen': 'View IP address',
  '{ip} ist eine IP-Adresse. Records, Mail-Schutz und Zertifikat gehören zu Domains — für IPs gibt es die Einzelansicht mit Reverse DNS.':
    '{ip} is an IP address. Records, email protection and certificates belong to domains — for IPs, there’s the single view with reverse DNS.',
  'Vollständigen Report öffnen': 'Open full report',
  'Score wird berechnet': 'Calculating score',
  'Wird noch geladen …': 'Still loading …',
  'Keine Unterschiede': 'No differences',
  '{count} Unterschiede in {total} Punkten': {
    one: '{count} difference in {total} checks',
    other: '{count} differences in {total} checks',
  },
  '{domain} liegt {count} Punkte vorn': {
    one: '{domain} leads by {count} point',
    other: '{domain} leads by {count} points',
  },
  'Score gleichauf': 'Scores tied',
  'Gegenüberstellung': 'Side by side',
  'Records je Typ': 'Records by type',
  'Zertifikat': 'Certificate',
  'Nameserver & DNSSEC': 'Nameservers & DNSSEC',
  '{count} Unterschiede': { one: '{count} difference', other: '{count} differences' },
  'keine Unterschiede': 'no differences',
  'Unterschied': 'different',
  'Gleich eingestuft, im Detail verschieden': 'Rated the same, different in detail',
  'gleichwertig': 'equivalent',
  'gleich': 'same',
  'nur hier': 'only here',
  'Check fehlgeschlagen': 'Check failed',
  'gültig, mit Hinweisen': 'valid, with notes',
  'keine gefunden': 'none found',
  'DMARC-Policy': 'DMARC policy',
  'Restlaufzeit': 'Time left',
  'läuft heute ab': 'expires today',
  'nicht anwendbar': 'not applicable',
  'kein TLS erreichbar': 'no TLS reachable',
  'Nameserver-Anbieter': 'Nameserver provider',
  'keine eigenen': 'none of its own',

  // ─── Satzbausteine aus shared/ und vom Server ────────────────────────
  'Zeitüberschreitung': 'timeout',
  'SERVFAIL': 'SERVFAIL',
  'Netzwerkfehler': 'network error',
  'Abfrage gescheitert': 'query failed',
  'p= fehlt': 'p= missing',
  '{tag}= ist leer': '{tag}= is empty',
  '{tag}={value} ist ungültig': '{tag}={value} is invalid',
  '{count} DMARC-Records statt einem': '{count} DMARC records instead of one',
  'p= ungültig': 'p= invalid',
  'sp= ungültig': 'sp= invalid',
  '{count} Records': '{count} records',
  'Bei mehr als einem DMARC-Record wenden Empfänger DMARC gar nicht an (RFC 7489 §6.6.3) — als gäbe es keins.':
    'With more than one DMARC record, recipients don’t apply DMARC at all (RFC 7489 §6.6.3) — as if there were none.',
  'Ein ungültiges sp= macht den ganzen Record ungültig, auch p={declared}. Weil rua= eine Report-Adresse nennt, werten Empfänger ihn wie p=none (RFC 7489 §6.6.3): Fälschungen werden gemeldet, aber nicht abgelehnt.':
    'An invalid sp= makes the whole record invalid, including p={declared}. Because rua= names a report address, recipients treat it like p=none (RFC 7489 §6.6.3): spoofed email gets reported, but not rejected.',
  'Ein ungültiges sp= macht den ganzen Record ungültig, auch p={declared}. Ohne gültige Report-Adresse in rua= ignorieren Empfänger ihn (RFC 7489 §6.6.3) — als gäbe es kein DMARC.':
    'An invalid sp= makes the whole record invalid, including p={declared}. Without a valid report address in rua=, recipients ignore it (RFC 7489 §6.6.3) — as if there were no DMARC.',
  'Ohne gültiges p= werten Empfänger den Record wie p=none, weil rua= eine Report-Adresse nennt (RFC 7489 §6.6.3): Fälschungen werden gemeldet, aber nicht abgelehnt.':
    'Without a valid p=, recipients treat the record like p=none because rua= names a report address (RFC 7489 §6.6.3): spoofed email gets reported, but not rejected.',
  'Ohne gültiges p= und ohne gültige Report-Adresse in rua= ignorieren Empfänger den Record (RFC 7489 §6.6.3) — als gäbe es kein DMARC.':
    'Without a valid p= and without a valid report address in rua=, recipients ignore the record (RFC 7489 §6.6.3) — as if there were no DMARC.',
  'Die Version muss genau v={version} lauten, nicht v={leading}':
    'The version must be exactly v={version}, not v={leading}',
  'v={version} muss als erstes Tag stehen': 'v={version} must be the first tag',
  'v={version} fehlt am Anfang': 'v={version} is missing at the start',
  '{count} BIMI-Records — es darf nur einen geben': '{count} BIMI records — there may only be one',
  'l= fehlt — das Tag ist Pflicht, zum Verzichten leer':
    'l= is missing — the tag is required (leave it empty to opt out)',
  'l= ist leer, a= aber gesetzt — ohne Logo-URL zeigen Empfänger kein Logo':
    'l= is empty but a= is set — without a logo URL, recipients show no logo',
  'Die Logo-URL in l= muss mit https:// beginnen': 'The logo URL in l= must start with https://',
  'Das Logo muss ein SVG sein (SVG Tiny PS), kein Pixelbild':
    'The logo must be an SVG (SVG Tiny PS), not a raster image',
  'Die Zertifikats-URL in a= muss mit https:// beginnen':
    'The certificate URL in a= must start with https://',
  'kein DMARC-Record': 'no DMARC record',
  'DMARC wirkt wie p=none ({problem})': 'DMARC acts as p=none ({problem})',
  'DMARC wirkt nicht ({problem})': 'DMARC has no effect ({problem})',
  'DMARC p=none': 'DMARC p=none',
  'DMARC p=quarantine mit pct={pct}': 'DMARC p=quarantine with pct={pct}',
  'DMARC sp=none': 'DMARC sp=none',
  '{count} TLS-RPT-Records — RFC 8460 verlangt genau einen':
    '{count} TLS-RPT records — RFC 8460 requires exactly one',
  'rua= fehlt — ohne Ziel verschickt niemand Berichte':
    'rua= is missing — without a destination, nobody sends reports',
  '„{uri}“ ist kein Berichtsziel — erlaubt sind mailto: und https:':
    '“{uri}” isn’t a valid report destination — only mailto: and https: are allowed',
  'Die Abfrage lief in eine Zeitüberschreitung.': 'The query timed out.',
  'Der Resolver antwortete mit SERVFAIL — meist vorübergehend, manchmal ein Zeichen für gestörte Nameserver der Domain.':
    'The resolver answered with SERVFAIL — usually temporary, sometimes a sign of trouble with the domain’s nameservers.',
  'Die Abfrage scheiterte an einem Netzwerkfehler.': 'The query failed due to a network error.',
  'Nicht alle gängigen Selectors ließen sich abfragen. {detail}':
    'Not all common selectors could be queried. {detail}',
  'Der Resolver antwortete auf die DS- oder DNSKEY-Abfrage mit SERVFAIL. Das kann vorübergehend sein. Bleibt es dabei, steckt meist eine fehlerhafte DNSSEC-Signatur dahinter — dann scheitern validierende Resolver an der ganzen Domain.':
    'The resolver answered the DS or DNSKEY query with SERVFAIL. That can be temporary. If it persists, a broken DNSSEC signature is usually the cause — and validating resolvers then fail on the entire domain.',
  'Die DS- oder DNSKEY-Abfrage blieb unbeantwortet. {detail}':
    'The DS or DNSKEY query went unanswered. {detail}',
  'Port 443 hat den TLS-Handshake nicht rechtzeitig abgeschlossen — ein überlasteter Server oder eine Firewall, die den Port stumm verwirft.':
    'Port 443 didn’t complete the TLS handshake in time — an overloaded server, or a firewall silently dropping the port.',
  'Die Adresse des Hosts ließ sich gerade nicht auflösen (SERVFAIL oder Resolver-Timeout).':
    'The host’s address couldn’t be resolved just now (SERVFAIL or resolver timeout).',
  'Der Host war über das Netz nicht erreichbar.': 'The host couldn’t be reached over the network.',
  'ohne echte Mails geht dabei nichts verloren. Reports (rua) nur an eine Adresse auf einer anderen Domain: diese hier nimmt keine Mails an.':
    'with no real email, nothing gets lost. Send reports (rua) only to an address on another domain: this one doesn’t accept email.',
  'Mit p=none läuft erstmal nur Reporting, ohne abzulehnen.':
    'With p=none you only get reports at first — nothing is rejected yet.',
  'Ohne echte Mails geht beim Ablehnen nichts verloren: direkt auf p=reject wechseln.':
    'With no real email, rejecting loses nothing: switch straight to p=reject.',
  'Sobald Reports stabil aussehen: auf quarantine wechseln.':
    'Once the reports look stable, switch to quarantine.',
  'Lass nur einen DMARC-Record stehen und entferne die übrigen. Brauchst du Report-Adressen aus mehreren, trag sie kommagetrennt in das rua= des einen ein.':
    'Keep just one DMARC record and remove the others. If you need report addresses from several, list them comma-separated in the rua= of the one you keep.',
  'Entferne sp= und setz p=reject — ohne echte Mails geht dabei nichts verloren, und ohne sp= gilt p= auch für Subdomains.':
    'Remove sp= and set p=reject — with no real email, nothing gets lost, and without sp=, p= also applies to subdomains.',
  'Entferne sp= oder setz es auf none, quarantine oder reject — ohne sp= gilt p={target} auch für Subdomains.':
    'Remove sp= or set it to none, quarantine or reject — without sp=, p={target} also applies to subdomains.',
  'Ersetze den Record durch einen mit p=reject direkt hinter v=DMARC1 — {advice}':
    'Replace the record with one that has p=reject right after v=DMARC1 — {advice}',
  'Ersetze den Record durch einen mit p= direkt hinter v=DMARC1: none, quarantine oder reject. {advice}':
    'Replace the record with one that has p= right after v=DMARC1: none, quarantine or reject. {advice}',
  'Trag p=reject direkt hinter v=DMARC1 ein — ohne echte Mails geht dabei nichts verloren.':
    'Add p=reject right after v=DMARC1 — with no real email, nothing gets lost.',
  'Trag p= direkt hinter v=DMARC1 ein. p=none hält fest, was Empfänger heute schon tun; danach Schritt für Schritt verschärfen.':
    'Add p= right after v=DMARC1. p=none captures what recipients already do today; then tighten it step by step.',
  'ein SPF, das niemanden senden lässt (v=spf1 -all)':
    'an SPF record that lets no one send (v=spf1 -all)',
  'DMARC mit p=reject (jetzt: {flaw})': 'DMARC with p=reject (currently: {flaw})',
  'DMARC mit p=reject für alle Mails (jetzt pct={pct})':
    'DMARC with p=reject for all email (currently pct={pct})',
  'DMARC mit p=reject (jetzt p={policy})': 'DMARC with p=reject (currently p={policy})',
  'DMARC mit p=reject': 'DMARC with p=reject',
  '{first} und {second}': '{first} and {second}',

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
  'Diese Seite konnte nicht geladen werden': 'This page couldn’t be loaded',
  'Meist hilft ein Neuladen, etwa nach einem Update von diggy.':
    'Reloading usually helps, for example after a diggy update.',
};

export interface EnglishPack {
  ui: Dictionary;
  findings: Record<FindingKey, FindingText>;
  apiErrors: Record<ApiErrorCode, string>;
}

const pack: EnglishPack = { ui, findings, apiErrors };

export default pack;
