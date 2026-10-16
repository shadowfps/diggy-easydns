# Designregeln

Wie diggy aussieht und warum. Umgesetzt in `src/styles/globals.css`: Tokens im
`@theme`, Bausteine in `@layer components`. Neue Oberflächen setzen sich aus
diesen Bausteinen zusammen — eigene Radien, Grautöne oder Schatten kommen nicht
dazu.

## Grundsätze

1. **Ruhig vor auffällig.** Schwarz-Weiß ist die Marke. Farbe trägt nur Status
   (gut, Warnung, kritisch) — nie Dekoration.
2. **Eine Form je Rolle.** Wer ein Element einmal gesehen hat, erkennt alle
   anderen derselben Art: jede Karte, jeder Button, jedes Badge sieht gleich aus.
3. **Abstand gliedert, Linien nur wo nötig.** Zusammengehöriges steht eng,
   Abschnitte bekommen Luft. Trennlinien nur in Listen.
4. **Das Wichtigste zuerst.** Ergebnis, dann Begründung, dann Details. Aktionen
   stehen dort, wo man sie braucht — nicht am Seitenende.

## Farben

Nur semantische Tokens. Sie schalten selbst zwischen Hell und Dunkel um, ein
`dark:` ist dafür nie nötig.

| Token | Verwendung |
|---|---|
| `canvas` | Seitenhintergrund |
| `surface` | Karten, Eingabefelder, Menüs |
| `surface-muted` | Flächen in Karten, Chips, Skeletons |
| `line` / `line-subtle` | Kartenrand / Trennlinien in Listen |
| `fg` | Überschriften, Werte, Primärtext |
| `fg-muted` | Fließtext, Beschreibungen |
| `fg-subtle` | Labels, Metadaten, Platzhalter |
| `accent` / `on-accent` | Primärbutton, aktiver Chip, aktiver Tab |
| `success` / `warning` / `danger` | Status — nur für Bewertungen |

- **Warnung ist gelb, nicht rot.** Rot heißt „kaputt“. Wer beides rot färbt,
  nimmt dem Nutzer die Gewichtung.
- Text in Statusfarbe nur mit getönter Fläche dahinter (`badge-*`,
  `icon-tile-*`) oder als großer Wert (Score). Alle Kombinationen erreichen
  WCAG AA.
- Die `ink-*`-Skala bleibt für Sonderfälle (Grafiken, Verläufe) — nicht für
  Text, Flächen oder Ränder.

## Form

Drei Radien, keine weiteren:

| Radius | Wo |
|---|---|
| `rounded-card` (20 px) | Karten, Menüs, Dialoge |
| `rounded-panel` (12 px) | Flächen in Karten, Eingabefelder, Icon-Kacheln |
| `rounded-full` | Buttons, Chips, Badges, Tabs, Suchfeld, Statuspunkte |

Verschachtelt wird der Radius kleiner, nie größer: eine Karte (20) enthält
Panels (12), ein Panel enthält Pillen.

## Abstände

4-px-Raster, nur Tailwind-Schritte.

| Ebene | Abstand |
|---|---|
| Seitenrand | `px-4` · `sm:px-6` · `lg:px-8` |
| Zwischen Abschnitten | `mt-8` (32 px), Seitenkopf zu Inhalt `mt-6`/`mt-8` |
| Zwischen Karten | `gap-4` (16 px) |
| In Karten | 20 px, ab `sm` 24 px — steckt in `.card` |
| Kartenkopf zu Inhalt | `mt-4` |
| Titel zu Beschreibung | `mt-1` |
| Zeilen in Listen | `gap-3`, Listenzeilen `px-5 py-4` |
| Icon zu Text | `gap-2` (klein) · `gap-3` (Kachel) |

Raster haben immer eine Spaltenangabe für Mobil (`grid grid-cols-1 md:grid-cols-2`).
Ohne sie wächst die Spalte mit dem breitesten Inhalt — ein langer Record oder
ein abgeschnittener Titel schiebt die Seite dann seitlich über den Rand.

Inhaltsbreiten: Report `max-w-[110rem]`, Textseiten (Impressum, About …)
`max-w-3xl`, Suche `max-w-2xl`.

## Seitenaufbau

- **Header**: Wortmarke links, rechts GitHub und das Menü (History,
  Vergleichen, Available Check, About, Theme). Auf Seiten mit Ergebnis (Report,
  IP-Lookup) steht die Suche kompakt in der Mitte — ab `md` genau mittig
  über ein Raster mit gleich breiten Außenspalten. Sie bleibt beim Scrollen
  erreichbar, und der Inhalt beginnt oben.
- **Startseite**: Wortmarke, Frage, große Suche, darunter „Zuletzt geprüft“
  (oder Beispiele beim ersten Besuch), „Was diggy prüft“, Converter-Hinweis.
