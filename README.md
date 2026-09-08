# Diggy

> DNS made friendly — DNS, SSL & Domain-Audits auf einen Blick.

Diggy ist ein webbasiertes DNS-Audit-Tool. Domain eingeben, fertig: Records, Mail-Security, SSL-Status, Propagation, WHOIS und PageSpeed-Score landen übersichtlich auf einem Screen — mit Health-Score und konkreten Empfehlungen.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)

## Features

### DNS-Audit

- **DNS Records** — A, AAAA, MX, NS, TXT, CAA, SOA, CNAME auf einen Blick
- **Subdomains** — Lookups für `www.` und andere Subdomains (Mail/WHOIS/DNSSEC über Apex)
- **IP-Owner** — Anzeige des Netz-Betreibers hinter A/AAAA-Records
- **Health-Score** — automatisch berechnet aus Findings und Konfigurationslücken
- **Findings & Empfehlungen** — konkrete Hinweise zu fehlenden oder fehlerhaften Einträgen
- **Mail Security** — SPF, DKIM (Selector-Scan), DMARC, MTA-STS
- **SSL / TLS** — Zertifikats-Details, Ablaufdatum, Chain-Check
- **DNSSEC** — Validierungsstatus
- **Propagation** — Vergleich über mehrere DNS-over-HTTPS-Resolver weltweit
- **WHOIS / RDAP** — Registrar-Infos, Ablaufdatum der Domain
- **Tech-Stack** — erkannte Technologien der Website
- **PageSpeed** — Google Lighthouse Score (Mobile & Desktop)
- **VirusTotal** — Domain-Reputation und Engine-Ergebnisse

### Weitere Funktionen

- **IP-Lookup / Reverse DNS** — reine IP-Adresse (IPv4/IPv6) eingeben und PTR-Record, ASN, Netz & Geolocation abrufen
- **Available Check** — Domain-Verfügbarkeit prüfen (RDAP, u. a. `.de`, `.com`, `.net`)
- **Lookup-History** — zuletzt abgefragte Domains (lokal im Browser)
- **Permalinks** — direkt verlinkbare Ergebnisseiten (`/lookup/<domain>`)
- **JSON-Export** — vollständigen Report als Datei herunterladen
- **Kontaktformular** — auf der Impressum-Seite, mit SMTP-Versand und Auto-Reply
- **Dark Mode** — systembasiert, manuell umschaltbar

## Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, GSAP |
| Backend | Node.js, Express, TypeScript, Nodemailer |
| DNS | Native Node.js `dns` + DNS-over-HTTPS (DoH) |

## Quickstart

```bash
# Abhängigkeiten installieren
npm install

# Umgebungsvariablen anlegen
cp .env.example .env
# Keys und SMTP-Daten eintragen (siehe Konfiguration)

# Dev-Server starten (Frontend + Backend gleichzeitig)
npm run dev
# Frontend → http://localhost:5173
# Backend  → http://localhost:3001

# Nur Frontend
npm run dev:client

# Nur Backend
npm run dev:server

# Production-Build
npm run build

# Production-Server starten (liefert Frontend aus dist/)
npm start
```

## Konfiguration

Alle Secrets gehören in `.env` (liegt in `.gitignore`). Vorlage: `.env.example`.

| Variable | Beschreibung |
|---|---|
| `PAGESPEED_API_KEY` | Optional — Google PageSpeed Insights API |
| `VIRUS_TOTAL_API_KEY` | Optional — VirusTotal API |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | SMTP für das Kontaktformular |
| `CONTACT_TO` | Empfänger der Kontaktanfragen |
| `CONTACT_FROM` | Absender (Admin-Mail + Bestätigung an Nutzer) |
| `CONTACT_FORM_SECRET` | Geheimer Schlüssel für Anti-Spam-Token. **In Produktion Pflicht** (mind. 32 Zeichen) — ohne ihn startet der Server nicht, sobald SMTP konfiguriert ist. |
| `TRUST_PROXY` | Anzahl vertrauenswürdiger Proxy-Hops (`true` = 1) für korrektes IP-Rate-Limiting. **Nur setzen, wenn tatsächlich ein Proxy davor liegt** — sonst kann sich jeder per `X-Forwarded-For` einen frischen Zähler holen. |
| `PUBLIC_ORIGIN` | Öffentliche Origin der Installation (z. B. `https://diggy.example`). Vertrauenswürdige Referenz für die CSRF-Prüfung des Kontaktformulars — ohne sie fällt die Prüfung auf den `Host`-Header zurück. |
| `CORS_ORIGINS` | Optional — komma-separierte Origins, die per CORS zugreifen dürfen. Leer lassen, wenn Frontend und API unter derselben Origin laufen (Standard). |
| `PORT` | Backend-Port (Standard: `3001`) |

