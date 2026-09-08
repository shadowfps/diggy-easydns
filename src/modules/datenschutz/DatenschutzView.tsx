import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

/**
 * Datenschutzhinweise.
 *
 * Die Angaben sind aus dem Code abgeleitet, nicht aus einem Generator: die
 * Empfänger-Tabelle stammt aus den Service-Modulen, die Speicherdauern aus den
 * Konstanten in lib/cache.ts, lib/rateLimit.ts und services/contactSpamGuard.ts.
 * Wer dort etwas ändert, muss diese Seite mitziehen — die Tabelle in
 * docs/COMPLIANCE.md hält die Zuordnung fest.
 *
 * Kein Ersatz für eine juristische Prüfung. Technisch korrekt, rechtlich
 * unbestätigt.
 */

/** Wird im Footer und im Text als Datumsangabe genutzt. */
const LAST_UPDATED = '8. September 2026';

interface DatenschutzViewProps {
  onOpenImpressum?: () => void;
}

export function DatenschutzView({ onOpenImpressum }: DatenschutzViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl"
    >
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
          <ShieldCheck className="h-3.5 w-3.5" />
          Rechtliches
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Datenschutz</h1>
        <p className="mt-2 text-sm text-ink-900/55 dark:text-ink-50/55">
          Was diggy verarbeitet, auf welcher Rechtsgrundlage, wie lange und was dabei an
          Dritte geht.
        </p>
      </div>

      <div className="surface space-y-8 rounded-2xl p-6 md:p-8">
        <Section title="Verantwortlicher">
          <p>
            Ruben Yannik Riesen, An Wehes Hof 1, 32369 Rahden, Deutschland.
            <br />
            E-Mail:{' '}
            <a href="mailto:hallo@cavara.dev" className="underline underline-offset-2">
              hallo@cavara.dev
            </a>
            {onOpenImpressum && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={onOpenImpressum}
                  className="underline underline-offset-2 hover:text-ink-900/70 dark:hover:text-ink-50/70"
                >
                  Impressum
                </button>
              </>
            )}
          </p>
          <p className="mt-3">
            Ein Datenschutzbeauftragter ist nicht bestellt — die Voraussetzungen des
            § 38 BDSG liegen für dieses private Projekt nicht vor.
          </p>
        </Section>

        <Section title="Das Wichtigste zuerst">
          <ul className="space-y-1.5">
            <Bullet>Keine Registrierung, keine Nutzerkonten.</Bullet>
            <Bullet>Kein Analytics, kein Tracking, keine Werbe-Cookies.</Bullet>
            <Bullet>
              Keine Einbindung von Schriftarten, Skripten oder Inhalten Dritter — beim
              Aufruf der Seite entsteht keine Verbindung zu einem fremden Server.
            </Bullet>
            <Bullet>Keine Weitergabe zu Werbezwecken, kein Verkauf von Daten.</Bullet>
          </ul>
        </Section>

        <Section title="Aufruf der Seite (Server-Logs)">
          <p>
            Beim Abruf fallen technisch notwendige Verbindungsdaten an: IP-Adresse,
            Zeitpunkt, angefragter Pfad, übertragene Datenmenge, Statuscode, Referrer und
            User-Agent. Diese Daten sind für die Auslieferung erforderlich und dienen der
            Erkennung und Abwehr von Störungen und Missbrauch.
          </p>
          <Meta
            basis="Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse am sicheren und
              stabilen Betrieb"
            dauer="Die Logs werden vom Hosting-Dienstleister vorgehalten und regelmäßig
              gelöscht; eine Zusammenführung mit anderen Daten findet nicht statt."
          />
        </Section>

        <Section title="Hosting">
          <p>
            Die Anwendung läuft bei der Mittwald CM Service GmbH &amp; Co. KG,
            Königsberger Straße 4–6, 32339 Espelkamp, Deutschland. Der Dienstleister
            verarbeitet die oben genannten Verbindungsdaten in unserem Auftrag
            (Art. 28 DSGVO). Die Server stehen in Deutschland.
          </p>
        </Section>

        <Section title="Abgefragte Domains und IP-Adressen">
          <p>
            Was du in die Suche eingibst, wird an die unten genannten Stellen
            weitergegeben — ein DNS-, SSL- oder WHOIS-Check ist ohne Rückfrage bei den
            zuständigen Servern nicht möglich. Die Anfragen gehen dabei{' '}
            <strong className="font-medium text-ink-900 dark:text-ink-50">
              vom Server aus, nicht aus deinem Browser
            </strong>
            : deine IP-Adresse erfahren diese Dienste nicht.
          </p>
          <p className="mt-3">
            Ergebnisse werden serverseitig kurz zwischengespeichert, damit dieselbe
            Abfrage nicht mehrfach nach außen geht — 60 Sekunden für DNS-Ergebnisse,
            30 Minuten für IP-Details, 15 Minuten für PageSpeed, 6 Stunden für
            VirusTotal. Danach verfallen sie. Es gibt keine dauerhafte Speicherung von
            Suchanfragen und keine Zuordnung zu Personen.
          </p>
          <Meta
            basis="Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an der Erbringung
              der abgerufenen Funktion"
            dauer="Nur flüchtig im Arbeitsspeicher, siehe Zeiten oben; nach einem
              Neustart des Servers leer."
          />
          <p className="mt-3 text-xs text-ink-900/50 dark:text-ink-50/50">
            Zu beachten: eine abgefragte Domain kann im Einzelfall selbst
            personenbezogen sein — etwa bei einer Domain aus Vor- und Nachnamen. Prüfe
            bitte selbst, welche Domains du abfragst.
          </p>
        </Section>

        <Section title="Empfänger">
          <p className="mb-4">
            Übermittelt wird jeweils nur die abgefragte Domain bzw. IP-Adresse. Dienste
            mit Sitz in den USA sind gekennzeichnet; die Übermittlung stützt sich dort
            auf Art. 49 Abs. 1 lit. b DSGVO (Erforderlichkeit zur Erfüllung des von dir
            angeforderten Abrufs) und erfolgt ausschließlich auf deine Eingabe hin.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 dark:border-ink-800">
                  <Th>Dienst</Th>
                  <Th>Wofür</Th>
                  <Th>Sitz</Th>
                </tr>
              </thead>
              <tbody className="text-ink-900/70 dark:text-ink-50/70">
                <Row service="Cloudflare, Google, AdGuard, DNS.SB, NextDNS" purpose="DNS-Auflösung, Propagations-Vergleich, DNSSEC" region="USA / EU" />
                <Row service="rdap.org, DENIC, Verisign" purpose="WHOIS/RDAP und Verfügbarkeits-Check" region="EU / USA" />
                <Row service="Google PageSpeed Insights" purpose="Performance-Analyse — nur auf Klick" region="USA" />
                <Row service="VirusTotal (Google)" purpose="Reputations-Check — nur auf Klick" region="USA" />
                <Row service="ipwhois.app" purpose="Geolocation und ASN zu einer IP-Adresse" region="EU" />
                <Row service="Der Zielserver selbst" purpose="TLS-Zertifikat und Tech-Stack-Erkennung" region="je nach Domain" />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-900/50 dark:text-ink-50/50">
            PageSpeed und VirusTotal laufen nicht automatisch — sie starten erst, wenn du
            den jeweiligen Tab öffnest und den Check ausdrücklich anstößt.
          </p>
        </Section>

        <Section title="Kontaktformular">
          <p>
            Name, E-Mail-Adresse und Nachricht werden ausschließlich zur Beantwortung
            deiner Anfrage verwendet und per E-Mail an den Verantwortlichen zugestellt.
            An die angegebene Adresse geht eine Empfangsbestätigung — bewusst ohne
            Wiedergabe deiner Nachricht, damit das Formular nicht als Transportmittel für
            fremde Inhalte missbraucht werden kann.
          </p>
          <Meta
            basis="Art. 6 Abs. 1 lit. f DSGVO (Beantwortung der Anfrage); bei
              vertragsbezogenen Anfragen Art. 6 Abs. 1 lit. b DSGVO"
            dauer="Die Nachricht bleibt im Mail-Postfach, solange es für die Bearbeitung
              und mögliche Rückfragen nötig ist, und wird danach gelöscht."
          />
          <p className="mt-3">
            Zum Spam-Schutz werden zusätzlich verarbeitet, jeweils nur im
            Arbeitsspeicher und ohne dauerhafte Speicherung:
          </p>
          <ul className="mt-2 space-y-1.5">
            <Bullet>
              ein Zähler der Absendeversuche pro IP-Adresse — höchstens 24 Stunden
            </Bullet>
            <Bullet>
              eine Prüfsumme über Adresse und Nachrichtentext zur Erkennung von
              Doppel-Absendungen — 5 Minuten
            </Bullet>
            <Bullet>
              ein Vermerk, an welche Adresse zuletzt eine Bestätigung ging, um wiederholte
              Zustellungen an dieselbe Adresse zu verhindern — 24 Stunden
            </Bullet>
          </ul>
        </Section>

        <Section title="Speicherung in deinem Browser">
          <p>
            diggy legt zwei Einträge im{' '}
            <span className="font-mono text-xs">localStorage</span> ab:{' '}
            <span className="font-mono text-xs">diggy-lookup-history</span> mit deinen
            letzten zehn Abfragen und{' '}
            <span className="font-mono text-xs">diggy-theme</span> mit der Einstellung
            Hell/Dunkel. Beides bleibt in deinem Browser und wird nicht an den Server
            übertragen. Über „History löschen“ oder das Löschen der Websitedaten bist du
            beides los.
          </p>
          <p className="mt-3">
            Cookies setzt die Seite nicht. Diese beiden Einträge sind für die von dir
            aufgerufenen Funktionen erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG), eine
            Einwilligung ist dafür nicht nötig.
          </p>
        </Section>

        <Section title="Keine automatisierte Entscheidungsfindung">
          <p>
            Der Health-Score entsteht aus fest programmierten Regeln und bewertet die
            technische Konfiguration einer Domain — nicht eine Person. Eine automatisierte
            Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt, ebenso kein
            Profiling. Die Anwendung setzt keine KI-Systeme ein; die technische
            Einordnung dazu steht in{' '}
            <span className="font-mono text-xs">docs/COMPLIANCE.md</span> im
            Quellcode-Repository.
          </p>
        </Section>

        <Section title="Deine Rechte">
          <p>Du hast jederzeit das Recht auf</p>
          <ul className="mt-2 space-y-1.5">
            <Bullet>Auskunft über die zu dir verarbeiteten Daten (Art. 15 DSGVO)</Bullet>
            <Bullet>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</Bullet>
            <Bullet>Löschung (Art. 17 DSGVO)</Bullet>
            <Bullet>Einschränkung der Verarbeitung (Art. 18 DSGVO)</Bullet>
            <Bullet>Datenübertragbarkeit (Art. 20 DSGVO)</Bullet>
            <Bullet>
              Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen
              (Art. 21 DSGVO)
            </Bullet>
          </ul>
          <p className="mt-3">
            Für alles genügt eine E-Mail an die oben genannte Adresse. Außerdem kannst du
            dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).
            Zuständig für den Verantwortlichen ist die Landesbeauftragte für Datenschutz
            und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2–4,
            40213 Düsseldorf (Postfach 20 04 44, 40102 Düsseldorf).
          </p>
        </Section>

        <p className="border-t border-ink-100 pt-6 text-xs text-ink-900/45 dark:border-ink-900/80 dark:text-ink-50/45">
          Stand: {LAST_UPDATED}. Diese Hinweise werden angepasst, wenn sich die
          Verarbeitung ändert.
        </p>
      </div>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-900/50 dark:text-ink-50/50">
        {title}
      </h2>
      <div className="text-sm leading-relaxed text-ink-900/75 dark:text-ink-50/75">{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-ink-900/30 dark:bg-ink-50/30" />
      <span>{children}</span>
    </li>
  );
}

