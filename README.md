# Diggy

> DNS made friendly — DNS, SSL & Domain-Audits auf einen Blick.

Diggy ist ein webbasiertes DNS-Audit-Tool. Domaine eingeben, fertig: Records, Mail-Security, SSL-Status, Propagation, WHOIS und PageSpeed-Score landen übersichtlich auf einem Screen — mit Health-Score und konkreten Empfehlungen.

![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss&logoColor=white)

## Features

- **DNS Records** — A, AAAA, MX, NS, TXT, CAA, SOA, CNAME auf einen Blick
- **Health-Score** — automatisch berechnet aus Findings und Konfigurationslücken
- **Findings & Empfehlungen** — konkrete Hinweise zu fehlenden oder fehlerhaften Einträgen
- **Mail Security** — SPF, DKIM (Selector-Scan), DMARC, MTA-STS
- **SSL / TLS** — Zertifikats-Details, Ablaufdatum, Chain-Check
- **DNSSEC** — Validierungsstatus
- **Propagation** — Vergleich über mehrere DNS-Resolver gleichzeitig
- **WHOIS / RDAP** — Registrar-Infos, Ablaufdatum der Domain
- **PageSpeed** — Google Lighthouse Score (Mobile & Desktop)
- **Lookup-History** — zuletzt abgefragte Domains (lokal im Browser)
- **Permalinks** — direkt verlinkbare Ergebnisseiten (`/lookup/<domain>`)
- **JSON-Export** — vollständigen Report als Datei herunterladen
- **Dark Mode** — systembasiert, manuell umschaltbar

## Stack

| Bereich | Technologie |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, GSAP |
| Backend | Node.js, Express, TypeScript |
| DNS | Native Node.js `dns` + DoH-Resolver |

## Quickstart

```bash
# Abhängigkeiten installieren
npm install

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

# Production-Server starten
npm start
```

## Projekt-Struktur

```
diggy/
├── src/
│   ├── components/         # Wiederverwendbare UI-Bausteine
│   │   ├── ui/             # Buttons, Tabs, Logo, Animationen
│   │   └── layout/         # Header, Footer
│   ├── modules/            # Feature-Module
│   │   ├── search/         # Domain-Eingabe & Validierung
│   │   ├── score/          # Health-Score & Quick-Facts
│   │   ├── records/        # DNS-Records-Tabelle
│   │   ├── propagation/    # Multi-Resolver-Vergleich
│   │   ├── findings/       # Empfehlungen & Findings
│   │   ├── security/       # SSL & DNSSEC
│   │   ├── mail/           # SPF, DKIM, DMARC, MTA-STS
│   │   ├── whois/          # WHOIS / RDAP
│   │   ├── speed/          # PageSpeed
│   │   ├── history/        # Lookup-Verlauf
│   │   └── about/          # Info-Seite
│   ├── lib/                # Utilities (API-Client, History, cn)
│   ├── hooks/              # React Hooks
│   └── types/              # TypeScript-Typen
└── server/                 # Express-Backend
```

## Roadmap

- [x] DNS-Queries (A/AAAA/MX/NS/TXT/CAA/SOA/CNAME)
- [x] Domain-Validierung & Normalisierung
- [x] Health-Score aus Findings
- [x] Mail-Security-Audit (SPF, DKIM, DMARC, MTA-STS)
- [x] SSL/TLS-Check
- [x] WHOIS/RDAP-Lookup
- [x] PageSpeed-Integration
- [x] Permalinks & JSON-Export
- [x] Lookup-History (Browser-lokal)
- [ ] Multi-Resolver-Propagation via DNS-over-HTTPS (in Arbeit)
- [ ] DNSSEC-Chain-Validierung
- [ ] Caching & Rate-Limiting im Backend
- [ ] Watch/Monitor-Feature (Domain-Änderungen per E-Mail)

## Mitmachen

Pull Requests und Issues sind willkommen. Für größere Änderungen bitte vorher ein Issue öffnen.

## Lizenz

MIT
