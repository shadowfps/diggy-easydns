/**
 * Kennungen für Texte, die der Server liefert (#86).
 *
 * Der Server schreibt seine Findings und Fehlermeldungen weiter auf Deutsch —
 * alte Clients und die API bleiben damit unverändert. Zusätzlich trägt jedes
 * Finding eine Text-Kennung und die Werte, die im Satz stehen (Tage, Domain,
 * Version). Der Client setzt daraus die englische Fassung zusammen; kennt er
 * eine Kennung nicht oder fehlt ein Wert, zeigt er den deutschen Text.
 *
 * Nur Typen: der Client importiert nichts davon zur Laufzeit. Die Listen hier
 * sind der Vertrag — eine neue Kennung im Server scheitert am Compiler, bis
 * sie hier steht, und dann am englischen Wörterbuch, bis sie übersetzt ist.
 */

/**
 * Werte, die in einen Text eingesetzt werden: `{count}` → `params.count`.
 * Ein Wert kann selbst ein Satzbaustein sein (siehe `Phrase`).
 */
export type TextParams = Record<string, string | number | Phrase>;

/**
 * Ein Satzbaustein aus shared/ oder dem Server: „p=foo ist ungültig“,
 * „Zeitüberschreitung“. Server und Client setzen ihn in längere Sätze ein
 * (Findings, Mail-Tab), deshalb reist er als Text plus Werte statt fertig.
 *
 * `text` ist der deutsche Satz mit Platzhaltern und zugleich sein Schlüssel
 * im Wörterbuch der Oberfläche (src/i18n/de.ts), wie bei `t()`. Auf Deutsch
 * setzt `germanText()` (shared/phrase.ts) die Werte ein, im Client
 * übersetzt `phraseText()`.
 */
export interface Phrase {
  text: PhraseText;
  params?: TextParams;
}

/**
 * Alle Satzbausteine — der deutsche Text ist ihr Schlüssel. `DeText` in
 * src/i18n/de.ts schließt diese Liste ein, `en.ts` muss sie also übersetzen;
 * `phrase()` nimmt nur Texte von hier. Ein neuer Baustein scheitert so am
 * Compiler, bis er hier steht und dann, bis er übersetzt ist.
 *
 * Kommt ein Baustein vom Server, den der Client nicht kennt (neuerer Server),
 * bleibt der Satz zur Laufzeit trotzdem deutsch — der Typ gilt nur für den
 * eigenen Code.
 */
