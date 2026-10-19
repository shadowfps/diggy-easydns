# Deployment

Wie diggy als Container gebaut und nach diggydns.cloud ausgerollt wird. Lokales
Setup und Konfiguration: [DEVELOPMENT.md](DEVELOPMENT.md).

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
