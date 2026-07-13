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
| `CONTACT_FORM_SECRET` | Geheimer Schlüssel für Anti-Spam-Token (in Produktion setzen) |
| `TRUST_PROXY` | `true` hinter Reverse-Proxy (nginx, Caddy) für korrektes IP-Rate-Limiting |
| `PORT` | Backend-Port (Standard: `3001`) |

Secret generieren (WSL/Linux):

```bash
openssl rand -base64 32
```

Das Kontaktformular ist deaktiviert, solange SMTP nicht konfiguriert ist. Anti-Spam: Honeypot, Timing-Token, Rate-Limits, Inhaltsfilter.

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

Anschließend wird der Mittwald-Stack automatisch per `mw stack deploy` aktualisiert. Dafür muss im Repository unter **Settings → Secrets and variables → Actions** ein Secret `MITTWALD_API_TOKEN` mit einem gültigen mStudio-API-Token hinterlegt sein.

Versions-Tags wie `v0.3.0` erzeugen zusätzlich ein gleichnamiges, unveränderliches Image-Tag. Für mittwald liegt mit `compose.mittwald.yml` eine Stack-Konfiguration bereit. Zielumgebung:

- Projekt: `p-nmi5ji`
- Container-Stack: `86540922-d203-4150-8776-9cc4e22352bd`
- Container-Port: `3001/tcp`

Für manuelles Deployment zuerst prüfen, ob der Ziel-Stack weitere Services enthält, da nicht in der Compose-Datei enthaltene Services beim Stack-Abgleich entfernt werden können:

```bash
mw stack ps --stack-id 86540922-d203-4150-8776-9cc4e22352bd --output json
mw stack deploy --stack-id 86540922-d203-4150-8776-9cc4e22352bd --compose-file compose.mittwald.yml --env-file mittwald.env.example
```

Optionale API-Keys und SMTP-Zugangsdaten werden als Umgebungsvariablen bzw. Secrets direkt am mittwald-Container gepflegt und gehören nicht ins Image. Da das Repository öffentlich ist, kann auch das GHCR-Package öffentlich betrieben werden; für ein privates Package müssen im mittwald-Projekt Zugangsdaten am bereits vorhandenen `ghcr.io`-Registry-Eintrag hinterlegt werden.

## Routen

| Pfad | Beschreibung |
|---|---|
| `/` | DNS-Lookup |
| `/lookup/<domain>` | Permalink zu einem Lookup |
| `/history` | Lookup-Verlauf |
| `/availability` | Domain-Verfügbarkeit |
| `/about` | Info-Seite |
| `/impressum` | Impressum & Kontaktformular |

## Projekt-Struktur

```
diggy/
├── shared/
│   └── types/              # Gemeinsame TypeScript-Typen (Frontend + Backend)
├── src/
│   ├── components/         # Wiederverwendbare UI-Bausteine
│   ├── modules/            # Feature-Module (Lookup, History, Availability, …)
│   ├── lib/                # API-Client, History, Utilities
│   ├── hooks/
│   └── types/              # Re-Exports
└── server/
    ├── index.ts            # Express-App & API-Routen
    └── services/           # DNS, SSL, Mail-Audit, Kontakt, …
```

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
- [ ] DNSSEC-Chain-Validierung (vertieft)
- [ ] Response-Caching im Backend
- [ ] Watch/Monitor-Feature (Domain-Änderungen per E-Mail)

## Mitmachen

Pull Requests und Issues sind willkommen. Für größere Änderungen bitte vorher ein Issue öffnen.

## Lizenz

MIT
