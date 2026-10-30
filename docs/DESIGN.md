# Designregeln

diggy ist mit **mittwald Flow** gebaut (`@mittwald/flow-react-components`,
Dokumentation unter <https://flow.mittwald.de>). Flow bringt Typografie,
Farben, Abstände, Hell/Dunkel, Fokus und Bewegung mit — diggy setzt seine
Oberfläche aus Flow-Komponenten zusammen und erfindet keine eigenen Varianten.

Diese Seite beschreibt, *wie* diggy Flow benutzt. Für jede Komponente gilt
die Flow-Doku; die Seiten liegen auch als Markdown vor
(`https://flow.mittwald.de/raw/<pfad>.md`, Index in `llms.txt`).

## UI mit Flow

Bevor du UI baust oder änderst:

1. Lies `node_modules/@mittwald/flow-react-components/USAGE.md` — passt zur
   installierten Version.
2. Öffne die Flow-Seite der Komponente, bevor du sie einsetzt oder einen
   UI-Text festlegst. Nicht aus dem Gedächtnis.
3. Neue Seite oder neuer Ablauf: zuerst das passende Template
   (App-Shell → Seite → Overlay/Baustein), dann vom Beispielcode aus bauen.

Flow ist **exakt** gepinnt (`package.json` ohne `^`): CSS-Klassen,
Token-Namen und Typen gehören nicht zu Flows Versionszusage. Ein Update ist
eine bewusste Änderung mit Sichtprüfung (`npx @mittwald/flow-codemods@latest upgrade`).

## Grundsätze

1. **Flow zuerst.** Gibt es eine Komponente dafür, wird sie benutzt — auch
   wenn sie anders aussieht als früher. Kein Nachbau von Buttons, Badges,
   Tabs, Popovern oder Formularfeldern.
2. **Layout aus Komponenten.** `LayoutCard`, `Section`, `ColumnLayout`,
   `Flex`, `Combine` ordnen den Inhalt. Eigenes CSS nur für das, was Flow
   nicht abdeckt (Seitenspalten, Wortmarke), und dann als CSS-Modul neben der
   Komponente.
3. **Farbe trägt Status.** Gut, Warnung, kritisch, nicht prüfbar — über
   `AlertBadge`, `AlertText`, `Alert`, `Icon color`. Nie als Dekoration.
4. **Das Wichtigste zuerst.** Ergebnis, dann Begründung, dann Details.

## Seitenaufbau

Template: **Simple App** (flache Navigation über gleichrangige Bereiche).

- **Header** (`components/layout/Header.tsx`): Wortmarke links, rechts die
  `HeaderNavigation` (History, Vergleichen, Available Check, About, GitHub)
  und das Einstellungsmenü (Theme, Sprache — `ContextMenu` mit je einer
  Einfachauswahl). Ist für die Navigation kein Platz, übernimmt der Burger
  mit einem OffCanvas (`Modal offCanvas`). Auf Seiten mit Ergebnis steht die
  Suche kompakt in der Mitte.
- **Inhalt**: gemeinsame Maximalbreite mit dem Header (`--page-width`,
  `App.module.css`).
- **Footer**: Impressum, Datenschutz, Version.

Navigation sind **Links**, keine Buttons: `<Link href="/history">`. Der
`RouterProvider` in `App.tsx` fängt interne Links ab und navigiert ohne
Neuladen; Mittelklick und „In neuem Tab öffnen“ funktionieren trotzdem.
Externe Links bekommen `target="_blank"` (Flow setzt das Icon selbst) und
`rel="noopener noreferrer"`.

### Report (`/lookup/<domain>`)

Seitentyp **Detailseite**:

- Ab 1440 px zwei Spalten: links (22rem, mitlaufend) der Kopf — Überzeile,
  Domain als `h1`, Prüfzeit, Aktionen (JSON, Link kopieren, Vergleichen) —,
  darunter je eine `LayoutCard` für Health Score und Schnellübersicht.
  Darunter gestapelt. Die Grenze setzen Flows Tabs: passen ihre Titel nicht
  in eine Zeile, klappen sie zu einem Menü ein (rund 920 px für acht Tabs mit
  Zähler). Die Seitenspalte bleibt flach genug für 1440×900 — Neues kommt in
  die Tabs.
- Rechts **eine** `LayoutCard` mit Flows `Tabs`. Der Inhalt eines Tabs sind
  `Section`s (Überschrift `level={2}`, Unterüberschriften `level={3}`) —
  **keine** weiteren LayoutCards in der Karte. Mehrere Sections trennt Flow
  selbst mit einer Linie.
- Einzige Karte über den Tabs: „Seit dem letzten Check“, nur bei einem
  erneuten Check.

### Eigene Seiten (History, Vergleich, Available Check, About, Impressum …)

`Heading level={1}`, optional ein Lead (`Text`), dann `LayoutCard`s mit
`Section`s. Textseiten sind höchstens 48rem breit.

## Bausteine

| Wofür | Flow |
|---|---|
| Inhaltsblock | `LayoutCard` > `Section` > `Header`/`Heading` + Inhalt |
| Status in einer Überschrift | `AlertBadge status="success \| warning \| danger \| info \| unavailable"` im `Heading` |
| Metadaten, Kategorie | `Badge color="neutral"` |
| Wert mit Beschriftung | `LabeledValue` mit `Label` + `Content`/`InlineCode`, gruppiert im `ColumnLayout` |
| Technischer Wert (Domain, IP, Record) | `InlineCode`, in Tabellen/Überschriften die Klasse `mono` |
| Tabelle | `Table` (`TableHeader`/`TableColumn`, `TableBody`/`TableRow`/`TableCell`) |
| Aktion | `Button` (`onPress`), Nebenaktion `variant="soft" color="secondary"` |
| Navigation | `Link` |
| Kopieren | `CopyButton` |
| Erklärung zu einem Fachbegriff | `InfoButton` (`components/ui/InfoButton.tsx`, Flows `ContextualHelp`) |
| Leer-, Start-, Fehlerzustand | `EmptyState` (`components/ui/EmptyState.tsx`, Flows `IllustratedMessage`) |
| „nicht prüfbar“ | `UncheckedBadge` / `UncheckedLine` (`components/ui/Unchecked.tsx`) |
| Hinweis, der wichtig ist | `Alert status=…` in der betroffenen Section |
| Hinweis, den man übergehen kann (Converter, Mitmachen) | `AccentBox` in einer `LayoutCard`; hervorgehobene Wörter mit `Color` — Kontrast prüfen, siehe `promo/ContributeBanner.module.css` |
| Ergebnis einer Aktion | `AlertText` direkt an der Aktion |
| Ein-/ausklappen | `Accordion` |
| Inhalte umschalten | `Tabs` |
| Einen Wert wählen | `RadioGroup` (wenige Optionen, `RadioButton` für prominente), ab ~7 Optionen `Select` |
| Formular | `Form` + `Field` aus `@mittwald/flow-react-components/react-hook-form`, Felder mit `Label` |
| Laden | `Skeleton`/`SkeletonText` (Presets in `components/ui/Skeleton.tsx`), `LoadingSpinner`, `Button isPending` |

`SegmentedControl` ist in Flow veraltet — nicht verwenden.

### Icons

Zuerst Flows Icon-Bibliothek (`IconSearch`, `IconDomain`, `IconSecurity` …).
Nur wenn keins passt, ein Tabler-Icon (`@tabler/icons-react`) — immer in
`<Icon>` gehüllt, sonst fehlen Größe und Abstände:

```tsx
<Icon>
  <IconBrandGithub />
</Icon>
```

Icon-Buttons brauchen ein `aria-label`.

## Eigenes CSS

- Nur als CSS-Modul neben der Komponente (`Foo.module.css`), nur für Layout,
  das Flow nicht abdeckt. Abstände über Flows Skala (`var(--size-px--s|m|l|xl)`),
  Farben über Flows Tokens (`var(--neutral--color--800)` …) — nie feste Werte
  für Farbe.
- **Nie Selektoren gegen Flow-Klassen** (`.flow--…`) und keine Annahmen über
  Flows DOM. Der einzige Eingriff in eine Flow-Komponente ist `className` auf
  ihr selbst (z. B. eine Breite).
- `main.tsx` lädt `all-layered.css`: Flow liegt in `@layer`s, eigenes CSS
  gewinnt ohne Spezifitätskampf.
- Globale Hilfsklassen (`styles/globals.css`): `mono` (Fira Code ohne
  Ligaturen), `eyebrow` (Überzeile über einer Seitenüberschrift), `sr-only`,
  `wrap-anywhere`.

## Schriften

Inter (Text) und Fira Code (Code) wie in Flow, Goldman nur für die Wortmarke —
alle aus dem eigenen Bundle (`styles/fonts.css`). Flows Stylesheet würde die
Schriften von cdn.mittwald.de laden; der Build entfernt diese Regeln
(`flowSelfHostedFonts` in `vite.config.ts`), `npm run size` prüft das am
gebauten CSS.

## Hell und Dunkel

Flow liest das Theme aus `data-theme` am html-Element. `index.html` setzt es
vor dem ersten Paint, `useTheme` danach. Gespeichert wird nur eine
ausdrückliche Wahl im Einstellungsmenü (`diggy-theme`), sonst gilt die
Systemeinstellung.

## Texte

- **Neue Texte nur über das Übersetzungsmodul** — `t('…')`, nie als String
  im JSX oder in einem Attribut. Den Text in `src/i18n/de.ts` eintragen und
  in `src/i18n/en.ts` übersetzen; `npm run i18n` findet vergessene Stellen.
  Vorgehen und Regeln: `docs/I18N.md`. Ton nach Flows Sprach-Guide.
- Flows eigene Texte (Schließen, Kopieren …) folgen dem `I18nProvider` in
  `App.tsx` — `de-DE` oder `en-US` passend zur gewählten Sprache.
- Fachbegriffe, die in beiden Sprachen gleich heißen (Records, Health Score,
  SPF), brauchen kein `t()`.
- Jede neue Oberfläche auch auf Englisch bei 390 px ansehen: nichts läuft
  seitlich über.
- Datum und Zahlen über `formatDate`/`formatNumber` — nie fest `de-DE`.
- Rechtstexte bleiben deutsch und tragen `lang="de"`.

## Bewegung

Animationen kommen von Flow; bei „Bewegung reduzieren“ hält Flow sie selbst
an. Eigene Animationen gibt es nicht. Scrollen per JS fragt
`useReducedMotion` (dann ohne `smooth`).

Ein Ladezustand hängt nie allein an der Bewegung: Text dazu, und der Text
steht in `role="status"`. Wechselnder Text (Ladestufen) gehört nicht in die
Region, sonst wird jeder Wechsel angesagt: dann `LoadingAnnouncement` mit
einem gleichbleibenden Satz.

## Zugänglichkeit

Flow kümmert sich um Fokus, Tastaturbedienung und Rollen seiner Komponenten.
diggy achtet auf:

- eine `h1` je Seite, Überschriften ohne Sprünge;
- Status nie nur über Farbe — `AlertBadge`/`AlertText` tragen Icon und Wort;
- „nicht prüfbar“ ist kein „fehlt“: neutral (`unavailable`), mit Grund, ohne
  Punktabzug — und der Health Score sagt, dass er unvollständig ist;
- Icon-Buttons mit `aria-label`, Tabellen mit `aria-label`.

## Tests

- Abfragen über Rolle und Namen. Flows `Link` hängt seinem Namen ein
  unsichtbares Zeichen an (U+200D) — Links mit `{ name: /^History/ }` suchen.
- Overlays (ContextualHelp, ContextMenu, Modal) rendern in ein Portal; der
  Fokus kehrt nach der Ausblende-Animation zurück → `waitFor`.
- Auswahl prüfen über `aria-selected` (Tabs), `aria-checked` (Menüeinträge,
  Radios) — nicht über Klassen.
- Komponententests ohne App laufen auf `de-DE` (`src/test/setup.ts`).
