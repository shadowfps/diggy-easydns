# Compliance-Einordnung

Technische Bestandsaufnahme, keine Rechtsberatung. Sie beschreibt, was der Code
tatsächlich tut, und ordnet das den einschlägigen Regelwerken zu. Die
rechtliche Bewertung gehört fachlich geprüft.

**Stand:** 8. September 2026, DSGVO-Teil ergänzt am 19. Oktober 2026 (#125, #132) und
20. Oktober 2026 (#105) ·
**Bezug:** Commit-Stand von PR #34

---

## EU AI Act (VO (EU) 2024/1689)

### Ergebnis

**Diggy ist kein KI-System im Sinne von Art. 3 Nr. 1 AI Act. Es bestehen keine
Pflichten aus der Verordnung.**

### Begründung

Art. 3 Nr. 1 verlangt ein System, das „aus den erhaltenen Eingaben **ableitet**,
wie Ausgaben erzeugt werden". Erwägungsgrund 12 stellt klar, dass Systeme, die
„auf ausschließlich von natürlichen Personen definierten Regeln beruhen, um
Vorgänge automatisch auszuführen", **nicht** erfasst sind.

Genau das ist hier der Fall. Jede Ausgabe der App entsteht aus fest
programmierten Regeln:

| Funktion | Wie die Ausgabe entsteht | Ort im Code |
|---|---|---|
| Health-Score | Feste Abzugstabelle pro Severity, aufsummiert, gedeckelt | `shared/scoring.ts` |
| Findings & Empfehlungen | `if`-Kaskaden über vorhandene/fehlende Records | `server/services/reportBuilder.ts` |
| Tech-Stack-Erkennung | Abgleich gegen eine fest hinterlegte Liste von Regex-Mustern | `server/services/techstack.ts` |
| SPF/DKIM/DMARC-Bewertung | Regeln aus RFC 7208, RFC 6376 und RFC 7489, hart kodiert | `server/services/mailAudit.ts`, `shared/dmarc.ts` |
| DNSSEC-Status | Auswertung von DS-/DNSKEY-Existenz und AD-Flag | `server/services/dnssec.ts` |
| Verfügbarkeits-Check | HTTP-Statuscode der RDAP-Antwort (404 = frei) bzw. der feste „nicht gefunden“-Satz der Registry über WHOIS (Port 43) | `server/services/domainAvailability.ts`, `server/services/whoisText.ts` |

Es gibt kein Modell, keine Trainingsdaten, keine Gewichte, keine Inferenz und
keine Anpassung des Verhaltens nach der Inbetriebnahme. Die
Laufzeit-Abhängigkeiten enthalten keine ML- oder LLM-Bibliothek — nachprüfbar
über `package.json`:

```
@fontsource/*, @gsap/react, clsx, cors, dotenv, express, gsap, helmet,
lucide-react, motion, nodemailer, react, react-dom, tailwind-merge, tldts
```

Die App bewirbt sich auch nicht als KI-Anwendung; in den UI-Texten kommt keine
entsprechende Behauptung vor.

### Der eine Grenzfall: VirusTotal

Der VirusTotal-Check zeigt Urteile fremder Scan-Engines an, von denen manche
intern ML einsetzen dürften. Das macht Diggy aber nicht zum Betreiber eines
KI-Systems:

- Diggy nimmt ein API-Ergebnis entgegen und stellt es dar. Es nimmt kein
  KI-System „unter eigener Verantwortung" in Betrieb, wie Art. 3 Nr. 4 es für
  den Betreiber-Begriff verlangt — es ist Kunde eines Dienstes.
- Domain-Reputation ist in keinem der Anwendungsfälle aus Anhang III genannt,
  fällt also auch nicht in den Hochrisiko-Bereich.
- Die Transparenzpflichten aus Art. 50 knüpfen an bestimmte Systemarten an
  (Interaktion mit Menschen, synthetische Inhalte, Emotionserkennung,
  biometrische Kategorisierung). Keine davon liegt vor.

Die Anzeige nennt VirusTotal als Quelle, die Herkunft der Bewertung ist für
Nutzer also erkennbar.

### Was sich ändern würde

Diese Einordnung hängt am Fehlen jeglicher Inferenz. Sie ist **neu zu prüfen**,
sobald eines davon dazukommt:

- **LLM-erzeugte Texte** (etwa formulierte Empfehlungen statt der festen
  Bausteine). Dann greift Art. 50 Abs. 1: Nutzer sind darüber zu informieren,
  dass sie mit einem KI-System interagieren, soweit das nicht offensichtlich
  ist. Bei synthetischen Inhalten kommt Abs. 2 hinzu
  (maschinenlesbare Kennzeichnung).
- **Gelernte Erkennung** statt Regex-Muster beim Tech-Stack.
- **Ein trainiertes Modell für den Score** oder eine Bewertung, die sich anhand
  gesammelter Lookups selbst anpasst — damit wäre auch das
  Adaptivitäts-Merkmal aus Art. 3 Nr. 1 erfüllt.
- **Art. 4 (KI-Kompetenz)** würde in diesen Fällen für die mit dem System
  befassten Personen relevant.

Als Faustregel für künftige Features: sobald eine Ausgabe nicht mehr
deterministisch aus dem Code herleitbar ist, ist diese Datei zu überarbeiten.

---

## DSGVO

Die Verarbeitung ist in `/datenschutz` beschrieben. Kurzfassung der
technischen Fakten:

| Was | Wo im Code | Speicherdauer |
|---|---|---|
| Abgefragte Domain/IP im Server-Cache | `server/lib/cache.ts` | bis 60 s (Propagation höchstens bis zur kürzesten TTL, mindestens 5 s; autoritative Nameserver 15 s), IP-Details 30 min, PageSpeed 15 min, VirusTotal 6 h |
| IP-Zähler für Rate-Limits | `server/lib/rateLimit.ts`, `contactSpamGuard.ts` | max. 24 h, nur im Arbeitsspeicher |
| Prüfsumme über Absender+Nachricht (Duplikatserkennung) | `contactSpamGuard.ts` | 5 min |
| Empfänger-Sperre für Auto-Replies | `contactSpamGuard.ts` | 24 h |
| Kontaktanfrage | per SMTP an den Betreiber | im Postfach |
| Lookup-History; Theme und Sprache nur nach Wahl im Menü (#125, #86) | `localStorage` im Browser | bis der Nutzer löscht |

**Keine automatisierte Entscheidungsfindung im Sinne von Art. 22 DSGVO.** Der
Health-Score bewertet die technische Konfiguration einer Domain, nicht eine
Person, und hat keine rechtliche Wirkung für Betroffene.

**Offener Punkt:** Der Datenschutztext nennt Mittwald als Auftragsverarbeiter
nach Art. 28 DSGVO. Der Abschluss eines Auftragsverarbeitungsvertrags ist damit
vorausgesetzt — bitte prüfen, dass er tatsächlich vorliegt. Die Formulierung
behauptet ihn nicht ausdrücklich, die Pflicht besteht aber unabhängig davon.

Anschriften geprüft am 8. September 2026 gegen die jeweiligen Impressen:
Mittwald CM Service GmbH & Co. KG, Königsberger Straße 4–6, 32339 Espelkamp ·
LDI NRW, Kavalleriestraße 2–4, 40213 Düsseldorf.

**Drittlandübermittlung:** Die Checks fragen unter anderem Dienste in den USA
ab (Google PageSpeed, VirusTotal, Cloudflare-DoH, ipwhois.app, rdap.org für
die IP-Details, für WHOIS und Verfügbarkeit die Registries der gängigen gTLDs
und Identity Digital für .io),
für den Propagations-Vergleich außerdem DoH-Resolver in der Schweiz und in
Kanada (siehe „DoH-Resolver“ und „WHOIS und Verfügbarkeit“ unten). Übermittelt wird
dabei die abgefragte Domain bzw. IP-Adresse — die Anfragen gehen vom Server aus,
nicht aus dem Browser des Nutzers, dessen IP erfahren diese Dienste also nicht.
Zu beachten: eine abgefragte Domain kann im Einzelfall selbst personenbezogen
sein (etwa `vorname-nachname.de`). Davon getrennt ist Cloudflare als
Reverse-Proxy (siehe unten): dort kommt jede Besucher-IP an, die Übermittlung
stützt sich auf den Angemessenheitsbeschluss (Art. 45 DSGVO), nicht auf Art. 49.

Nach dem Umstieg auf lokal gehostete Schriften (#13) lädt die Seite beim
Aufruf **nichts** mehr von Dritten. Nachprüfbar: das gebaute `dist/index.html`
und `dist/assets/*.css` enthalten keine Fremd-Host-Referenz. Ausgeliefert wird
sie über Cloudflare (siehe unten); dazu kommen bei Verbindungsfehlern die
NEL-Berichte an `a.nel.cloudflare.com`.

### DoH-Resolver (#132)

Der Propagations-Vergleich fragt jeden Namen gleichzeitig bei neun öffentlichen
Resolvern ab (`server/services/doh.ts`, `DOH_RESOLVERS`). Jeder bekommt den Namen
und den Record-Typ, vom Server aus — die IP des Besuchers erfährt keiner.
DNSSEC und die TTL der Records fragen weiter nur Cloudflare und Google bzw.
Cloudflare. Ein Test (`doh.test.ts`) verlangt, dass jeder Resolver in der
Empfänger-Tabelle von `/datenschutz` und mit seinem Endpunkt hier steht.

Gewählt wurde je Anbieter die Variante **ohne Filter**: Eine Variante, die
Werbung, Malware oder Phishing blockt, antwortet für diese Domains mit 0.0.0.0,
der Adresse einer Sperrseite oder NXDOMAIN und stünde im Vergleich als
„abweichend“ da. Geprüft am 19. Oktober 2026: `doubleclick.net` lieferte beim
bisher genutzten `dns.adguard-dns.com` 0.0.0.0, `internetbadguys.com` bei
`doh.opendns.com` 146.112.61.108 (Sperrseite) — die ungefilterten Varianten
lieferten dieselben Adressen wie alle anderen. `dnssec-failed.org` beantworteten
alle neun mit SERVFAIL: alle validieren DNSSEC.

| Anbieter | Endpunkt | Format | Variante | Betreiber, Sitz | Anycast | Quellen |
|---|---|---|---|---|---|---|
| Cloudflare | `https://cloudflare-dns.com/dns-query` | JSON | 1.1.1.1, ungefiltert | Cloudflare, Inc., USA | ja | [1.1.1.1](https://developers.cloudflare.com/1.1.1.1/), [Datenschutz](https://www.cloudflare.com/privacypolicy/) |
| Google | `https://dns.google/resolve` | JSON | ungefiltert | Google LLC, USA | ja | [JSON-API](https://developers.google.com/speed/public-dns/docs/doh/json), [Datenschutz](https://developers.google.com/speed/public-dns/privacy) |
| AdGuard | `https://unfiltered.adguard-dns.com/resolve` | JSON | „Non-filtering“ (bis #132: Standard mit Werbefilter) | AdGuard Software Ltd., Limassol, Zypern | ja | [Public DNS](https://adguard-dns.io/en/public-dns.html), [Datenschutz](https://adguard-dns.io/en/privacy.html) |
| DNS.SB | `https://doh.dns.sb/dns-query` | JSON | ungefiltert | xTom GmbH, Düsseldorf, Deutschland | ja | [dns.sb](https://dns.sb/), [Datenschutz](https://dns.sb/privacy/) |
| NextDNS | `https://dns.nextdns.io` | JSON | ohne Konfigurations-Id, ungefiltert | NextDNS Inc., USA | nein — per DNS zum nächsten Standort (`steering.nextdns.io`) | [Datenschutz](https://nextdns.io/privacy) |
| Quad9 | `https://dns10.quad9.net/dns-query` | Wire | „Unsecured“ 9.9.9.10: ohne Blockliste, mit DNSSEC | Quad9 (Stiftung), c/o SWITCH, Zürich, Schweiz | ja | [Varianten](https://quad9.net/service/service-addresses-and-features/), [About](https://quad9.net/about/), [Datenschutz](https://quad9.net/privacy/policy/) |
| OpenDNS | `https://doh.sandbox.opendns.com/dns-query` | Wire | „Sandbox“, ohne Filter | Cisco Systems, Inc., San José, USA | ja | [AdGuard-Verzeichnis](https://adguard-dns.io/kb/general/dns-providers/), [Datenschutz](https://www.opendns.com/privacy-policy/) |
| Control D | `https://freedns.controld.com/p0` | Wire | Free DNS „Unfiltered“ (p0) | ControlD Inc., Ontario, Kanada | ja | [Free DNS](https://docs.controld.com/docs/free-dns), [Übersicht](https://controld.com/free-dns), [AGB](https://controld.com/terms) |
| DNS4EU | `https://unfiltered.joindns4.eu/dns-query` | Wire | „Unfiltered“ | Whalebone, s.r.o., Brno, Tschechien | ja | [Für Privatnutzer](https://www.joindns4.eu/for-public), [Start des Dienstes](https://joindns4.eu/learn/dns4eu-public-service-launched), [Wikipedia](https://en.wikipedia.org/wiki/DNS4EU) |

„Format“: JSON-API (`application/dns-json`) oder Wireformat nach RFC 8484
(`application/dns-message`, `server/services/dnsWire.ts`) für Anbieter ohne
JSON-API.

**Was der Vergleich zeigen kann:** Alle Anbieter antworten aus dem
Rechenzentrum, das dem Server am nächsten liegt; diggy läuft in Deutschland.
Zu sehen sind die Caches verschiedener Anbieter an einem Ort, keine weltweite
Verteilung. So steht es auch im Propagation-Tab. Nachgeprüft über
`whoami.akamai.net`, das die Adresse zurückgibt, von der aus ein Resolver beim
autoritativen Server fragt: DNS.SB und OpenDNS fragten aus Frankfurt, Quad9
aus Berlin, NextDNS aus einem Hetzner-Netz in Deutschland. Für wikipedia.org,
das per GeoDNS je nach Standort des Resolvers antwortet, bekamen alle neun
dieselbe Adresse.

**Bewusst nicht dabei:**

- Mullvad — stellt den öffentlichen DoH-Dienst am 2. November 2026 ein
  ([Ankündigung](https://mullvad.net/en/blog/2026/9/3/shutting-down-our-public-encrypted-dns-servers-and-sponsoring-quad9-instead)).
- Wikimedia DNS — laut Betreiber „small-scale beta“ ohne Zusage für
  Verfügbarkeit ([Wikimedia DNS](https://meta.wikimedia.org/wiki/Wikimedia_DNS)).
- Hurricane Electric (`ordns.he.net`) — validiert kein DNSSEC (beantwortete
  `dnssec-failed.org` als einziger), DoH vom Betreiber nicht beschrieben.
- CIRA Canadian Shield — antwortet aus Kanada (rund 400 ms je Abfrage) und
  brachte im Test einen Verbindungsfehler.
- CZ.NIC ODVR (`https://odvr.nic.cz/doh`) — stabil und ungefiltert, fragt aber
  als einziger aus Prag (`odvr-b-04.nic.cz`). Domains mit GeoDNS bekommen dort
  andere Adressen: Von 44 geprüften Namen löste er bei wikipedia.org eine
  „Propagation-Abweichung“ aus, die es mit den übrigen neun nicht gab
  (185.15.58.224 statt 185.15.59.224) — ein Warn-Befund, der 8 Punkte kostet,
  ohne dass etwas zu propagieren war.
- Gefilterte Varianten aller Anbieter (siehe oben).

**Offene Punkte:**

- Schweiz und Kanada: Der Datenschutztext stützt die Übermittlung auf die
  Angemessenheitsbeschlüsse (Art. 45 DSGVO). Der für Kanada gilt für
  Organisationen, die dem PIPEDA unterliegen — für ControlD Inc. als
  Unternehmen naheliegend, rechtlich nicht geprüft.
- OpenDNS Sandbox steht in Verzeichnissen (AdGuard, Wikipedia) und
  antwortet zuverlässig, Cisco beschreibt sie aber nicht auf seinen eigenen
  Seiten. Verschwindet sie, steht OpenDNS als Fehler in der Liste; dann den
  Eintrag entfernen.
- Quad9 setzte im Test aus dem Büronetz rund 40 % der neuen TLS-Verbindungen
  direkt nach dem ClientHello zurück (beide Varianten, IPv4 wie IPv6; andere
  Anbieter nie). `dohQuery` verbindet nach einem Abbruch bis zu dreimal neu;
  damit stand Quad9 in 1 von 20 Checks mit frischen Verbindungen als Fehler da
  (mit nur einem neuen Versuch in 4 von 15). Ob das Rechenzentrum dasselbe
  sieht, zeigt erst der Betrieb.

### WHOIS und Verfügbarkeit (#105)

WHOIS-Report und Verfügbarkeits-Check fragen die Registry der Endung direkt
(`server/services/registry.ts`). Welche das ist, steht im RDAP-Bootstrap der
IANA (`https://data.iana.org/rdap/dns.json`, RFC 9224), den der Server beim
ersten Bedarf lädt und 24 Stunden im Speicher hält
(`server/lib/rdapBootstrap.ts`). Den Abruf der Liste sieht data.iana.org
(ICANN, USA, über Cloudflare); er enthält nichts über eine Abfrage. Jede
Registry bekommt die abgefragte Domain, vom Server aus. Bis #105 ging fast
alles über rdap.org, das pro IP drosselt.

| Endung | Weg | Endpunkt | Betreiber, Sitz | Quelle |
|---|---|---|---|---|
| laut Bootstrap (rund 1 200) | RDAP | Basis-URL aus dem Bootstrap, nur `https:` | je nach Endung; für die Vorschläge des Verfügbarkeits-Checks Verisign (.com, .net), Public Interest Registry (.org), Google Registry (.app, .dev), alle USA | Bootstrap |
| .de | RDAP | `https://rdap.denic.de/` | DENIC eG, Frankfurt am Main, Deutschland | [Impressum](https://www.denic.de/impressum) |
| .io | RDAP, Rückfall WHOIS | `https://rdap.identitydigital.services/rdap/`, `whois.nic.io` | Identity Digital Inc., Bellevue (Washington), USA — betreibt die Registry-Technik für .io | [Wikipedia](https://en.wikipedia.org/wiki/Identity_Digital), Nutzungsbedingungen in der WHOIS-Antwort |
| .at | WHOIS (Port 43) | `whois.nic.at` | nic.at GmbH, Salzburg, Österreich | [Impressum](https://www.nic.at/de/impressum) |
| .it | WHOIS (Port 43) | `whois.nic.it` | Registro .it, Istituto di Informatica e Telematica del CNR, Pisa, Italien | [nic.it](https://www.nic.it/en/about-us) |
| .eu | WHOIS (Port 43) | `whois.eu` | EURid vzw, Diegem, Belgien | [eurid.eu](https://eurid.eu/en/) |
| .ch | keine Abfrage | Hinweis auf `https://www.nic.ch/whois/` in der WHOIS-Ansicht | — | whois.nic.ch: „Requests of this client are not permitted“ |
| sonst ohne Eintrag (.co, .me, .li …) | keine Abfrage | — | — | rdap.org antwortet dort ebenfalls 404 (geprüft für .co, .me, .ch, .at) |
| alle ohne feste Registry, solange der Bootstrap nicht ladbar ist | RDAP | `https://rdap.org/`, für .com/.net `https://rdap.verisign.com/` | rdap.org: Gavin Brown (privat), gehostet bei Fly.io hinter Cloudflare, beide USA | [about.rdap.org](https://about.rdap.org/), Antwort-Header `via: fly.io`, `server: cloudflare` |

Unabhängig vom Bootstrap fragen die IP-Details (`server/services/ipDetails.ts`)
weiter `https://rdap.org/ip/…`; rdap.org bleibt deshalb Empfänger in
`/datenschutz`.

Stand der Tabelle: 20. Oktober 2026. Ein Test (`registry.test.ts`) verlangt,
dass jede feste Registry in der Empfänger-Tabelle von `/datenschutz` und mit
ihrem Endpunkt hier steht.

**Was ausgewertet wird:** Registrierung, Ablauf, letzte Änderung, Status,
Registrar (ein Unternehmen), Nameserver, DNSSEC. Die WHOIS-Antworten von .at
und .it enthalten auch Inhaber und Kontakte (Namen, Anschrift, Telefon,
E-Mail); die Parser in `server/services/whoisText.ts` lesen nur den
Domain-Block bzw. die Abschnitte „Registrar“ und „Nameservers“ und
überspringen die Kontaktblöcke. Nichts davon wird gespeichert, ausgegeben oder
geloggt; das Log nennt nur Host, Domain und Grund (bei einer Sperre das
Stichwort).

**Grenzen:** Weiterleitungen von RDAP-Diensten nur auf `https:` ohne eigenen
Port, höchstens drei, und mit Bootstrap nur auf dessen Hosts und die festen
Registries (`fetchRdap` in `server/lib/rdap.ts`). Ohne Bootstrap kennt nur
rdap.org das Ziel; dann nur auf Namen (keine IP-Literale), die ausschließlich
auf öffentliche Adressen zeigen (`server/services/registry.ts`). Port 43 nur zu den festen Hosts oben,
die Abfrage ist eine geprüfte Domain plus CRLF, Timeout 3 s für den Aufbau und
5 s (Report) bzw. 6 s (Verfügbarkeit) insgesamt, höchstens 64 KiB Antwort
(`server/lib/whoisPort43.ts`).

**Offene Punkte:**

- Port 43 ausgehend aus dem mittwald-Container ist nicht zugesagt. Prüfen
  nach dem Deploy mit `scripts/check-whois-live.mjs` (docs/DEPLOYMENT.md).
  Ist er gesperrt, zeigen .at, .it und .eu „nicht verfügbar“ bzw. „unklar“,
  .io bleibt über RDAP erreichbar.
- Die Zeiten von nic.at und Registro .it tragen keine Zone; angenommen ist
  die Ortszeit (Europe/Vienna bzw. Europe/Rome).
- Die Nutzungsbedingungen von nic.at, EURid und Identity Digital verbieten
  automatisierte Massenabfragen. diggy fragt je Nutzereingabe eine Domain und
  hält das Ergebnis 60 s im Cache; wie streng die Registries über Port 43
  drosseln, ist nicht bekannt.
- Art. 49 Abs. 1 lit. b DSGVO auch für Registries in Drittländern ohne
  Angemessenheitsbeschluss (je nach Endung) — wie bei Zielserver und
  Nameservern rechtlich nicht geprüft.

### Autoritative Nameserver (#133)

Im Propagation-Tab fragt der Server die Nameserver der Zone direkt über DNS
(Port 53, UDP, bei gekürzter Antwort TCP; `server/services/authoritative.ts`,
`dnsPort53.ts`). Welche das sind, steht in den NS-Records der Domain — der
Inhaber bestimmt sie, sie können überall stehen. Übermittelt werden der Name
und der Record-Typ, vom Server aus. Zone und Adressen der Nameserver ermittelt
der Server über Cloudflare-DoH (Google, falls Cloudflare ausfällt), nicht über
den Resolver des Containers. In der Empfänger-Tabelle von `/datenschutz` als
„Die Nameserver der abgefragten Domain“, Sitz „je nach Domain“ — wie „Der
Zielserver selbst“ bei TLS und Tech-Stack.

Gefragt wird nur, wenn der Tab offen ist; der Report lädt nichts davon. Nur
öffentliche Adressen (dieselbe Liste wie `safeTarget.ts`), höchstens acht, je
Adresse zwei Fragen, je Ziel-Adresse höchstens 120 Fragen pro Minute über
alle Nutzer, höchstens acht Prüfungen zugleich (belegt, bis sie fertig sind —
auch wenn der Client abbricht); die Route hat ein eigenes Rate-Limit (30/min
je IP).

**Offener Punkt:** In Produktion (Container bei mittwald hinter Cloudflare)
ist ausgehendes DNS über Port 53 nicht zugesagt. Ist es gesperrt, zeigt der
Tab „nicht prüfbar“, und es geht nichts nach außen außer den DoH-Abfragen.
Hat der Container kein IPv6 (keine Schnittstelle mit IPv6-Adresse außer
Loopback und Link-local), fragt der Server nur die IPv4-Adressen der
Nameserver und sagt das im Tab — eine Aussage über diggy, nicht über die
Domain.

### Cloudflare vor der Seite (#125)

diggydns.cloud läuft über Cloudflare als Reverse-Proxy/CDN (Antwort-Header
`server: cloudflare`, `cf-ray … FRA`). Cloudflare nimmt die TLS-Verbindung
entgegen und sieht damit jede Besucher-IP, die Verbindungsdaten und die Inhalte
der Anfragen (Suchbegriffe, Kontaktformular). Das steht nicht im Code, sondern
in der DNS-Konfiguration der Domain — wer den Proxy abschaltet oder den Anbieter
wechselt, muss `/datenschutz` mitziehen.

Angaben im Datenschutztext, geprüft am 19. Oktober 2026:

| Angabe | Quelle |
|---|---|
| Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA | [Datenschutzrichtlinie](https://www.cloudflare.com/privacypolicy/) (gültig ab 4. November 2025), [Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/), [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| Cloudflare ist Auftragsverarbeiter für Customer Logs und die durchgeleiteten Inhalte, im Übrigen nach eigener Aussage Verantwortlicher | Datenschutzrichtlinie; DPA |
| Zertifiziert nach EU-U.S. DPF, UK Extension und Swiss-U.S. DPF, Nicht-HR-Daten abgedeckt; Status „Active - Re-certification under Review“ | [Eintrag auf dataprivacyframework.gov](https://www.dataprivacyframework.gov/participant/5666) |
| Angemessenheitsbeschluss vom 10. Juli 2023 für Organisationen im EU-U.S. DPF | [EU-Kommission, Adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en) |
| Entfällt die Zertifizierung, stützt sich Cloudflare auf Standardvertragsklauseln | Datenschutzrichtlinie |
| Speicherdauer: keine festen Fristen, „consistent with the business purposes“ oder für gesetzliche Pflichten | Datenschutzrichtlinie |
| Network Error Logging: Fehlerberichte an `a.nel.cloudflare.com`, Client-IP nur für die Dauer der Anfrage, für die Zone abschaltbar | [Cloudflare-Doku zu NEL](https://developers.cloudflare.com/network-error-logging/) |
| Keine Cookies | eigene Prüfung: kein `Set-Cookie` auf `/`, `/datenschutz`, `/lookup/…`, `/api/health` |

**Cookies hängen an der Cloudflare-Konfiguration.** Cloudflare setzt laut
[Cookie-Liste](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)
`__cf_bm` bei Bot Fight Mode oder Bot Management, `cf_clearance` bei
JavaScript-Erkennung und Challenges, weitere bei Rate Limiting, Waiting Room
oder Always Online. Wird eines davon eingeschaltet, stimmt „Cookies setzt die
Seite nicht, auch nicht über Cloudflare“ nicht mehr.

**Network Error Logging.** Cloudflare schickt die Header `NEL` und `Report-To`
mit (`success_fraction` 0, `max_age` 7 Tage). Der Browser hinterlegt daraufhin
eine Richtlinie und meldet fehlgeschlagene Verbindungen an
`a.nel.cloudflare.com` — die einzige Verbindung, die der Browser ohne Klick zu
einem anderen Host als diggydns.cloud aufbaut. Ob die hinterlegte Richtlinie
unter § 25 TDDDG fällt, ist rechtlich nicht geprüft. Abschalten lässt sich NEL
laut Cloudflare per Schalter im Dashboard oder über die API
(`PATCH /zones/{zone_id}/settings/nel`); dann entfällt auch der Absatz dazu in
`/datenschutz`.

**Für die rechtliche Prüfung (#36):** Aus dem Verkehr leitet Cloudflare
„Network Data“ ab — laut Datenschutzrichtlinie etwa Fehlerraten, Anfragevolumen
und IP-Bedrohungswerte, gespeichert unter anderem, um Angriffe zu erkennen.
Sie gehören nicht zu den Daten, für die sich Cloudflare dort als
Auftragsverarbeiter einordnet. Der Datenschutztext beschreibt nur die
Auftragsverarbeitung; ob diese eigene Verarbeitung dort erwähnt werden muss,
ist nicht geprüft.

**Offener Punkt:** Der Datenschutztext nennt Cloudflare als Auftragsverarbeiter
nach Art. 28 DSGVO. Ob ein Auftragsverarbeitungsvertrag für das Konto vorliegt,
unter dem diggydns.cloud läuft, ist nicht geprüft. Laut Cloudflare ist das DPA
per Verweis Teil des Self-Serve Subscription Agreement, das auch kostenlose
Dienste umfasst ([Trust Hub](https://www.cloudflare.com/trust-hub/gdpr/),
[Terms](https://www.cloudflare.com/terms/)). Bitte prüfen, dass das Konto
diesem Vertrag unterliegt — oder einem eigenen mit DPA —, und die geltende
Fassung (Version 6.4 vom 3. April 2026) ablegen. Die Formulierung behauptet
keinen Abschluss, die Pflicht besteht aber unabhängig davon. Der DPF-Status ist
regelmäßig nachzuprüfen.
