# Deployment

Wie diggy als Container gebaut und nach diggydns.cloud ausgerollt wird. Lokales
Setup und Konfiguration: [DEVELOPMENT.md](DEVELOPMENT.md).

Das Production-Image enthält Frontend und API in einem nicht privilegierten Node.js-Prozess. Es lauscht standardmäßig auf Port `3001` und stellt unter `/api/health` einen Healthcheck bereit.

Lokal bauen und starten:

```bash
docker build -t diggy:local .
docker run --rm -p 3001:3001 --env-file .env diggy:local
```

Ob aus dem Image heraus alle Resolver der Propagation antworten, zeigt der
Live-Check — vor dem Merge gegen den lokalen Container, nach dem Deploy gegen
die Seite:

```bash
node scripts/check-propagation-live.mjs http://127.0.0.1:3001
node scripts/check-propagation-live.mjs https://diggydns.cloud
```

Er fragt fünf Kombinationen aus Domain und Typ ab und endet mit Fehler, wenn
ein Resolver nicht antwortet. In der CI läuft er bewusst nicht, weil er an neun
fremden Diensten hängt. Anlass war #137: Unter Node 24, der Version im Image,
antworteten Quad9 und DNS4EU nie. Auf dem Mac mit Node 26 lief alles.

Dasselbe für WHOIS und den Verfügbarkeits-Check (#105): Erreicht der Server
die Registries per RDAP und über WHOIS auf Port 43?

```bash
node scripts/check-whois-live.mjs http://127.0.0.1:3001
node scripts/check-whois-live.mjs https://diggydns.cloud
```

Er fragt neun Domains ab — RDAP laut IANA-Bootstrap (.com, .dev, .co.uk),
DENIC, Identity Digital (.io), Port 43 für .eu, dazu .ch, .at und .it, die
bewusst ohne Abfrage bleiben (nur Link auf die Web-Abfrage der Registry) —
und prüft je Domain, welche Quelle geantwortet hat. Danach die Verfügbarkeit
einer zufälligen freien und einer vergebenen .io-Domain, einer freien
.eu-Domain (Port 43) und einer .at-Domain (erwartet „unklar“). Er endet mit
Fehler, wenn eine Erwartung nicht stimmt; scheitert die Port-43-Abfrage für
europa.eu, ist Port 43 ausgehend vermutlich gesperrt. Die API hält
WHOIS-Ergebnisse 60 s im Cache, auch „nicht verfügbar“ — für einen zweiten
Lauf eine Minute warten.

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

## Testumgebung (dev.diggydns.cloud)

Ein Spiegel von diggydns.cloud zum Testen vor dem Release: gleiches Image,
gleiche Konfiguration, aber mit Passwortabfrage und ohne Suchmaschinen.

| | Prod | Dev |
|---|---|---|
| Adresse | https://diggydns.cloud | https://dev.diggydns.cloud |
| Stack | `86540922-d203-4150-8776-9cc4e22352bd` (default) | `ec47560f-2662-4d57-800b-3bd4e039b29d` |
| Ausgerollt von | `main` (`container.yml`) | Branch `dev` (`deploy-dev.yml`) |
| Image-Tag | `latest`, `sha-…` | `dev`, `sha-…` |

Beide Stacks liegen im selben mStudio-Projekt (`p-nmi5ji`), aber getrennt:
`mw stack deploy` gleicht immer den ganzen Stack ab, ein Dev-Deploy kann Prod
so nicht anfassen.

**Ablauf**

1. Lokal prüfen (`npm run verify`, `npm run e2e:docker`).
2. Den Branch auf `dev` schieben — das rollt aus:
   ```bash
   git push origin <branch>:dev            # Branch baut auf dem letzten dev-Stand auf
   git push --force-with-lease origin <branch>:dev   # anderer Branch als zuletzt
   ```
   Auf dev steht immer der zuletzt geschobene Stand.
3. Testen lassen.
4. Wie gewohnt per PR nach `main` — das rollt nach diggydns.cloud aus.

**Passwort**

Die Testumgebung startet mit `SITE_PASSWORD` (GitHub-Secret
`DEV_SITE_PASSWORD`; ohne das Secret bricht der Deploy ab, statt dev offen
ins Netz zu stellen). Dann sperrt der Server die API, bis sich der Browser
angemeldet hat, und die App zeigt statt des Reports eine Anmeldung
(`server/lib/siteGate.ts`, `src/components/siteGate/`). Nach dem Passwort
setzt der Server ein Sitzungs-Cookie für 30 Tage; ein neues Passwort meldet
alle ab. Zusätzlich:

- `X-Robots-Tag: noindex, nofollow` auf jeder Antwort,
- „Testversion“ neben der Wortmarke,
- `[dev]` im Betreff der Kontakt-Mails (`CONTACT_SUBJECT_PREFIX`),
- `PUBLIC_ORIGIN` ist `https://dev.diggydns.cloud`.

Ohne `SITE_PASSWORD` (Prod) ist nichts davon aktiv. Das Frontend selbst ist
auch auf dev ohne Anmeldung abrufbar — der Code ist ohnehin öffentlich, und
ohne API zeigt die App nichts.

Lokal ausprobieren:

```bash
SITE_PASSWORD=test PORT=3002 node dist-server/server/index.js
```

**Einmalig eingerichtet**

- Stack: `mw stack create -p p-nmi5ji -d "dev | dev.diggydns.cloud"`
- DNS bei Cloudflare: `dev` wie `diggydns.cloud` (A-Record auf die IP des
  Projekts, proxied).
- Virtualhost nach dem ersten Deploy:
  `mw domain virtualhost create -p p-nmi5ji --hostname dev.diggydns.cloud --path-to-container /:<container-id>:3001/tcp`

