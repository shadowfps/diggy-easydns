# Entwicklung

Wie man diggy lokal startet, konfiguriert und testet — und was der Server tut,
damit ein öffentliches Lookup-Tool nicht selbst zum Werkzeug wird. Was diggy
kann, steht in der [README](../README.md); wie es ausgerollt wird, in
[DEPLOYMENT.md](DEPLOYMENT.md).

Weitere Dokumente in diesem Ordner:

- [DESIGN.md](DESIGN.md) — Designregeln (Tokens, Komponenten, Bewegung, Texte)
- [I18N.md](I18N.md) — Übersetzung: Aufbau, neue Texte, Findings
- [E2E.md](E2E.md) — Browser-Tests, Referenzbilder aktualisieren
- [COMPLIANCE.md](COMPLIANCE.md) — Speicherdauern, Rechtsgrundlagen, AI-Act-Prüfung

## Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Motion, GSAP |
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
| `PUBLIC_ORIGIN` | Öffentliche Origin der Installation (z. B. `https://diggy.example`). Vertrauenswürdige Referenz für die CSRF-Prüfung des Kontaktformulars und Basis der absoluten URLs in der Link-Vorschau von Permalinks (`og:url`, `og:image`) — ohne sie fallen beide auf den `Host`-Header zurück. |
| `CORS_ORIGINS` | Optional — komma-separierte Origins, die per CORS zugreifen dürfen. Leer lassen, wenn Frontend und API unter derselben Origin laufen (Standard). |
| `PORT` | Backend-Port (Standard: `3001`) |

Secret generieren (WSL/Linux):

```bash
openssl rand -base64 32
```

Das Kontaktformular ist deaktiviert, solange SMTP nicht konfiguriert ist. Anti-Spam: Honeypot, Timing-Token, Rate-Limits, Inhaltsfilter.

### Rate-Limits

Die API ist IP-basiert begrenzt: 120 Requests/Minute allgemein, 10/Stunde je Fremd-API-Provider (PageSpeed, VirusTotal — getrennte Zähler), 20/Minute für den Verfügbarkeits-Check. Dazu ein Concurrency-Deckel von 4 für die langlaufenden Checks. `/api/health` liegt bewusst vor dem Limiter, damit fremder Traffic den Container-Healthcheck nicht auf `unhealthy` dreht.

## Prüfen und testen

```bash
npm run lint        # ESLint 9 (Flat Config, inkl. react-hooks)
npm run i18n        # deutsche Texte, die nicht durchs Übersetzungsmodul laufen
npm run typecheck   # tsc für Client und Server
npm test            # Vitest — Parsing-, Scoring- und Guard-Logik
npm run verify      # alles zusammen, so wie die CI es fährt
npm run e2e         # Browser-Tests gegen den Build (vorher npm run build)
npm run e2e:docker  # dasselbe im Playwright-Image, inkl. Pixelvergleich
```

Die Browser-Tests (`e2e/`, Playwright) prüfen jede wichtige Ansicht hell/dunkel
bei 390 und 1440 px auf seitliches Überlaufen und vergleichen Startseite und
Report mit Referenzbildern. Wie man sie startet und die Referenzbilder
aktualisiert, steht in [docs/E2E.md](docs/E2E.md).

Die Testsuite läuft in zwei Umgebungen (`vitest.workspace.ts`):

- **server** (`node`) — die reine Logik, die der Nutzer als „Diggy sagt" liest:
  Domain-Validierung und Apex-Auflösung, SPF-Lookup-Zählung nach
  RFC 7208 §4.6.4, DoH-TXT-Zusammenbau, IP-Klassifizierung des SSRF-Guards,
  Cache-Verhalten, Score-Aggregation und die Token-Prüfung des
  Kontaktformulars. Dazu ein Integrationstest gegen eine echte Express-App,
  der prüft, dass das Rate-Limit hinter einem Reverse-Proxy nicht per
  `X-Forwarded-For` umgehbar ist.
- **client** (`jsdom`) — Routing samt Zurück-Button, Tab-Semantik und
  Tastatur-Bedienung, die Zustandsübergänge des Kontaktformulars, Error
  Boundaries, Focus-Trap und das Verhalten bei `prefers-reduced-motion`.

Geschrieben wurden die Frontend-Tests entlang der Pfade, auf denen schon
einmal ein Defekt saß — nicht nach Abdeckungsquote. `src/test/setup.ts`
dokumentiert, welche Browser-APIs jsdom fehlen und warum sie dort ergänzt
werden.

Jeder Push auf `main` und jeder Pull Request läuft durch den `verify`-Job und
parallel durch den `e2e`-Job; Image-Build und Deploy folgen nur auf `main` und
warten allein auf `verify`. Ein zweiter, **nicht
blockierender** `audit`-Job hält den Zustand der Abhängigkeiten sichtbar, ohne
dass ein neu veröffentlichter Advisory einen bis dahin grünen Build rot macht —
die eigentliche Arbeit macht Dependabot (`.github/dependabot.yml`).

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

## Routen

| Pfad | Beschreibung |
|---|---|
| `/` | DNS-Lookup |
| `/lookup/<domain>` | Permalink zu einem Lookup |
| `/compare/<a>/<b>` | Zwei Domains vergleichen |
| `/history` | Lookup-Verlauf |
| `/availability` | Domain-Verfügbarkeit |
| `/about` | Info-Seite |
| `/impressum` | Impressum & Kontaktformular |
| `/datenschutz` | Datenschutzhinweise |

## Projekt-Struktur

```
diggy/
├── docs/
│   ├── COMPLIANCE.md       # Speicherdauern, Rechtsgrundlagen, AI-Act-Prüfung
│   ├── DEPLOYMENT.md       # Container, CI, Rollout nach diggydns.cloud
│   ├── DEVELOPMENT.md      # Lokales Setup, Konfiguration, Tests, Sicherheit
│   ├── DESIGN.md           # Designregeln
│   ├── E2E.md              # Browser-Tests, Referenzbilder aktualisieren
│   ├── images/             # Screenshots für die README
│   └── I18N.md             # Übersetzung: Aufbau, neue Texte, Findings
├── e2e/                    # Playwright: Überlauf-Check, Pixelvergleich, Testdaten
├── shared/
│   ├── scoring.ts          # Health-Score — geteilt, damit Server und Client
│   │                       # garantiert dasselbe rechnen
│   ├── textKeys.ts         # Kennungen der Findings und Fehlercodes (Übersetzung)
│   └── types/              # Gemeinsame TypeScript-Typen
├── src/
│   ├── components/         # Wiederverwendbare UI-Bausteine, Error Boundaries
│   ├── modules/            # Feature-Module (Lookup, History, Availability, …)
│   ├── lib/                # API-Client, History, Routing-Helfer, Utilities
│   ├── hooks/              # Theme, progressiver Lookup, Reduced-Motion, Focus-Trap
│   ├── i18n/               # Übersetzungsmodul, deutsche Quelle, englisches Wörterbuch
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
