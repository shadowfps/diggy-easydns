# 🐾 Diggy

> DNS made friendly. Comprehensive DNS, SSL & domain audits in one place.

Diggy ist ein Multi-Resolver-DNS-Tool mit Health-Score, Mail-Security-Audit und SSL-Check
— gedacht für Profis und Laien gleichermaßen.

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + Framer Motion
- **Backend:** Node.js + Express + TypeScript (separate API für DNS-Lookups)
- **Deployment-Ziel:** mittwald Hosting

## Quickstart

```bash
# Dependencies installieren
npm install

# Dev-Server (Frontend + Backend gleichzeitig)
npm run dev

# Frontend allein
npm run dev:client    # → http://localhost:5173

# Backend allein
npm run dev:server    # → http://localhost:3001

# Production-Build
npm run build
```

## Projekt-Struktur

```
diggy/
├── src/
│   ├── components/         # Wiederverwendbare UI-Bausteine
│   │   ├── ui/             # Buttons, Tabs, Logo, etc.
│   │   └── layout/         # Header, Footer
│   ├── modules/            # Feature-Module — eines pro fachlichem Bereich
│   │   ├── search/         # Domain-Eingabe
│   │   ├── score/          # Health-Score & Schnellübersicht
│   │   ├── records/        # DNS-Records-Liste
│   │   ├── propagation/    # Multi-Resolver-Vergleich
│   │   ├── findings/       # Empfehlungen & Findings
│   │   ├── security/       # SSL, DNSSEC, CAA (TODO)
│   │   └── mail/           # SPF, DKIM, DMARC (TODO)
│   ├── lib/                # Utilities (cn, api, mockData)
│   ├── hooks/              # React Hooks (useTheme)
│   ├── types/              # TypeScript-Types
│   └── styles/             # Globale Styles
├── server/                 # Express-Backend für DNS-Lookups
└── ...
```

## Module hinzufügen

Jedes neue Feature wird ein eigenes Modul unter `src/modules/<name>/`. So bleibt's
übersichtlich auch wenn das Tool wächst (Bulk-Lookup, Watch/Monitor, CT-History, ...).

## Mock-Daten

Solange das Backend noch keine echten Lookups macht, liefert `src/lib/api.ts`
Mock-Daten aus `src/lib/mockData.ts`. Den Schalter findest du dort als `useMock`.

## Roadmap

- [x] UI-Grundgerüst mit allen Modulen
- [x] **Echte DNS-Queries im Backend (A/AAAA/MX/NS/TXT/CAA/SOA/CNAME)**
- [x] **Domain-Validierung & Normalisierung** (akzeptiert URLs, Ports, www-Prefixes)
- [x] **Erste Findings-Logik** (CAA fehlt, kein DMARC, IPv6, SPF-Probleme, …)
- [x] **Health-Score-Berechnung** aus Findings
- [ ] Multi-Resolver-Vergleich via DNS-over-HTTPS
- [ ] SSL-Cert-Check via tls.connect()
- [ ] DNSSEC-Chain-Validierung
- [ ] Mail-Security-Audit (DKIM-Selectors probieren, DMARC auf _dmarc.<domain>)
- [ ] WHOIS/RDAP-Lookup
- [ ] Permalinks (`/lookup/example.com`)
- [ ] Caching & Rate-Limiting
- [ ] Watch/Monitor-Feature
- [ ] benzorich ist king 🤍
```