Secret generieren (WSL/Linux):

```bash
openssl rand -base64 32
```

Das Kontaktformular ist deaktiviert, solange SMTP nicht konfiguriert ist. Anti-Spam: Honeypot, Timing-Token, Rate-Limits, Inhaltsfilter.

### Rate-Limits

Die API ist IP-basiert begrenzt: 120 Requests/Minute allgemein, 10/Stunde je Fremd-API-Provider (PageSpeed, VirusTotal — getrennte Zähler), 20/Minute für den Verfügbarkeits-Check. Dazu ein Concurrency-Deckel von 4 für die langlaufenden Checks. `/api/health` liegt bewusst vor dem Limiter, damit fremder Traffic den Container-Healthcheck nicht auf `unhealthy` dreht.

## Entwicklung

```bash
npm run lint        # ESLint 9 (Flat Config, inkl. react-hooks)
npm run typecheck   # tsc für Client und Server
npm test            # Vitest — Parsing-, Scoring- und Guard-Logik
npm run verify      # alle drei, so wie die CI es fährt
```

Die Tests decken bewusst die reine Logik ab, die der Nutzer als „Diggy sagt"
liest: Domain-Validierung und Apex-Auflösung, SPF-Lookup-Zählung nach
RFC 7208 §4.6.4, DoH-TXT-Zusammenbau, IP-Klassifizierung des SSRF-Guards,
Cache-Verhalten und die Token-Prüfung des Kontaktformulars.

Jeder Push auf `main` läuft zuerst durch den `verify`-Job; erst danach werden
Image-Build und Deploy angestoßen.

## Container & Deployment

Das Production-Image enthält Frontend und API in einem nicht privilegierten Node.js-Prozess. Es lauscht standardmäßig auf Port `3001` und stellt unter `/api/health` einen Healthcheck bereit.

Lokal bauen und starten:

```bash
docker build -t diggy:local .
docker run --rm -p 3001:3001 --env-file .env diggy:local
```

Bei jedem Push auf `main` veröffentlicht GitHub Actions das Image als:

```text
ghcr.io/shadowfps/diggy-easydns:latest
```

Anschließend wird der Mittwald-Stack automatisch per `mw stack deploy` aktualisiert.
Das Image wird dabei **per Digest** referenziert (`DIGGY_IMAGE`), nicht per
`:latest`.

Das ist keine Kosmetik: `mw stack deploy` vergleicht die Compose-*Definition*.
Mit einem festen `:latest` änderte sich die nicht, der Deploy meldete
`No services were restarted` — und der Container lief weiter mit dem alten
Image. Grüner Deploy, alter Code. Der Digest ändert sich bei jedem Build und
erzwingt den Restart; außerdem ist ein Rollback damit einfach ein Deploy mit
dem vorherigen Digest. Die Runtime-Umgebung wird dabei aus GitHub-Secrets in die `${…}`-Platzhalter von `compose.mittwald.yml` interpoliert. Dafür müssen im Repository unter **Settings → Secrets and variables → Actions** folgende **Repository-Secrets** hinterlegt sein:

- `MITTWALD_API_TOKEN` — gültiges mStudio-API-Token
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- Kontakt: `CONTACT_TO`, `CONTACT_FROM`, `CONTACT_FORM_SECRET`
- Optional: `PAGESPEED_API_KEY`, `VIRUS_TOTAL_API_KEY`

Fehlt eines der SMTP-/Kontakt-Secrets, bricht der Deploy bewusst ab, statt die Stack-Env leer zu überschreiben.

Versions-Tags wie `v0.3.0` erzeugen zusätzlich ein gleichnamiges, unveränderliches Image-Tag. Für mittwald liegt mit `compose.mittwald.yml` eine Stack-Konfiguration bereit. Zielumgebung:

- Projekt: `p-nmi5ji`
- Container-Stack: `86540922-d203-4150-8776-9cc4e22352bd`
- Container-Port: `3001/tcp`