export type PhraseText =
  | 'Zeitüberschreitung'
  | 'SERVFAIL'
  | 'Netzwerkfehler'
  | 'Abfrage gescheitert'
  | 'p= fehlt'
  | '{tag}= ist leer'
  | '{tag}={value} ist ungültig'
  | '{count} DMARC-Records statt einem'
  | 'p= ungültig'
  | 'sp= ungültig'
  | '{count} Records'
  | 'Bei mehr als einem DMARC-Record wenden Empfänger DMARC gar nicht an (RFC 7489 §6.6.3) — als gäbe es keins.'
  | 'Ein ungültiges sp= macht den ganzen Record ungültig, auch p={declared}. Weil rua= eine Report-Adresse nennt, werten Empfänger ihn wie p=none (RFC 7489 §6.6.3): Fälschungen werden gemeldet, aber nicht abgelehnt.'
  | 'Ein ungültiges sp= macht den ganzen Record ungültig, auch p={declared}. Ohne gültige Report-Adresse in rua= ignorieren Empfänger ihn (RFC 7489 §6.6.3) — als gäbe es kein DMARC.'
  | 'Ohne gültiges p= werten Empfänger den Record wie p=none, weil rua= eine Report-Adresse nennt (RFC 7489 §6.6.3): Fälschungen werden gemeldet, aber nicht abgelehnt.'
  | 'Ohne gültiges p= und ohne gültige Report-Adresse in rua= ignorieren Empfänger den Record (RFC 7489 §6.6.3) — als gäbe es kein DMARC.'
  | 'Die Version muss genau v={version} lauten, nicht v={leading}'
  | 'v={version} muss als erstes Tag stehen'
  | 'v={version} fehlt am Anfang'
  | '{count} BIMI-Records — es darf nur einen geben'
  | 'l= fehlt — das Tag ist Pflicht, zum Verzichten leer'
  | 'l= ist leer, a= aber gesetzt — ohne Logo-URL zeigen Empfänger kein Logo'
  | 'Die Logo-URL in l= muss mit https:// beginnen'
  | 'Das Logo muss ein SVG sein (SVG Tiny PS), kein Pixelbild'
  | 'Die Zertifikats-URL in a= muss mit https:// beginnen'
  | 'kein DMARC-Record'
  | 'DMARC wirkt wie p=none ({problem})'
  | 'DMARC wirkt nicht ({problem})'
  | 'DMARC p=none'
  | 'DMARC p=quarantine mit pct={pct}'
  | 'DMARC sp=none'
  | '{count} TLS-RPT-Records — RFC 8460 verlangt genau einen'
  | 'rua= fehlt — ohne Ziel verschickt niemand Berichte'
  | '„{uri}“ ist kein Berichtsziel — erlaubt sind mailto: und https:'
  | 'Die Abfrage lief in eine Zeitüberschreitung.'
  | 'Der Resolver antwortete mit SERVFAIL — meist vorübergehend, manchmal ein Zeichen für gestörte Nameserver der Domain.'
  | 'Die Abfrage scheiterte an einem Netzwerkfehler.'
  | 'Nicht alle gängigen Selectors ließen sich abfragen. {detail}'
  | 'Der Resolver antwortete auf die DS- oder DNSKEY-Abfrage mit SERVFAIL. Das kann vorübergehend sein. Bleibt es dabei, steckt meist eine fehlerhafte DNSSEC-Signatur dahinter — dann scheitern validierende Resolver an der ganzen Domain.'
  | 'Die DS- oder DNSKEY-Abfrage blieb unbeantwortet. {detail}'
  | 'Port 443 hat den TLS-Handshake nicht rechtzeitig abgeschlossen — ein überlasteter Server oder eine Firewall, die den Port stumm verwirft.'
  | 'Die Adresse des Hosts ließ sich gerade nicht auflösen (SERVFAIL oder Resolver-Timeout).'
  | 'Der Host war über das Netz nicht erreichbar.'
  | 'ohne echte Mails geht dabei nichts verloren. Reports (rua) nur an eine Adresse auf einer anderen Domain: diese hier nimmt keine Mails an.'
  | 'Mit p=none läuft erstmal nur Reporting, ohne abzulehnen.'
  | 'Ohne echte Mails geht beim Ablehnen nichts verloren: direkt auf p=reject wechseln.'
  | 'Sobald Reports stabil aussehen: auf quarantine wechseln.'
  | 'Lass nur einen DMARC-Record stehen und entferne die übrigen. Brauchst du Report-Adressen aus mehreren, trag sie kommagetrennt in das rua= des einen ein.'
  | 'Entferne sp= und setz p=reject — ohne echte Mails geht dabei nichts verloren, und ohne sp= gilt p= auch für Subdomains.'
  | 'Entferne sp= oder setz es auf none, quarantine oder reject — ohne sp= gilt p={target} auch für Subdomains.'
  | 'Ersetze den Record durch einen mit p=reject direkt hinter v=DMARC1 — {advice}'
  | 'Ersetze den Record durch einen mit p= direkt hinter v=DMARC1: none, quarantine oder reject. {advice}'
  | 'Trag p=reject direkt hinter v=DMARC1 ein — ohne echte Mails geht dabei nichts verloren.'
  | 'Trag p= direkt hinter v=DMARC1 ein. p=none hält fest, was Empfänger heute schon tun; danach Schritt für Schritt verschärfen.'
  | 'ein SPF, das niemanden senden lässt (v=spf1 -all)'
  | 'DMARC mit p=reject (jetzt: {flaw})'
  | 'DMARC mit p=reject für alle Mails (jetzt pct={pct})'
  | 'DMARC mit p=reject (jetzt p={policy})'
  | 'DMARC mit p=reject'
  | '{first} und {second}';