/** Rechtsgrundlage und Speicherdauer, optisch abgesetzt vom Fließtext. */
function Meta({ basis, dauer }: { basis: string; dauer: string }) {
  return (
    <dl className="mt-3 space-y-1 rounded-xl bg-ink-100/50 px-4 py-3 text-xs dark:bg-ink-950/40">
      <div>
        <dt className="inline font-medium text-ink-900/60 dark:text-ink-50/60">
          Rechtsgrundlage:
        </dt>{' '}
        <dd className="inline text-ink-900/70 dark:text-ink-50/70">{basis}</dd>
      </div>
      <div>
        <dt className="inline font-medium text-ink-900/60 dark:text-ink-50/60">
          Speicherdauer:
        </dt>{' '}
        <dd className="inline text-ink-900/70 dark:text-ink-50/70">{dauer}</dd>
      </div>
    </dl>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-ink-900/45 dark:text-ink-50/45">
      {children}
    </th>
  );
}

function Row({
  service,
  purpose,
  region,
}: {
  service: string;
  purpose: string;
  region: string;
}) {
  return (
    <tr className="border-b border-ink-100 last:border-0 dark:border-ink-900/60">
      <td className="py-2.5 pr-4 align-top">{service}</td>
      <td className="py-2.5 pr-4 align-top">{purpose}</td>
      <td className="py-2.5 align-top whitespace-nowrap text-ink-900/55 dark:text-ink-50/55">
        {region}
      </td>
    </tr>
  );
}