Für manuelles Deployment zuerst prüfen, ob der Ziel-Stack weitere Services enthält, da nicht in der Compose-Datei enthaltene Services beim Stack-Abgleich entfernt werden können:

```bash
mw stack ps --stack-id 86540922-d203-4150-8776-9cc4e22352bd --output json
# DIGGY_IMAGE muss gesetzt sein, sonst fällt die Compose auf :latest zurück
# und der Rollout bleibt aus. Digest oder Versions-Tag verwenden:
export DIGGY_IMAGE=ghcr.io/shadowfps/diggy-easydns:v0.3.0

mw stack deploy --stack-id 86540922-d203-4150-8776-9cc4e22352bd --compose-file compose.mittwald.yml --env-file .env
```

Beim manuellen Deploy liefert die lokale `.env` die Werte für die `${…}`-Platzhalter in `compose.mittwald.yml` (im CI übernehmen das die GitHub-Secrets). Die Runtime-Secrets gehören nicht ins Image. Da das Repository öffentlich ist, kann auch das GHCR-Package öffentlich betrieben werden; für ein privates Package müssen im mittwald-Projekt Zugangsdaten am bereits vorhandenen `ghcr.io`-Registry-Eintrag hinterlegt werden.

## Sicherheit

Was der Server tut, damit ein öffentlich erreichbares Lookup-Tool nicht selbst
zum Werkzeug wird:

| Schutz | Wo |
|---|---|
| **SSRF-Guard** — jedes nutzergewählte Ziel wird gegen eine Blockliste nicht-öffentlicher IP-Bereiche geprüft (IPv4 + IPv6 inkl. Transitions-Präfixe) und die Verbindung per `lookup`-Option auf die geprüften Adressen gepinnt. Ohne Pinning bliebe zwischen Prüfung und Connect ein DNS-Rebinding-Fenster. Redirects werden selbst verfolgt, jeder Hop neu geprüft. | `server/lib/safeTarget.ts` |
| **Rate-Limits** — isolierte Zähler je Limiter, dazu ein Concurrency-Deckel für die langlaufenden Checks. `/api/health` liegt bewusst davor. | `server/lib/rateLimit.ts` |
| **Security-Header** — CSP ohne Fremd-Hosts, HSTS, `nosniff`, `strict-origin-when-cross-origin`, `frame-ancestors 'none'`. Der SHA-256 des Inline-Theme-Scripts wird beim Start aus dem gebauten HTML abgeleitet, damit `script-src 'self'` bleiben kann. | `server/index.ts` |
| **CSRF** — Origin-Prüfung gegen `PUBLIC_ORIGIN` für den schreibenden Endpoint, `Sec-Fetch-Site`-Riegel für die Endpoints mit Fremd-API-Kontingent. | `server/index.ts` |
| **Anti-Spam** — Honeypot, signiertes Timing-Token mit Nonce und Einmalverwendung, IP-Limits, Duplikat-Erkennung, Inhaltsfilter, ein Auto-Reply pro Empfänger und Tag. | `server/services/contactSpamGuard.ts` |
| **Graceful Shutdown** — Health auf 503, Drain-Fenster, dann `server.close()`. Request-Timeouts gegen Slowloris. | `server/index.ts` |

Zwei Konfigurationswerte sind in Produktion Pflicht: `CONTACT_FORM_SECRET`
(mindestens 32 Zeichen) und `CONTACT_TO`. Fehlt eines, startet der Server
bewusst nicht, statt mit unsicherem Fallback zu laufen.

`TRUST_PROXY` nur setzen, wenn tatsächlich ein Reverse-Proxy davor liegt —
sonst kann sich jeder per `X-Forwarded-For` einen frischen Rate-Limit-Zähler
holen.

## Recht & Compliance

`docs/COMPLIANCE.md` hält die technische Einordnung fest: Speicherdauern und
Rechtsgrundlagen je Verarbeitung, sowie die Prüfung gegen den EU AI Act.

