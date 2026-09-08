import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

/**
 * Datenschutzhinweise.
 *
 * Inhaltlich beschreibt die Seite exakt, was der Code tatsächlich tut — die
 * Empfänger-Tabelle ist aus den Service-Modulen abgeleitet, die Speicherdauern
 * aus den Konstanten in contactSpamGuard.ts und lib/cache.ts. Wer dort etwas
 * ändert, muss diese Seite mitziehen.
 *
 * Kein Ersatz für eine juristische Prüfung — die Angaben sind technisch
 * korrekt, die rechtliche Bewertung gehört fachlich abgesegnet.
 */
export function DatenschutzView() {
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
          Was diggy verarbeitet, warum, und was dabei an Dritte geht.
        </p>
      </div>

      <div className="surface space-y-8 rounded-2xl p-6 md:p-8">
        <Section title="Verantwortlicher">
          <p>
            Ruben Yannik Riesen, An Wehes Hof 1, 32369 Rahden, Deutschland.
            Kontakt:{' '}
            <a href="mailto:hallo@cavara.dev" className="underline-offset-2 hover:underline">
              hallo@cavara.dev
            </a>
            . Vollständige Angaben im{' '}
            <span className="text-ink-900/80 dark:text-ink-50/80">Impressum</span>.
          </p>
        </Section>

        <Section title="Keine Konten, kein Tracking">
          <p>
            diggy hat keine Registrierung, kein Analytics, keine Werbe- oder
            Tracking-Cookies und keine Einbindung sozialer Netzwerke. Die Schriftarten
            werden lokal vom eigenen Server ausgeliefert — es gibt keine Verbindung zu
            Google Fonts oder einem anderen CDN.
          </p>
        </Section>

        <Section title="Server-Logs">
          <p>
            Beim Abruf der Seite fallen technisch notwendige Verbindungsdaten an
            (IP-Adresse, Zeitpunkt, angefragter Pfad). Rechtsgrundlage ist Art. 6 Abs. 1
            lit. f DSGVO — berechtigtes Interesse am sicheren Betrieb.
          </p>
        </Section>

        <Section title="Abgefragte Domains und IP-Adressen">
          <p>
            Was du in die Suche eingibst, wird an die unten genannten Stellen
            weitergegeben, weil ein DNS-, SSL- oder WHOIS-Check ohne Rückfrage bei den
            zuständigen Servern nicht möglich ist. Ergebnisse werden serverseitig kurz
            zwischengespeichert (60 Sekunden, IP-Details 30 Minuten), um dieselbe Abfrage
            nicht mehrfach nach außen zu schicken. Es gibt keine dauerhafte Speicherung
            und keine Zuordnung von Suchanfragen zu Personen.
          </p>
        </Section>

        <Section title="Empfänger">
          <p className="mb-4">
            Für die einzelnen Checks werden diese Dienste angefragt. Übermittelt wird
            jeweils nur die abgefragte Domain bzw. IP-Adresse — nie deine eigene
            IP-Adresse, weil die Anfragen vom Server ausgehen, nicht aus deinem Browser.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 dark:border-ink-800">
                  <Th>Dienst</Th>
                  <Th>Wofür</Th>
                </tr>
              </thead>
              <tbody className="text-ink-900/70 dark:text-ink-50/70">
                <Row service="Cloudflare, Google, AdGuard, DNS.SB, NextDNS" purpose="DNS-Auflösung und Propagation-Vergleich" />
                <Row service="rdap.org, DENIC, Verisign" purpose="WHOIS/RDAP und Verfügbarkeits-Check" />
                <Row service="Google PageSpeed Insights" purpose="Performance-Analyse (nur auf Klick)" />
                <Row service="VirusTotal" purpose="Reputations-Check (nur auf Klick)" />
                <Row service="ipwhois.app" purpose="Geolocation und ASN zu einer IP-Adresse" />
                <Row service="Der Zielserver selbst" purpose="TLS-Zertifikat und Tech-Stack-Erkennung" />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Kontaktformular">
          <p>
            Name, E-Mail-Adresse und Nachricht werden ausschließlich zur Beantwortung
            verwendet und per E-Mail an den Verantwortlichen zugestellt. Rechtsgrundlage
            ist Art. 6 Abs. 1 lit. f DSGVO. An die angegebene Adresse geht eine
            Empfangsbestätigung. Die Daten bleiben so lange im Mail-Postfach, wie es für
            die Bearbeitung nötig ist.
          </p>
          <p className="mt-3">
            Zum Spam-Schutz wird deine IP-Adresse für maximal 24 Stunden im
            Arbeitsspeicher gezählt (Anzahl der Absendeversuche) und eine Prüfsumme über
            Adresse und Nachrichtentext für 5 Minuten vorgehalten, um Doppel-Absendungen
            zu erkennen. Beides wird nicht dauerhaft gespeichert und ist nach einem
            Neustart des Servers weg.
          </p>
        </Section>

        <Section title="Speicherung in deinem Browser">
          <p>
            diggy legt zwei Einträge im{' '}
            <span className="font-mono text-xs">localStorage</span> ab —{' '}
            <span className="font-mono text-xs">diggy-lookup-history</span> (deine letzten
            zehn Abfragen) und <span className="font-mono text-xs">diggy-theme</span>{' '}
            (Hell/Dunkel). Beides bleibt in deinem Browser und wird nicht an den Server
            übertragen. Über „History löschen“ oder das Löschen der Websitedaten bist du
            beides los.
          </p>
        </Section>

        <Section title="Deine Rechte">
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie
            das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Für
            Anliegen genügt eine E-Mail an die oben genannte Adresse.
          </p>
        </Section>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-ink-900/45 dark:text-ink-50/45">
      {children}
    </th>
  );
}

function Row({ service, purpose }: { service: string; purpose: string }) {
  return (
    <tr className="border-b border-ink-100 last:border-0 dark:border-ink-900/60">
      <td className="py-2.5 pr-4 align-top">{service}</td>
      <td className="py-2.5 align-top">{purpose}</td>
    </tr>
  );
}
