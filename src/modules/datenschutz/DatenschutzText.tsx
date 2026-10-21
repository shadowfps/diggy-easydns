// i18n-ignore-file: Rechtstext, bleibt aus rechtlichen Gründen deutsch (#86).

/**
 * Datenschutzhinweise.
 *
 * Die Angaben sind aus dem Code abgeleitet, nicht aus einem Generator: die
 * Empfänger-Tabelle stammt aus den Service-Modulen, die Speicherdauern aus den
 * Konstanten in lib/cache.ts, lib/rateLimit.ts und services/contactSpamGuard.ts.
 * Wer dort etwas ändert, muss diese Seite mitziehen — die Tabelle in
 * docs/COMPLIANCE.md hält die Zuordnung fest.
 *
 * Cloudflare vor der Seite (#125) steht nicht im Code, sondern in der
 * DNS-Konfiguration der Domain; Anschrift, DPF-Zertifizierung und DPA sind
 * mit Quellen in docs/COMPLIANCE.md belegt.
 *
 * Kein Ersatz für eine juristische Prüfung. Technisch korrekt, rechtlich
 * unbestätigt.
 */

/*
 * Eigene Datei (#86): der Rechtstext bleibt deutsch und ist als Ganzes vom
 * Prüfskript ausgenommen (`i18n-ignore-file`), der Rahmen in DatenschutzView
 * läuft durch `t()`. Aus dem kritischen Pfad holt ihn App.tsx: die ganze
 * Seite ist ein eigener Chunk.
 */

/** Wird im Footer und im Text als Datumsangabe genutzt. */
const LAST_UPDATED = '21. Oktober 2026';

interface DatenschutzTextProps {
  onOpenImpressum?: () => void;
}