Kurzfassung zum AI Act: **Diggy ist kein KI-System im Sinne von Art. 3 Nr. 1
VO (EU) 2024/1689.** Alle Ausgaben — Health-Score, Findings,
Tech-Stack-Erkennung, Mail-Bewertung — entstehen aus fest programmierten
Regeln. Es gibt kein Modell, keine Inferenz und keine Anpassung nach der
Inbetriebnahme; Erwägungsgrund 12 nimmt solche Systeme ausdrücklich aus. Es
bestehen daher keine Pflichten aus der Verordnung. Sollte später ein
LLM-Feature dazukommen, ist die Einordnung neu zu prüfen — die Datei nennt die
Auslöser.

Der Datenschutztext unter `/datenschutz` ist aus dem Code abgeleitet und
technisch korrekt, aber **nicht juristisch geprüft**.

## Routen

| Pfad | Beschreibung |
|---|---|
| `/` | DNS-Lookup |
| `/lookup/<domain>` | Permalink zu einem Lookup |
| `/history` | Lookup-Verlauf |
| `/availability` | Domain-Verfügbarkeit |
| `/about` | Info-Seite |
| `/impressum` | Impressum & Kontaktformular |
| `/datenschutz` | Datenschutzhinweise |

## Projekt-Struktur

```
diggy/
├── docs/
│   └── COMPLIANCE.md       # Speicherdauern, Rechtsgrundlagen, AI-Act-Prüfung
├── shared/
│   ├── scoring.ts          # Health-Score — geteilt, damit Server und Client
│   │                       # garantiert dasselbe rechnen
│   └── types/              # Gemeinsame TypeScript-Typen
├── src/
│   ├── components/         # Wiederverwendbare UI-Bausteine, Error Boundaries
│   ├── modules/            # Feature-Module (Lookup, History, Availability, …)
│   ├── lib/                # API-Client, History, Routing-Helfer, Utilities
│   ├── hooks/              # Theme, progressiver Lookup, Reduced-Motion, Focus-Trap
│   └── types/              # Re-Exports
└── server/
    ├── index.ts            # Express-App, Middleware-Kette & API-Routen
    ├── lib/                # Cache, Rate-Limiting, SSRF-Guard
    └── services/           # DNS, SSL, Mail-Audit, Kontakt, …
```

Tests liegen neben dem geprüften Code (`*.test.ts`).

## API (Auszug)

| Endpoint | Beschreibung |
|---|---|
| `GET /api/lookup?domain=` | Vollständiger DNS-Audit-Report |
| `GET /api/domain-check?q=` | Domain-Verfügbarkeit |
| `GET /api/pagespeed?domain=` | PageSpeed-Analyse |
| `GET /api/virusscan?domain=` | VirusTotal-Scan |
| `GET /api/ip-details?ip=` | IP-Geolocation & ASN |
| `POST /api/contact` | Kontaktformular absenden |
| `GET /api/contact/challenge` | Anti-Spam-Token für Formular |

## Roadmap

- [x] DNS-Queries (A/AAAA/MX/NS/TXT/CAA/SOA/CNAME)
- [x] Subdomain-Lookups & Apex-Auflösung für Mail/WHOIS
- [x] Domain-Validierung & Normalisierung
- [x] Health-Score aus Findings
- [x] Mail-Security-Audit (SPF, DKIM, DMARC, MTA-STS)
- [x] SSL/TLS-Check
- [x] WHOIS/RDAP-Lookup
- [x] PageSpeed-Integration
- [x] VirusTotal-Integration
- [x] Tech-Stack-Erkennung
- [x] Multi-Resolver-Propagation via DNS-over-HTTPS
- [x] Domain-Verfügbarkeits-Check
- [x] IP-Lookup mit Reverse DNS (PTR) direkt über die Suche
- [x] Permalinks & JSON-Export
- [x] Lookup-History (Browser-lokal)
- [x] Impressum & Kontaktformular (SMTP, Auto-Reply, Anti-Spam)
- [x] Response-Caching im Backend (TTL pro Check, In-Flight-Dedup)
- [x] Datenschutzhinweise & lokal gehostete Schriften
- [x] Härtung: SSRF-Guard mit IP-Pinning, Rate-Limits, CSP/HSTS, CSRF-Riegel
- [x] Tests, ESLint, Typecheck und ein verify-Gate in der CI
- [ ] DNSSEC-Chain-Validierung (vertieft)
- [ ] Watch/Monitor-Feature (Domain-Änderungen per E-Mail)

## Mitmachen

Pull Requests und Issues sind willkommen. Für größere Änderungen bitte vorher ein Issue öffnen.

## Lizenz

MIT
