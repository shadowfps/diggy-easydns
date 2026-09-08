# Compliance-Einordnung

Technische Bestandsaufnahme, keine Rechtsberatung. Sie beschreibt, was der Code
tatsächlich tut, und ordnet das den einschlägigen Regelwerken zu. Die
rechtliche Bewertung gehört fachlich geprüft.

**Stand:** 8. September 2026 · **Bezug:** Commit-Stand von PR #34

---

## EU AI Act (VO (EU) 2024/1689)

### Ergebnis

**Diggy ist kein KI-System im Sinne von Art. 3 Nr. 1 AI Act. Es bestehen keine
Pflichten aus der Verordnung.**

### Begründung

Art. 3 Nr. 1 verlangt ein System, das „aus den erhaltenen Eingaben **ableitet**,
wie Ausgaben erzeugt werden". Erwägungsgrund 12 stellt klar, dass Systeme, die
„auf ausschließlich von natürlichen Personen definierten Regeln beruhen, um
Vorgänge automatisch auszuführen", **nicht** erfasst sind.

Genau das ist hier der Fall. Jede Ausgabe der App entsteht aus fest
programmierten Regeln:

| Funktion | Wie die Ausgabe entsteht | Ort im Code |
|---|---|---|
| Health-Score | Feste Abzugstabelle pro Severity, aufsummiert, gedeckelt | `shared/scoring.ts` |
| Findings & Empfehlungen | `if`-Kaskaden über vorhandene/fehlende Records | `server/services/reportBuilder.ts` |
| Tech-Stack-Erkennung | Abgleich gegen eine fest hinterlegte Liste von Regex-Mustern | `server/services/techstack.ts` |
| SPF/DKIM/DMARC-Bewertung | Regeln aus RFC 7208 und RFC 6376, hart kodiert | `server/services/mailAudit.ts` |
| DNSSEC-Status | Auswertung von DS-/DNSKEY-Existenz und AD-Flag | `server/services/dnssec.ts` |
| Verfügbarkeits-Check | HTTP-Statuscode der RDAP-Antwort (404 = frei) | `server/services/domainAvailability.ts` |

Es gibt kein Modell, keine Trainingsdaten, keine Gewichte, keine Inferenz und
keine Anpassung des Verhaltens nach der Inbetriebnahme. Die
Laufzeit-Abhängigkeiten enthalten keine ML- oder LLM-Bibliothek — nachprüfbar
über `package.json`:

```
@fontsource/*, @gsap/react, clsx, cors, dotenv, express, framer-motion,
gsap, helmet, lucide-react, nodemailer, react, react-dom, tailwind-merge, tldts
```

Die App bewirbt sich auch nicht als KI-Anwendung; in den UI-Texten kommt keine
entsprechende Behauptung vor.

### Der eine Grenzfall: VirusTotal

Der VirusTotal-Check zeigt Urteile fremder Scan-Engines an, von denen manche
intern ML einsetzen dürften. Das macht Diggy aber nicht zum Betreiber eines
KI-Systems:

- Diggy nimmt ein API-Ergebnis entgegen und stellt es dar. Es nimmt kein
  KI-System „unter eigener Verantwortung" in Betrieb, wie Art. 3 Nr. 4 es für
  den Betreiber-Begriff verlangt — es ist Kunde eines Dienstes.
- Domain-Reputation ist in keinem der Anwendungsfälle aus Anhang III genannt,
  fällt also auch nicht in den Hochrisiko-Bereich.
- Die Transparenzpflichten aus Art. 50 knüpfen an bestimmte Systemarten an
  (Interaktion mit Menschen, synthetische Inhalte, Emotionserkennung,
  biometrische Kategorisierung). Keine davon liegt vor.

Die Anzeige nennt VirusTotal als Quelle, die Herkunft der Bewertung ist für
Nutzer also erkennbar.

### Was sich ändern würde

Diese Einordnung hängt am Fehlen jeglicher Inferenz. Sie ist **neu zu prüfen**,
sobald eines davon dazukommt:

- **LLM-erzeugte Texte** (etwa formulierte Empfehlungen statt der festen
  Bausteine). Dann greift Art. 50 Abs. 1: Nutzer sind darüber zu informieren,
  dass sie mit einem KI-System interagieren, soweit das nicht offensichtlich
  ist. Bei synthetischen Inhalten kommt Abs. 2 hinzu
  (maschinenlesbare Kennzeichnung).
- **Gelernte Erkennung** statt Regex-Muster beim Tech-Stack.
- **Ein trainiertes Modell für den Score** oder eine Bewertung, die sich anhand
  gesammelter Lookups selbst anpasst — damit wäre auch das
  Adaptivitäts-Merkmal aus Art. 3 Nr. 1 erfüllt.
- **Art. 4 (KI-Kompetenz)** würde in diesen Fällen für die mit dem System
  befassten Personen relevant.

Als Faustregel für künftige Features: sobald eine Ausgabe nicht mehr
deterministisch aus dem Code herleitbar ist, ist diese Datei zu überarbeiten.

---

## DSGVO

Die Verarbeitung ist in `/datenschutz` beschrieben. Kurzfassung der
technischen Fakten:

| Was | Wo im Code | Speicherdauer |
|---|---|---|
| Abgefragte Domain/IP im Server-Cache | `server/lib/cache.ts` | 60 s, IP-Details 30 min, PageSpeed 15 min, VirusTotal 6 h |
| IP-Zähler für Rate-Limits | `server/lib/rateLimit.ts`, `contactSpamGuard.ts` | max. 24 h, nur im Arbeitsspeicher |
| Prüfsumme über Absender+Nachricht (Duplikatserkennung) | `contactSpamGuard.ts` | 5 min |
| Empfänger-Sperre für Auto-Replies | `contactSpamGuard.ts` | 24 h |
| Kontaktanfrage | per SMTP an den Betreiber | im Postfach |
| Lookup-History, Theme | `localStorage` im Browser | bis der Nutzer löscht |

**Keine automatisierte Entscheidungsfindung im Sinne von Art. 22 DSGVO.** Der
Health-Score bewertet die technische Konfiguration einer Domain, nicht eine
Person, und hat keine rechtliche Wirkung für Betroffene.

**Drittlandübermittlung:** Die Checks fragen unter anderem Dienste in den USA
ab (Google PageSpeed, VirusTotal, Cloudflare-DoH, ipwhois.app). Übermittelt wird
dabei die abgefragte Domain bzw. IP-Adresse — die Anfragen gehen vom Server aus,
nicht aus dem Browser des Nutzers, dessen IP bleibt also hier. Zu beachten: eine
abgefragte Domain kann im Einzelfall selbst personenbezogen sein (etwa
`vorname-nachname.de`).

Nach dem Umstieg auf lokal gehostete Schriften (#13) baut die Seite beim
Aufruf **keine** Verbindung zu Dritten mehr auf. Nachprüfbar: das gebaute
`dist/index.html` und `dist/assets/*.css` enthalten keine Fremd-Host-Referenz.