export default function DatenschutzText({ onOpenImpressum }: DatenschutzTextProps) {
  return (
    <div lang="de" className="card">
      <Section title="Verantwortlicher">
        <p>
          Ruben Yannik Riesen, An Wehes Hof 1, 32369 Rahden, Deutschland.
          <br />
          E-Mail:{' '}
          <a href="mailto:hallo@cavara.dev" className="link">
            hallo@cavara.dev
          </a>
          {onOpenImpressum && (
            <>
              {' · '}
              <button type="button" onClick={onOpenImpressum} className="link">
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
            Keine Einbindung von Schriftarten, Skripten oder Inhalten Dritter — alles
            kommt von der eigenen Domain. Ausgeliefert wird die Seite über Cloudflare
            (siehe unten).
          </Bullet>
          <Bullet>Keine Weitergabe zu Werbezwecken, kein Verkauf von Daten.</Bullet>
        </ul>
      </Section>

      <Section title="Aufruf der Seite (Server-Logs)">
        <p>
          Beim Abruf fallen technisch notwendige Verbindungsdaten an: IP-Adresse,
          Zeitpunkt, angefragter Pfad, übertragene Datenmenge, Statuscode, Referrer und
          User-Agent. Diese Daten sind für die Auslieferung erforderlich und dienen der
          Erkennung und Abwehr von Störungen und Missbrauch. Sie fallen bei Cloudflare
          an, das der Seite vorgeschaltet ist, und beim Hosting-Dienstleister — beide
          verarbeiten sie in unserem Auftrag (siehe die nächsten beiden Abschnitte).
        </p>
        <Meta
          basis="Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse am sicheren und
            stabilen Betrieb"
          dauer="Beim Hosting-Dienstleister werden die Logs vorgehalten und regelmäßig
            gelöscht, zu Cloudflare siehe unten. Eine Zusammenführung mit anderen Daten
            findet nicht statt."
        />
      </Section>

      <Section title="Cloudflare (Reverse-Proxy und CDN)">
        <p>
          Der Seite ist Cloudflare vorgeschaltet: Cloudflare, Inc., 101 Townsend St.,
          San Francisco, CA 94107, USA. Jeder Aufruf läuft zuerst über das Netz von
          Cloudflare und wird von dort an den Server beim Hosting-Dienstleister
          weitergeleitet. Cloudflare nimmt die verschlüsselte Verbindung (TLS) entgegen,
          liefert die Seite aus und wehrt Angriffe wie DDoS ab.
        </p>
        <p className="mt-3">
          Dabei verarbeitet Cloudflare deine IP-Adresse und die oben genannten
          Verbindungsdaten. Weil die Verbindung bei Cloudflare entschlüsselt wird,
          verarbeitet Cloudflare auch die Inhalte deiner Anfragen — etwa die gesuchte
          Domain oder deine Angaben im Kontaktformular. Cookies setzt Cloudflare für
          diggy nicht.
        </p>
        <p className="mt-3">
          Scheitert beim Laden die Verbindung, kann dein Browser einen technischen
          Fehlerbericht direkt an Cloudflare schicken (Network Error Logging), mit
          Angaben wie der aufgerufenen Adresse und der Art des Fehlers. Nach Angabe von
          Cloudflare wird die IP-Adresse dabei nur für die Dauer der Anfrage verarbeitet
          und nicht gespeichert.
        </p>
        <p className="mt-3">
          Cloudflare verarbeitet diese Daten in unserem Auftrag (Art. 28 DSGVO).
          Cloudflare, Inc. ist nach dem EU-U.S. Data Privacy Framework zertifiziert; die
          Übermittlung in die USA stützt sich auf den Angemessenheitsbeschluss der
          EU-Kommission vom 10. Juli 2023 (Art. 45 DSGVO). Einzelheiten stehen in der{' '}
          <a
            href="https://www.cloudflare.com/de-de/privacypolicy/"
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            Datenschutzrichtlinie von Cloudflare
          </a>
          .
        </p>
        <Meta
          basis="Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an einer schnellen,
            verschlüsselten und vor Angriffen geschützten Auslieferung der Seite"
          dauer="Feste Fristen nennt Cloudflare nicht; laut seiner Datenschutzrichtlinie
            werden die Daten so lange gespeichert, wie es die jeweiligen Zwecke oder
            gesetzliche Pflichten erfordern."
        />
      </Section>

      <Section title="Hosting">
        <p>
          Die Anwendung läuft bei der Mittwald CM Service GmbH &amp; Co. KG,
          Königsberger Straße 4–6, 32339 Espelkamp, Deutschland. Der Dienstleister
          verarbeitet die oben genannten Verbindungsdaten in unserem Auftrag
          (Art. 28 DSGVO). Die Server der Anwendung stehen in Deutschland.
        </p>
      </Section>

      <Section title="Abgefragte Domains und IP-Adressen">
        <p>
          Was du in die Suche eingibst, wird an die unten genannten Stellen
          weitergegeben — ein DNS-, SSL- oder WHOIS-Check ist ohne Rückfrage bei den
          zuständigen Servern nicht möglich. Die Anfragen gehen dabei{' '}
          <strong className="font-semibold text-fg">
            vom Server aus, nicht aus deinem Browser
          </strong>
          : deine IP-Adresse erfahren diese Dienste über die Abfrage nicht.
        </p>
        <p className="mt-3">
          Ergebnisse werden serverseitig kurz zwischengespeichert, damit dieselbe
          Abfrage nicht mehrfach nach außen geht — bis zu 60 Sekunden für DNS-Ergebnisse,
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
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
          Zu beachten: eine abgefragte Domain kann im Einzelfall selbst
          personenbezogen sein — etwa bei einer Domain aus Vor- und Nachnamen. Prüfe
          bitte selbst, welche Domains du abfragst.
        </p>
      </Section>

      <Section title="Empfänger">
        <p className="mb-4">
          Über Cloudflare als Reverse-Proxy läuft jeder Aufruf der Seite — Einzelheiten
          und Rechtsgrundlage im Abschnitt „Cloudflare (Reverse-Proxy und CDN)“. Für die
          übrigen Dienste gilt: Übermittelt wird jeweils nur die abgefragte Domain bzw.
          IP-Adresse. Dienste mit Sitz außerhalb der EU sind gekennzeichnet. Für die
          Schweiz und Kanada hat die EU-Kommission ein angemessenes Datenschutzniveau
          festgestellt (Art. 45 DSGVO). In die USA und in andere Drittländer ohne
          einen solchen Beschluss stützt sich die Übermittlung auf Art. 49 Abs. 1
          lit. b DSGVO (Erforderlichkeit zur Erfüllung des von dir angeforderten
          Abrufs) und erfolgt ausschließlich auf deine Eingabe hin.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-136 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line-subtle">
                <Th>Dienst</Th>
                <Th>Wofür</Th>
                <Th>Sitz</Th>
              </tr>
            </thead>
            <tbody className="text-fg-muted">
              <Row service="Cloudflare" purpose="Reverse-Proxy/CDN: Auslieferung und Schutz der Seite, bei jedem Aufruf" region="USA" />
              <Row service="Cloudflare (DNS-Resolver)" purpose="TTL der DNS-Records, DNSSEC-Prüfung, Propagations-Vergleich, Nameserver der Zone ermitteln" region="USA" />
              <Row service="Google Public DNS" purpose="DNSSEC-Prüfung, Propagations-Vergleich, Nameserver der Zone ermitteln (falls Cloudflare ausfällt)" region="USA" />
              <Row service="NextDNS, OpenDNS (Cisco)" purpose="Propagations-Vergleich" region="USA" />
              <Row service="Quad9" purpose="Propagations-Vergleich" region="Schweiz" />
              <Row service="Control D" purpose="Propagations-Vergleich" region="Kanada" />
              <Row service="AdGuard DNS, DNS.SB, DNS4EU" purpose="Propagations-Vergleich" region="EU" />
              <Row service="Die Registry der Domain-Endung laut IANA-Verzeichnis — etwa Verisign (.com, .net), Public Interest Registry (.org) und Google (.app, .dev), alle mit Sitz in den USA" purpose="WHOIS/RDAP und Verfügbarkeits-Check" region="je nach Endung" />
              <Row service="DENIC" purpose="WHOIS/RDAP und Verfügbarkeits-Check für .de" region="EU" />
              <Row service="Identity Digital" purpose="WHOIS/RDAP und Verfügbarkeits-Check für .io" region="USA" />
              <Row service="EURid" purpose="WHOIS und Verfügbarkeits-Check für .eu" region="EU" />
              <Row service="rdap.org" purpose="Netz und Betreiber zu einer IP-Adresse (IP-Details); WHOIS/RDAP und Verfügbarkeits-Check nur, solange das IANA-Verzeichnis nicht abrufbar ist" region="USA" />
              <Row service="Google PageSpeed Insights" purpose="Performance-Analyse — nur auf Klick" region="USA" />
              <Row service="VirusTotal (Google)" purpose="Reputations-Check — nur auf Klick" region="USA" />
              <Row service="ipwhois.app" purpose="Geolocation und ASN zu einer IP-Adresse" region="EU" />
              <Row service="Der Zielserver selbst" purpose="TLS-Zertifikat und Tech-Stack-Erkennung" region="je nach Domain" />
              <Row service="Die Nameserver der abgefragten Domain" purpose="Stand der Zone direkt abfragen (DNS über Port 53) — nur im Propagation-Tab" region="je nach Domain" />
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
          Für den Propagations-Vergleich fragt der Server jeden Namen bei allen
          genannten DNS-Resolvern gleichzeitig ab; jeder erhält dabei nur den Namen und
          den Record-Typ. Im Propagation-Tab fragt er zusätzlich die Nameserver, die für
          die Domain eingetragen sind — welche das sind, legt ihr Inhaber fest; auch sie
          erhalten nur Namen und Record-Typ. Für WHOIS und den Verfügbarkeits-Check
          fragt der Server die Registry der jeweiligen Endung direkt; welche das ist,
          steht im öffentlichen RDAP-Verzeichnis der IANA, das der Server einmal am Tag
          lädt — dabei geht nichts über deine Abfrage an die IANA. Für .ch, .at und
          .it fragt er nicht: Die Registry von .ch sperrt automatisierte Abfragen,
          nic.at und Registro .it erlauben die Weitergabe ihrer Daten nur mit
          Genehmigung. Die WHOIS-Ansicht verlinkt dann nur die Web-Abfrage der
          Registry; der Link enthält die Domain nicht. PageSpeed und
          VirusTotal laufen nicht automatisch — sie starten erst, wenn du den
          jeweiligen Tab öffnest und den Check ausdrücklich anstößt.
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
          diggy legt bis zu drei Einträge im{' '}
          <span className="font-mono text-[13px]">localStorage</span> ab:{' '}
          <span className="font-mono text-[13px]">diggy-lookup-history</span> mit deinen
          letzten zehn Abfragen,{' '}
          <span className="font-mono text-[13px]">diggy-theme</span> mit Hell oder Dunkel,
          wenn du das Theme im Menü umschaltest, und{' '}
          <span className="font-mono text-[13px]">diggy-language</span> mit der Sprache,
          wenn du sie im Menü wählst. Solange du Theme und Sprache nicht selbst wählst,
          folgt diggy den Einstellungen deines Browsers und speichert dafür nichts. Alles
          bleibt in deinem Browser und wird nicht an den Server übertragen. Die History
          bist du über „History löschen“ los, alle Einträge über das Löschen der
          Websitedaten.
        </p>
        <p className="mt-3">
          Cookies setzt die Seite nicht, auch nicht über Cloudflare. Diese Einträge sind
          für die von dir aufgerufenen Funktionen erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG),
          eine Einwilligung ist dafür nicht nötig.
        </p>
      </Section>

      <Section title="Keine automatisierte Entscheidungsfindung">
        <p>
          Der Health-Score entsteht aus fest programmierten Regeln und bewertet die
          technische Konfiguration einer Domain — nicht eine Person. Eine automatisierte
          Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt, ebenso kein
          Profiling. Die Anwendung setzt keine KI-Systeme ein; die technische
          Einordnung dazu steht in{' '}
          <span className="font-mono text-[13px]">docs/COMPLIANCE.md</span> im
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

      <p className="mt-6 border-t border-line-subtle pt-6 text-xs text-fg-subtle">
        Stand: {LAST_UPDATED}. Diese Hinweise werden angepasst, wenn sich die
        Verarbeitung ändert.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // Abschnitte trennt Abstand plus feine Linie — der erste steht ohne.
    <section className="mt-6 border-t border-line-subtle pt-6 first:mt-0 first:border-t-0 first:pt-0">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-2.5 size-1 shrink-0 rounded-full bg-fg-subtle" />
      <span>{children}</span>
    </li>
  );
}

/** Rechtsgrundlage und Speicherdauer, optisch abgesetzt vom Fließtext. */
function Meta({ basis, dauer }: { basis: string; dauer: string }) {
  return (
    <dl className="panel mt-3 space-y-1.5 py-3 text-xs leading-relaxed">
      <div>
        <dt className="inline font-semibold text-fg">Rechtsgrundlage:</dt>{' '}
        <dd className="inline text-fg-muted">{basis}</dd>
      </div>
      <div>
        <dt className="inline font-semibold text-fg">Speicherdauer:</dt>{' '}
        <dd className="inline text-fg-muted">{dauer}</dd>
      </div>
    </dl>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-2 pr-4 text-xs font-medium text-fg-subtle">
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
    <tr className="border-b border-line-subtle last:border-0">
      <td className="py-2.5 pr-4 align-top text-fg">{service}</td>
      <td className="py-2.5 pr-4 align-top">{purpose}</td>
      <td className="whitespace-nowrap py-2.5 align-top text-fg-subtle">
        {region}
      </td>
    </tr>
  );
}