/**
 * Text-Kennung eines Findings. Meist gleich der `id`; abweichend, wenn eine
 * `id` mehrere Sätze kennt (Apex oder Host, mit oder ohne MX) oder selbst
 * dynamisch ist (`spf-issue-…`).
 */
export type FindingKey =
  // Gescheiterte Checks (#101), für alle Bereiche gleich
  | 'unchecked'
  // DNS-Basics
  | 'no-records'
  | 'no-address'
  | 'no-address-host'
  | 'no-ipv6'
  | 'no-ipv6-host'
  | 'no-ns'
  | 'no-caa'
  | 'caa-present'
  // Mail
  | 'no-spf'
  | 'no-spf-no-mx'
  | SpfIssueKey
  | 'spf-issue'
  | 'spf-ok'
  | 'no-dmarc'
  | 'no-dmarc-null-mx'
  | 'dmarc-ignored'
  | 'dmarc-policy-none'
  | 'dmarc-as-none'
  | 'dmarc-sp-invalid'
  | 'dmarc-present'
  | 'no-dkim-found'
  | 'dkim-present'
  | 'no-mta-sts'
  | 'no-tls-rpt'
  | 'no-tls-rpt-mta-sts'
  | 'tls-rpt-invalid'
  | 'tls-rpt-present'
  | 'bimi-needs-dmarc'
  | 'no-bimi'
  | 'bimi-invalid'
  | 'bimi-dmarc-weak'
  | 'bimi-present'
  | 'bimi-present-no-vmc'
  | 'null-mx'
  | 'null-mx-complete'
  | 'null-mx-incomplete'
  // DNSSEC
  | 'dnssec-off'
  | 'dnssec-incomplete'
  | 'dnssec-invalid'
  | 'dnssec-valid'
  | 'dnssec-valid-no-algorithm'
  // SSL
  | 'no-ssl'
  | 'ssl-invalid'
  | 'ssl-expired'
  | 'ssl-expiring-soon'
  | 'ssl-ok'
  | 'ssl-old-tls'
  // Propagation
  | 'propagation-mismatch'
  | 'propagation-mismatch-entry'
  | 'propagation-consistent'
  | 'propagation-consistent-entry'
  // WHOIS
  | 'domain-expired'
  | 'domain-expiring-critical'
  | 'domain-expiring-soon'
  | 'whois-status-clienthold'
  | 'whois-status-serverhold'
  | 'whois-status-pendingdelete'
  | 'whois-status-pendingrestore'
  | 'whois-status-redemptionperiod'
  | 'domain-young';

/** Probleme eines SPF-Records — als Finding und in der Mail-Ansicht. */
export type SpfIssueKey =
  | 'spf-lookups-over-limit'
  | 'spf-lookups-near-limit'
  | 'spf-plus-all'
  | 'spf-no-all';

/** Kennung plus Werte — die übersetzbare Form eines deutschen Satzes. */
export interface TextRef<K extends string = string> {
  key: K;
  params?: TextParams;
}

/**
 * Fehlercodes im JSON-Body (`{ error, message }`). Der Client übersetzt
 * nach Code; `params` liefert der Server, wo die Meldung Werte enthält.
 */
export type ApiErrorCode =
  | 'cross_site_denied'
  | 'cross_origin_denied'
  | 'rate_limited'
  | 'quota_rate_limited'
  | 'server_busy'
  | 'not_a_hostname'
  | 'invalid_domain'
  | 'blocked_target'
  | 'invalid_ip'
  | 'domain_not_found'
  | 'invalid_query'
  | 'invalid_record_type'
  | 'lookup_failed'
  | 'propagation_failed'
  | 'authoritative_failed'
  | 'dnssec_failed'
  | 'ssl_failed'
  | 'mail_failed'
  | 'whois_failed'
  | 'techstack_failed'
  | 'ip_details_failed'
  | 'pagespeed_failed'
  | 'virusscan_failed'
  | 'domain_check_failed'
  | 'contact_not_configured'
  | 'contact_rate_limited'
  | 'contact_challenge_failed'
  | 'contact_invalid_input'
  | 'contact_failed';
