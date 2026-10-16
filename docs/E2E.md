# Browser-Tests (Playwright)

Optische Brüche sollen vor dem Merge auffallen, nicht danach. Die Tests unter
`e2e/` starten den gebauten Server, öffnen die Seiten in Chromium und prüfen
zweierlei:

1. **Seitliches Überlaufen** (`overflow.spec.ts`) — die Seite darf nie breiter
   als der Viewport sein. Geprüft wird jede wichtige Ansicht in hell und
   dunkel, mobil (exakt 390 px) und am Desktop (1440 px): Startseite (auch mit
   offenem Menü), Report für example.com und github.com mit jedem Tab, History,
   Available Check mit Ergebnis, About, Impressum, Datenschutz, IP-Lookup.
   Schlägt der Check an, nennt die Meldung das Element, das herausragt:

   ```
   Report example.com, Tab records: Seite ist 872px breit bei 390px Viewport.
   Ragt heraus: <div.flex.w-fit.gap-1.overflow-x-auto> bis 872px „Records10Propagation5…“
   ```

2. **Pixelvergleich** (`screenshots.spec.ts`) — Startseite und Report in hell
   und dunkel, mobil und Desktop, gegen die Referenzbilder in
   `e2e/__screenshots__/`. Bewusst nur diese acht Bilder: jedes muss bei einer
   gewollten Design-Änderung neu erzeugt und angesehen werden.

## Stabil statt flaky

- **Keine Live-Daten.** Jeder `/api/...`-Aufruf wird im Test aus
  `e2e/api-data/` beantwortet. Ruft die Seite einen Endpoint auf, für den es
  keine Testdaten gibt, scheitert der Test — so holt keine neue Ansicht
  unbemerkt doch wieder Live-DNS.
- **Feste Zeit, Zone und Sprache.** `Date` steht auf 16.10.2026 (WHOIS-Laufzeit,
  History), Zeitzone Europe/Berlin, Locale de-DE. „Geprüft am …“ kommt aus den
  Testdaten.
- **Keine Animationen.** `reducedMotion: 'reduce'` hält Framer Motion, GSAP und
  den Typewriter an. Der Health Score zählt trotzdem per JavaScript hoch; der
  Test wartet, bis er auf dem Endwert steht.
- **Fehler in der Browser-Konsole** lassen den Test scheitern.
- Keine Retries: ein Fehlschlag ist ein Befund, kein Zufall.

## Lokal ausführen

Einmalig den Browser installieren:

```bash
npx playwright install chromium
```

Dann wie in der CI gegen den Build:

```bash
npm run build
npm run e2e
```

So laufen die Überlauf-Tests; der Pixelvergleich wird übersprungen, weil
Schriften außerhalb des Referenz-Images anders gerendert werden (unter macOS
ohnehin). Den kompletten Lauf inklusive Pixelvergleich gibt es im
Docker-Image:

```bash
npm run e2e:docker
```

Das startet `mcr.microsoft.com/playwright:v<Version>-noble` (Version aus
`package-lock.json`) als linux/arm64, installiert dort, baut und testet. Auf
Apple Silicon läuft das nativ, in der CI auf einem ARM-Runner — beide
erzeugen dieselben Pixel. Auf einem x86-Rechner müsste Docker ARM emulieren,
und unter Emulation stürzt Chromium ab (umgekehrt mit amd64 auf Apple Silicon
ausprobiert). Dann hilft der Weg unter „Ohne ARM-Rechner“.

Fehler ansehen: `npx playwright show-report` öffnet den HTML-Report mit
erwartetem Bild, Ist-Bild und Diff. Mehr Details liefert
`npx playwright test --trace on`.

Hinweis: Liegt die Arbeitskopie unter einem Pfad mit Punkt-Ordner (etwa
`.claude/worktrees/…`), liefert der Server SPA-Routen mit 404 aus (#89) und
alle Tests scheitern. Im Docker-Lauf betrifft das nicht, dort liegt der Code
unter `/work`.

## Referenzbilder aktualisieren

Nötig nach einer gewollten Design-Änderung, nach neuen Testdaten und nach
einem Playwright-Update (neuer Chromium-Build):

```bash
npm run e2e:docker -- --update-snapshots
```

Danach die geänderten Bilder in `e2e/__screenshots__/` ansehen (etwa im Diff
des PRs) und mitcommitten. Die CI legt fehlende Referenzbilder nie selbst an.

**Ohne ARM-Rechner:** Schlägt der Pixelvergleich in der CI fehl, hängt am Lauf
das Artefakt `playwright-report`. Darin liegen je Bild erwartetes Bild, Ist-Bild
und Diff, etwa
`test-results/screenshots-Screenshots-hell-Startseite-desktop/startseite-hell-actual.png`.
Sind die Änderungen gewollt, ersetzt das Ist-Bild die Referenz
`e2e/__screenshots__/screenshots.spec.ts/startseite-hell-desktop.png`.

## Toleranz

`maxDiffPixels: 20` je Bild, Farbschwelle `threshold: 0.2` (Playwright-Standard:
Pixel, deren Farbe sich kaum unterscheidet, zählen nicht als abweichend).

Referenz und CI rendern im selben Image auf derselben Architektur. Drei Läufe
hintereinander ergaben bitgleiche Bilder, erwartet sind also 0 abweichende
Pixel. Die 20 sind nur Reserve für einzelne Subpixel-Reste und bewusst klein
gewählt — gemessen:

| Absichtliche Änderung | abweichende Pixel |
|---|---|
| GitHub-Icon im Header ausgeblendet (16 × 16 px) | 66 |
| Innenabstand der Karten mobil 20 → 21 px | 18 000 – 33 000 |

Ein prozentualer Wert (`maxDiffPixelRatio`) wäre ungeeignet: schon 0,1 % eines
ganzseitigen Desktop-Bilds sind über 1 500 Pixel, ein fehlendes Icon ginge
darin unter.

Die Versionsnummer im Footer ist ausgeblendet, sonst bräuchte jedes Release
neue Bilder.

## Testdaten neu aufnehmen

Nur nötig, wenn sich das API-Format ändert oder eine Ansicht neue Daten
braucht. Gegen einen laufenden Server:

```bash
npm run dev:server        # in einem zweiten Terminal
node e2e/record-api-data.mjs http://127.0.0.1:3001
```

Danach ändern sich in der Regel auch die Referenzbilder.

## Grenzen

- Der Überlauf-Check sieht nur, was die **Seite** verbreitert. Inhalt, den
  eine Karte mit `overflow: hidden` abschneidet (etwa ein TXT-Wert ohne
  Umbruch), verbreitert die Seite nicht und fällt nur im Pixelvergleich auf —
  und der deckt nur Startseite und Report ab.
- PageSpeed und VirusTotal werden nicht ausgelöst; geprüft wird nur der
  Ausgangszustand dieser Tabs.