- **Report**: ab `xl` zwei Spalten. Links (24rem) die Zusammenfassung — Kopf
  mit Domain und Aktionen, Score, Schnellübersicht — die beim Scrollen
  mitläuft; rechts Tabs und Inhalt. Darunter gestapelt: Kopf, Score und
  Schnellübersicht nebeneinander, dann die Tabs. Die Seitenspalte bleibt
  flach genug für 1440×900 — Neues kommt in die Tabs, nicht in die Spalte.
  Die Aktionen im Kopf (JSON, Link kopieren, Vergleichen) stehen in einer
  Zeile, auch bei 390 px: Beschriftungen kurz, die Langfassung im Tooltip.
- **Vergleich** (`/compare/<a>/<b>`): `max-w-6xl`, Seitenkopf wie eine
  Textseite, darunter die beiden Eingabefelder, dann je Domain eine Karte mit
  Score (ab `md` nebeneinander) und eine Karte je Bereich. In den Karten ab
  `md` drei Spalten — Bezeichnung, Domain A, Domain B —, darunter steht jede
  Zeile untereinander. Abweichungen tragen `badge-warning` mit Wort
  („Unterschied“, „nur hier“): beim Vergleich ist die Abweichung das, was man
  ansehen muss. „nur hier“ steht nur, wo sich die Werte einer Zeile teilweise
  decken — teilen sie nichts, sagt das „Unterschied“ der Zeile genug.
- **Textseiten**: `max-w-3xl`, Überzeile, `page-title`, optional Lead, dann
  Karten.

## Typografie

Geist für Text, Geist Mono für alles, was man abtippt (Domains, IPs, Records),
Goldman nur für die Wortmarke.

| Rolle | Klasse |
|---|---|
| Seitentitel | `page-title` |
| Überzeile | `eyebrow` |
| Kartentitel | `card-title` (14 px, semibold, mit Icon) |
| Kartenuntertitel | `card-subtitle` |
| Fließtext | `text-sm text-fg-muted`, längere Absätze `leading-relaxed` |
| Label in Werte-Paaren | `text-xs text-fg-subtle` |
| Wert | `text-sm text-fg`, technisch `font-mono text-[13px]` |

Höchstens zwei Schriftgewichte je Karte (normal + semibold). Versalien nur in
`eyebrow`.

## Bausteine

| Klasse | Wofür |
|---|---|
| `card` | Eigenständiger Inhaltsblock |
| `card-flush` | Karte für Listen — Zeilen gehen bis zum Rand, getrennt durch `divide-y divide-line-subtle` |
| `panel` | Fläche in einer Karte: Codeblock, Kennzahl, Hinweis |
| `overlay` | Menü, Dialog |
| `btn` + `btn-primary` / `btn-secondary` / `btn-ghost` | Buttons; Größe `btn-sm` / `btn-lg`, nur Icon `btn-icon` |
| `chip` | Umschaltbare Auswahl, aktiv über `aria-pressed` |
| `badge` + `badge-success` / `-warning` / `-danger` | Status, nicht klickbar |
| `icon-tile` (+ Ton) | Icon in getönter Kachel |
| `input` | Eingabefeld und Textarea |
| `link` | Link im Fließtext |

React-Bausteine, wo eine Klasse allein nicht reicht:

- `CardHeader` (`components/ui/CardHeader.tsx`) — Kopf jeder Inhaltskarte:
  Icon-Kachel, `card-title`, optional Untertitel, rechts ein Status. `tone`
  färbt die Kachel nur, wenn die Karte eine Bewertung trägt.
- `EmptyState` (`components/ui/EmptyState.tsx`) — Leer-, Start- und
  Fehlerzustand eines Abschnitts.

- **Aktiv heißt `accent`.** Aktiver Tab, aktiver Chip, aktive Option eines
  Umschalters: dunkle Pille im Hellen, helle im Dunkeln.
- **Ein Primärbutton je Ansicht.** Alles andere ist `btn-secondary` oder
  `btn-ghost`.
- Icon-Buttons brauchen ein `aria-label`.
- Leerzustände: `icon-tile`, Titel, ein Satz, optional eine Aktion — zentriert
  in einer `card`.
- Fehler in einem Abschnitt: wie ein Leerzustand mit `icon-tile-danger`. Die
  Seite drumherum bleibt bedienbar.

## Bewegung

- Einblenden: `opacity` und höchstens 8 px Versatz, 200–400 ms, `ease-out`.
- Hover und Fokus: nur Farbe; Buttons geben beim Klick nach (`active:scale`).
- `prefers-reduced-motion` wird respektiert (`MotionConfig` in `main.tsx`).

## Zugänglichkeit

- Fokus ist immer sichtbar: ein Ring in `fg`, global für alles Bedienbare.
  Komponenten setzen keinen eigenen.
- Klickflächen mindestens 32 px hoch (`btn-sm`), Standard 40 px.
- Status nie nur über Farbe: Badge mit Wort, Icon mit Form (Haken, Kreuz,
  Ausrufezeichen).
