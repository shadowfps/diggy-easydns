import type {
  DnsRecord,
  DnssecInfo,
  Finding,
  LookupFailure,
  MailSecurity,
  ResolverResult,
  SslInfo,
  WhoisInfo,
} from '../types.js';
import { isDnsOnlyName } from '../../shared/dnsName.js';
import { lookupFailureLabel } from '../../shared/lookupFailure.js';
import { dmarcPct, noMailProtection } from '../../shared/nullMx.js';
import { bimiDmarcGap } from '../../shared/bimiTlsRpt.js';

/* ─── Gescheiterte Checks ─────────────────────────────────────────────── */

const FAILURE_DETAIL: Record<LookupFailure, string> = {
  timeout: 'Die Abfrage lief in eine Zeitüberschreitung.',
  servfail:
    'Der Resolver antwortete mit SERVFAIL — meist vorübergehend, manchmal ein Zeichen für gestörte Nameserver der Domain.',
  network: 'Die Abfrage scheiterte an einem Netzwerkfehler.',
};

/**
 * Hinweis „konnte nicht geprüft werden“ statt „fehlt“ (#101).
 *
 * Ein Timeout oder SERVFAIL sagt nichts über die Domain. Als „fehlt“
 * gemeldet, zog er Punkte ab, und wer zweimal prüfte, bekam für dieselbe
 * Domain zwei Scores. `unchecked` hält ihn aus dem Score (shared/scoring.ts).
 */
function uncheckedFinding(
  id: string,
  category: Finding['category'],
  check: string,
  reason: LookupFailure,
  detail = FAILURE_DETAIL[reason]
): Finding {
  return {
    id,
    severity: 'info',
    title: `${check} konnte nicht geprüft werden — ${lookupFailureLabel(reason)}`,
    description: `${detail} Ohne Antwort gibt es keine Bewertung und keinen Punktabzug — später erneut prüfen.`,
    category,
    unchecked: true,
  };
}

/* ─── DNS-Basics ──────────────────────────────────────────────────────── */

/**
 * Findings, die eine Domain aus dem DNS verschwinden lassen.
 *
 * Läuft eine Domain ab oder wird sie auf Hold gesetzt, zieht die Registry die
 * Delegation ein: dann fehlen zwangsläufig sowohl Adress- als auch
 * NS-Records. Beide Findings sind wahr und werden angezeigt, kosten aber keine
 * zusätzlichen Score-Punkte, weil die Ursache schon gemeldet ist.
 */
const DOMAIN_LIFECYCLE_CAUSES = [
  'domain-expired',
  'whois-status-clienthold',
  'whois-status-serverhold',
  'whois-status-pendingdelete',
  // Beide beschreiben eine abgelaufene Domain und ziehen dieselbe Folge nach
  // sich. Sie fehlten hier, waren aber der einzige Weg, auf dem der alte
  // Dreifach-Abzug übrig blieb: `whoisFindings` unterdrückt sie nur, wenn
  // `domain-expired` selbst gemeldet wurde — und das hängt an `expiresAt`.
  // Fehlt das Feld im RDAP-Datensatz (kommt bei einigen Registries vor),
  // steht der Status-Code allein da und `no-address`/`no-ns` deduplizierten
  // gegen nichts.
  'whois-status-redemptionperiod',
  'whois-status-pendingrestore',
];

export function dnsFindings(records: DnsRecord[], domain: string, apexDomain: string): Finding[] {
  const findings: Finding[] = [];

  // `s1._domainkey.example.com` ist kein Host — fehlende A/AAAA-Records sind
  // dort der Normalfall, kein Befund. Wer so einen Namen nachschlägt, will
  // wissen, ob der Eintrag existiert.
  if (isDnsOnlyName(domain)) {
    if (records.length === 0) {
      findings.push({
        id: 'no-records',
        severity: 'critical',
        title: 'Kein Eintrag unter diesem Namen',
        description: `Unter ${domain} liegt kein DNS-Record. Steht dort ein DKIM-Schlüssel, eine DMARC-Policy oder ein Challenge-Token, ist er nicht (mehr) veröffentlicht — oder der Name ist vertippt.`,
        category: 'dns',
        causedBy: DOMAIN_LIFECYCLE_CAUSES,
      });
    }
    return findings;
  }
  const types = new Set(records.map((r) => r.type));
  const isApex = domain === apexDomain;
  const hostLabel = domain;

  if (!types.has('A') && !types.has('AAAA') && !types.has('CNAME')) {
    findings.push({
      id: 'no-address',
      severity: 'critical',
      title: 'Keine A/AAAA/CNAME-Records gefunden',
      description: isApex
        ? 'Die Domain löst zu keiner IP auf. Besucher können die Seite nicht erreichen.'
        : `Der Hostname ${domain} löst zu keiner IP auf. Besucher können diesen Host nicht erreichen.`,
      category: 'dns',
      causedBy: DOMAIN_LIFECYCLE_CAUSES,
    });
  }

  if (!types.has('AAAA')) {
    findings.push({
      id: 'no-ipv6',
      severity: 'info',
      title: 'Kein IPv6 (AAAA-Record)',
      description: isApex
        ? 'Domain ist nur über IPv4 erreichbar. IPv6 verbessert Erreichbarkeit für moderne Netzwerke.'
        : `${domain} ist nur über IPv4 erreichbar.`,
      category: 'dns',
    });
  }

  if (isApex && !types.has('NS')) {
    findings.push({
      id: 'no-ns',
      severity: 'critical',
      title: 'Keine Nameserver gefunden',
      description: 'Ohne NS-Records ist die Domain nicht aufgelöst. Vermutlich abgelaufen oder fehlerhaft delegiert.',
      category: 'dns',
      // Die Beschreibung sagt es selbst: "vermutlich abgelaufen". Ist der
      // Ablauf per WHOIS bestätigt, ist das hier die Folge davon.
      causedBy: DOMAIN_LIFECYCLE_CAUSES,
    });
  }

  if (isApex && !types.has('CAA')) {
    findings.push({
      id: 'no-caa',
      severity: 'info',
      title: 'Kein CAA-Record',
      description: 'Mit CAA-Records legst du fest, welche Certificate Authorities für deine Domain Zertifikate ausstellen dürfen — ein einfacher Schutz gegen Mis-Issuance.',
      fix: {
        explanation: 'Lege einen CAA-Record an, der nur deine genutzte CA erlaubt.',
        snippet: `${hostLabel}  CAA  0 issue "letsencrypt.org"`,
      },
      category: 'security',
    });
  } else if (isApex) {
    findings.push({
      id: 'caa-present',
      severity: 'success',
      title: 'CAA-Record vorhanden',
      description: 'Nur autorisierte Certificate Authorities dürfen für diese Domain Zertifikate ausstellen.',
      category: 'security',
    });
  }

  return findings;
}

/* ─── Mail ────────────────────────────────────────────────────────────── */

export function mailFindings(mail: MailSecurity, apexDomain: string): Finding[] {
  const findings: Finding[] = [];
  // Ein Null-MX ist zwar ein MX-Record, sagt aber das Gegenteil eines
  // normalen: hier kommt keine Mail an. Für alles, was am Empfang hängt,
  // zählt er deshalb wie gar kein MX (Regel: shared/nullMx.ts).
  const receivesMail = mail.hasMx && !mail.nullMx;

  // Wenn keine MX → nicht für Mail eingerichtet, aber wir prüfen trotzdem
  // Spoofing-Schutz (jemand kann ja in deinem Namen Mails versenden, auch
  // wenn du nicht empfängst).

  if (mail.spf.lookupFailed) {
    findings.push(uncheckedFinding('spf-unchecked', 'mail', 'SPF', mail.spf.lookupFailed));
  } else if (!mail.spf.present) {
    findings.push({
      id: 'no-spf',
      severity: receivesMail ? 'warning' : 'info',
      title: 'Kein SPF-Record gefunden',
      description: receivesMail
        ? 'Die Domain empfängt Mails (MX vorhanden), aber ohne SPF können andere Server in deinem Namen versenden.'
        : 'Auch ohne aktive Mail-Zustellung schützt SPF (mit -all) gegen Spoofing in deinem Namen.',
      fix: {
        explanation: 'Lege einen SPF-Record als TXT-Record auf der Domain an.',
        snippet: receivesMail
          ? `${apexDomain}  TXT  "v=spf1 mx ~all"`
          : `${apexDomain}  TXT  "v=spf1 -all"`,
      },
      category: 'mail',
    });
  } else {
    for (const issue of mail.spf.issues) {
      findings.push({
        id: spfIssueId(issue),
        severity: issue.includes('+all') ? 'critical' : 'warning',
        title: 'SPF-Record problematisch',
        description: issue,
        category: 'mail',
      });
    }
    if (mail.spf.issues.length === 0) {
      findings.push({
        id: 'spf-ok',
        severity: 'success',
        title: 'SPF-Record vorhanden und plausibel',
        description: `${mail.spf.lookupCount ?? 0} DNS-Lookups, gültiger Abschluss.`,
        category: 'mail',
      });
    }
  }

  if (mail.dmarc.lookupFailed) {
    findings.push(uncheckedFinding('dmarc-unchecked', 'mail', 'DMARC', mail.dmarc.lookupFailed));
  } else if (!mail.dmarc.present) {
    findings.push({
      id: 'no-dmarc',
      severity: receivesMail ? 'warning' : 'info',
      title: 'Kein DMARC-Record auf _dmarc.<domain>',
      description: 'Ohne DMARC können Angreifer leichter E-Mails in deinem Namen verschicken (Spoofing).',
      // Der übliche Vorschlag passt nicht zu einem Null-MX: die Report-Adresse
      // läge auf der Domain selbst, die keine Mail annimmt. Und weil es keine
      // echten Mails gibt, die verloren gehen könnten, gibt es auch keinen
      // Grund, mit p=none oder quarantine vorsichtig anzufangen.
      fix: mail.nullMx
        ? {
            explanation: 'Lege einen DMARC-Record mit p=reject an — ohne echte Mails geht dabei nichts verloren. Reports (rua) nur an eine Adresse auf einer anderen Domain: diese hier nimmt keine Mails an.',
            snippet: `_dmarc.${apexDomain}  TXT  "v=DMARC1; p=reject"`,
          }
        : {
            explanation: 'Lege einen DMARC-Record an. Mit p=none läuft erstmal nur Reporting, ohne abzulehnen.',
            snippet: `_dmarc.${apexDomain}  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@${apexDomain}"`,
          },
      category: 'mail',
    });
  } else {
    const policy = mail.dmarc.policy;
    if (policy === 'none') {
      findings.push({
        id: 'dmarc-policy-none',
        severity: 'warning',
        title: 'DMARC-Policy ist p=none (nur Reporting)',
        // Bei einem Null-MX gibt es keine echten Mails, die beim Ablehnen
        // verloren gehen könnten — der Zwischenschritt über quarantine
        // widerspräche dem Hinweis null-mx-incomplete (p=reject).
        description: mail.nullMx
          ? 'Mit p=none werden Spoofing-Versuche zwar gemeldet, aber nicht abgelehnt. Ohne echte Mails geht beim Ablehnen nichts verloren: direkt auf p=reject wechseln.'
          : 'Mit p=none werden Spoofing-Versuche zwar gemeldet, aber nicht abgelehnt. Sobald Reports stabil aussehen: auf quarantine wechseln.',
        category: 'mail',
      });
    } else {
      findings.push({
        id: 'dmarc-present',
        severity: 'success',
        title: `DMARC-Policy: ${policy ?? 'gesetzt'}`,
        description: 'DMARC-Record vorhanden — Mail-Spoofing-Schutz aktiv.',
        category: 'mail',
      });
    }
  }

  if (receivesMail && mail.dkim.selectors.length === 0 && mail.dkim.lookupFailed) {
    findings.push(
      uncheckedFinding(
        'dkim-unchecked',
        'mail',
        'DKIM',
        mail.dkim.lookupFailed,
        `Nicht alle gängigen Selectors ließen sich abfragen. ${FAILURE_DETAIL[mail.dkim.lookupFailed]}`
      )
    );
  } else if (receivesMail && mail.dkim.selectors.length === 0) {
    findings.push({
      id: 'no-dkim-found',
      severity: 'info',
      title: 'Kein DKIM-Selector gefunden',
      description: 'Wir haben gängige Selectors probiert (default, google, selector1, k1, …) und nichts gefunden. Vielleicht nutzt du einen exotischen Selector — manuell prüfen, oder DKIM einrichten.',
      category: 'mail',
    });
  } else if (mail.dkim.selectors.length > 0) {
    findings.push({
      id: 'dkim-present',
      severity: 'success',
      title: `DKIM-Selectors aktiv: ${mail.dkim.selectors.map((s) => s.selector).join(', ')}`,
      description: 'Ausgehende Mails werden signiert — Empfänger können die Authentizität prüfen.',
      category: 'mail',
    });
  }

  if (receivesMail && mail.mtaSts.lookupFailed) {
    findings.push(
      uncheckedFinding('mta-sts-unchecked', 'mail', 'MTA-STS', mail.mtaSts.lookupFailed)
    );
  } else if (receivesMail && !mail.mtaSts.present) {
    findings.push({
      id: 'no-mta-sts',
      severity: 'info',
      title: 'Kein MTA-STS',
      description: 'MTA-STS erzwingt TLS für eingehende Mail. Ohne MTA-STS können Angreifer einen Downgrade auf unverschlüsselten SMTP-Transport erzwingen.',
      category: 'mail',
    });
  }

  // Eine Domain ohne Mail (Null-MX) verschickt keine Logos und bekommt keine
  // Zustellungen, über die berichtet werden könnte: dort gar keine Aussage.
  if (!mail.nullMx) {
    findings.push(...tlsRptFindings(mail, apexDomain, receivesMail));
    findings.push(...bimiFindings(mail, apexDomain, receivesMail));
  }

  if (mail.nullMx) findings.push(...noMailFindings(mail, apexDomain));

  return findings;
}

/*
 * BIMI und TLS-RPT (#83) ergänzen eine gute Mail-Konfiguration, ihr Fehlen
 * ist aber keine Lücke: Ohne TLS-RPT ist die Zustellung nicht unsicherer, man
 * erfährt nur nichts über Probleme; ohne BIMI fehlt ein Logo. Deshalb sind
 * alle Hinweise dazu `advisory` — auch zu ungültigen Records, denn die
 * werten Empfänger schlicht nicht aus, sie wirken also wie keiner.
 *
 * Das Fehlen melden wir nur bei Domains, die Mail empfangen — wie bei DKIM
 * und MTA-STS. Ein vorhandener Record wird immer bewertet (außer beim
 * Null-MX), und ist die Abfrage gescheitert, sagen wir nichts: Wir wissen
 * dann nicht, ob er fehlt.
 */

function tlsRptFindings(mail: MailSecurity, apexDomain: string, receivesMail: boolean): Finding[] {
  const tlsRpt = mail.tlsRpt;
  if (!tlsRpt || tlsRpt.lookupFailed) return [];

  if (!tlsRpt.present) {
    if (!receivesMail) return [];
    return [{
      id: 'no-tls-rpt',
      severity: 'info',
      title: 'Kein TLS-RPT',
      description: mail.mtaSts.present
        ? 'Mit TLS-RPT (RFC 8460) melden Absender, wenn die verschlüsselte Zustellung an deine Mailserver scheitert. Zu MTA-STS gehört es dazu: Ohne Berichte merkst du nicht, wenn die Policy Mails aufhält — etwa nach einem abgelaufenen Zertifikat.'
        : 'Mit TLS-RPT (RFC 8460) melden Absender, wenn die verschlüsselte Zustellung an deine Mailserver scheitert — etwa an einem abgelaufenen Zertifikat oder einem Downgrade-Angriff.',
      fix: {
        explanation: 'Lege einen TXT-Record mit einer Adresse für die Berichte an. Mehrere Ziele kommagetrennt, auch https:-URLs sind möglich.',
        snippet: `_smtp._tls.${apexDomain}  TXT  "v=TLSRPTv1; rua=mailto:tls-reports@${apexDomain}"`,
      },
      category: 'mail',
      advisory: true,
    }];
  }

  if (tlsRpt.invalid) {
    return [{
      id: 'tls-rpt-invalid',
      severity: 'info',
      title: 'TLS-RPT-Record ungültig',
      description: `${tlsRpt.invalid}. Absender schicken dann keine Berichte (RFC 8460 §3).`,
      category: 'mail',
      advisory: true,
    }];
  }

  return [{
    id: 'tls-rpt-present',
    severity: 'success',
    title: 'TLS-RPT aktiv',
    description: `Berichte über Probleme bei der verschlüsselten Zustellung gehen an ${tlsRpt.rua?.join(', ')}.`,
    category: 'mail',
  }];
}

/**
 * BIMI hängt an DMARC: Ein Logo zeigen Empfänger nur, wenn Fälschungen
 * abgewiesen werden (Regel: bimiDmarcGap). Bei zu schwacher Policy ist
 * deshalb DMARC der nächste Schritt — BIMI zu empfehlen hieße, etwas
 * einzurichten, das nicht wirkt.
 */
function bimiFindings(mail: MailSecurity, apexDomain: string, receivesMail: boolean): Finding[] {
  const bimi = mail.bimi;
  if (!bimi || bimi.lookupFailed) return [];
  // Ob BIMI wirkt, hängt an DMARC. Ist DMARC nicht prüfbar (#101), bleibt
  // auch das offen — dann weder „erst DMARC verschärfen“ noch „wirkt“.
  const dmarcUnknown = Boolean(mail.dmarc.lookupFailed);
  const dmarcGap = dmarcUnknown ? undefined : bimiDmarcGap(mail.dmarc);

  if (!bimi.present) {
    if (!receivesMail || dmarcUnknown) return [];
    if (dmarcGap) {
      return [{
        id: 'bimi-needs-dmarc',
        severity: 'info',
        title: 'BIMI erst mit strengerer DMARC-Policy',
        description: `Mit BIMI zeigen Postfächer dein Markenlogo neben deinen Mails — aber nur bei DMARC mit p=quarantine oder p=reject. Jetzt: ${dmarcGap}. Erst DMARC verschärfen, dann lohnt sich BIMI.`,
        category: 'mail',
        advisory: true,
      }];
    }
    return [{
      id: 'no-bimi',
      severity: 'info',
      title: 'Kein BIMI-Record',
      description: 'Mit BIMI zeigen Postfächer dein Markenlogo neben deinen Mails. Deine DMARC-Policy erfüllt die Voraussetzung schon. Gmail und Apple Mail zeigen das Logo nur mit Markenzertifikat (VMC oder CMC).',
      fix: {
        explanation: 'Das Logo als SVG (Profil SVG Tiny PS) per https veröffentlichen und den Record anlegen; ein Markenzertifikat kommt mit a=https://… dazu.',
        snippet: `default._bimi.${apexDomain}  TXT  "v=BIMI1; l=https://${apexDomain}/bimi/logo.svg"`,
      },
      category: 'mail',
      advisory: true,
    }];
  }

  // Ausdrücklicher Verzicht (l= und a= leer): eine Entscheidung, kein Befund.
  if (bimi.declined) return [];

  if (bimi.invalid) {
    return [{
      id: 'bimi-invalid',
      severity: 'info',
      title: 'BIMI-Record ungültig',
      description: `${bimi.invalid}. Empfänger zeigen dann kein Logo.`,
      category: 'mail',
      advisory: true,
    }];
  }

  if (dmarcUnknown) return [];

  if (dmarcGap) {
    return [{
      id: 'bimi-dmarc-weak',
      severity: 'info',
      title: 'BIMI-Record wirkt noch nicht',
      description: `Der Record ist da, aber Postfächer zeigen das Logo erst bei DMARC mit p=quarantine oder p=reject. Jetzt: ${dmarcGap}.`,
      category: 'mail',
      advisory: true,
    }];
  }

  return [{
    id: 'bimi-present',
    severity: 'success',
    title: 'BIMI-Record vorhanden',
    description: bimi.evidenceUrl
      ? 'Markenlogo mit Zertifikat (VMC/CMC) hinterlegt — Postfächer können es neben deinen Mails zeigen.'
      : 'Markenlogo hinterlegt, aber ohne Markenzertifikat: Gmail und Apple Mail zeigen es so nicht, manche andere Postfächer schon.',
    category: 'mail',
  }];
}

/**
 * Statt der DKIM- und MTA-STS-Hinweise: die Bestätigung, dass die Domain
 * sauber als „keine Mail“ markiert ist — und, wo SPF oder DMARC dafür noch
 * fehlen, ein Hinweis darauf.
 *
 * Der Hinweis ist `info` wie no-spf/no-dmarc bei Domains ohne MX: Die Domain
 * empfängt nichts, es geht um Fälschungen in ihrem Namen, und das bewertet
 * diggy bei Domains ohne Mail schon bisher als Empfehlung, nicht als Mangel.
 * Er nennt den Zusammenhang, den die einzelnen SPF-/DMARC-Findings nicht
 * nennen — und deckt die Fälle ab, die dort als OK durchgehen (`~all`,
 * `p=quarantine`). Kostet aber keine zweiten Punkte, wenn eines davon
 * schon gemeldet ist (`causedBy`).
 */
function noMailFindings(mail: MailSecurity, apexDomain: string): Finding[] {
  const protection = noMailProtection(mail);

  const nullMxFinding: Finding = protection.complete
    ? {
        id: 'null-mx',
        severity: 'success',
        title: 'Keine Mails: Domain sauber als mail-frei markiert',
        description: 'Null-MX (RFC 7505), SPF -all und DMARC p=reject: Die Domain nimmt keine Mails an, und Empfänger weisen Mails ab, die sich als diese Domain ausgeben. DKIM und MTA-STS braucht sie deshalb nicht.',
        category: 'mail',
      }
    : {
        id: 'null-mx',
        severity: 'success',
        title: 'Keine Mails: Null-MX gesetzt',
        description: 'Der Null-MX (RFC 7505) sagt jedem Absender, dass diese Domain keine Mails annimmt. DKIM und MTA-STS braucht sie deshalb nicht.',
        category: 'mail',
      };

  if (protection.complete) return [nullMxFinding];

  // Scheiterte die SPF- oder DMARC-Abfrage, ist offen, ob dort etwas fehlt —
  // das meldet schon spf-unchecked bzw. dmarc-unchecked (#101).
  const missing: string[] = [];
  const snippets: string[] = [];
  if (!protection.spfAllowsNoSender && !mail.spf.lookupFailed) {
    missing.push('ein SPF, das niemanden senden lässt (v=spf1 -all)');
    snippets.push(`${apexDomain}  TXT  "v=spf1 -all"`);
  }
  if (!protection.dmarcReject && !mail.dmarc.lookupFailed) {
    const policy = mail.dmarc.present ? mail.dmarc.policy : undefined;
    missing.push(
      policy === 'reject'
        ? `DMARC mit p=reject für alle Mails (jetzt pct=${dmarcPct(mail.dmarc.record)})`
        : policy
        ? `DMARC mit p=reject (jetzt p=${policy})`
        : 'DMARC mit p=reject'
    );
    snippets.push(`_dmarc.${apexDomain}  TXT  "v=DMARC1; p=reject"`);
  }
  if (missing.length === 0) return [nullMxFinding];

  return [
    nullMxFinding,
    {
      id: 'null-mx-incomplete',
      severity: 'info',
      title: 'Keine Mails, aber Schutz vor Fälschungen unvollständig',
      description: `Der Null-MX regelt nur den Empfang. Damit Empfänger Mails abweisen, die sich als ${apexDomain} ausgeben, fehlt noch ${missing.join(' und ')}.`,
      fix: {
        explanation: 'Eine Domain ohne Mail erlaubt niemandem das Senden und lässt Fälschungen ablehnen.',
        snippet: snippets.join('\n'),
      },
      category: 'mail',
      // Auch ein problematisches SPF (+all, zu viele Lookups) ist schon
      // gemeldet und abgezogen — der Fix hier (v=spf1 -all) behebt es mit.
      causedBy: ['no-spf', 'no-dmarc', 'dmarc-policy-none', ...mail.spf.issues.map(spfIssueId)],
    },
  ];
}

/* ─── DNSSEC ─────────────────────────────────────────────────────────── */

export function dnssecFindings(dnssec: DnssecInfo): Finding[] {
  if (!dnssec.enabled && dnssec.lookupFailed) {
    const reason = dnssec.lookupFailed;
    return [
      uncheckedFinding(
        'dnssec-unchecked',
        'dnssec',
        'DNSSEC',
        reason,
        // Eine unsignierte Zone landet nie hier (siehe checkDnssec): bei
        // SERVFAIL ist die kaputte Signatur deshalb die naheliegende Ursache.
        reason === 'servfail'
          ? 'Der Resolver antwortete auf die DS- oder DNSKEY-Abfrage mit SERVFAIL. Das kann vorübergehend sein. Bleibt es dabei, steckt meist eine fehlerhafte DNSSEC-Signatur dahinter — dann scheitern validierende Resolver an der ganzen Domain.'
          : `Die DS- oder DNSKEY-Abfrage blieb unbeantwortet. ${FAILURE_DETAIL[reason]}`
      ),
    ];
  }

  if (!dnssec.enabled) {
    return [{
      id: 'dnssec-off',
      severity: 'info',
      title: 'DNSSEC nicht aktiviert',
      description: 'Mit DNSSEC werden DNS-Antworten kryptografisch signiert. Schützt gegen DNS-Spoofing und Cache-Poisoning.',
      category: 'dnssec',
    }];
  }

  if (dnssec.chainOfTrust === 'incomplete') {
    return [{
      id: 'dnssec-incomplete',
      severity: 'critical',
      title: 'DNSSEC-Chain unterbrochen',
      description: 'Die Domain hat DNSKEYs aber der Parent-Zone-DS-Record fehlt. Resolver können die Signatur nicht validieren.',
      fix: {
        explanation: 'Beim Registrar den DS-Record eintragen, der zum DNSKEY passt.',
      },
      category: 'dnssec',
    }];
  }

  if (dnssec.chainOfTrust === 'invalid') {
    return [{
      id: 'dnssec-invalid',
      severity: 'critical',
      title: 'DNSSEC-Chain ungültig',
      description: 'DS-Record und DNSKEY existieren, aber der Resolver hat die Signatur nicht validiert. Möglicherweise abgelaufene Schlüssel.',
      category: 'dnssec',
    }];
  }

  return [{
    id: 'dnssec-valid',
    severity: 'success',
    title: 'DNSSEC aktiv und valide',
    description: dnssec.algorithm
      ? `Chain of Trust verifiziert. Algorithmus: ${dnssec.algorithm}.`
      : 'Chain of Trust verifiziert.',
    category: 'dnssec',
  }];
}

/* ─── SSL ─────────────────────────────────────────────────────────────── */

const SSL_FAILURE_DETAIL: Record<LookupFailure, string> = {
  timeout:
    'Port 443 hat den TLS-Handshake nicht rechtzeitig abgeschlossen — ein überlasteter Server oder eine Firewall, die den Port stumm verwirft.',
  servfail: 'Die Adresse des Hosts ließ sich gerade nicht auflösen (SERVFAIL oder Resolver-Timeout).',
  network: 'Der Host war über das Netz nicht erreichbar.',
};

/**
 * `lookupFailed`: der Check kam zu keinem Ergebnis (siehe SslCheckResult in
 * services/ssl.ts). Ohne ihn heißt `ssl: null` wie bisher „kein TLS“.
 */
export function sslFindings(ssl: SslInfo | null, lookupFailed?: LookupFailure): Finding[] {
  if (!ssl && lookupFailed) {
    const detail = SSL_FAILURE_DETAIL[lookupFailed];
    return [uncheckedFinding('ssl-unchecked', 'ssl', 'SSL', lookupFailed, detail)];
  }

  if (!ssl) {
    return [{
      id: 'no-ssl',
      severity: 'warning',
      title: 'Kein TLS auf Port 443 erreichbar',
      description: 'Wir konnten keinen TLS-Handshake aufbauen. Entweder ist Port 443 zu, kein Webserver läuft, oder das Cert ist unbrauchbar kaputt.',
      category: 'ssl',
    }];
  }

  const findings: Finding[] = [];

  const isExpired = ssl.daysUntilExpiry < 0;

  // Kein doppeltes Finding für denselben Sachverhalt: ein abgelaufenes
  // Zertifikat ist per Definition auch nicht vertrauenswürdig. Vorher feuerten
  // beide, ein einziges Problem kostete damit 50 der 100 Score-Punkte und der
  // Score unterschied nicht mehr zwischen einem und fünf Problemen. Das
  // spezifischere Finding (ssl-expired) gewinnt, weil es die Ursache benennt.
  if (!ssl.valid && !isExpired) {
    findings.push({
      id: 'ssl-invalid',
      severity: 'critical',
      title: 'SSL-Zertifikat ungültig',
      description: 'Cert wird vom System nicht als vertrauenswürdig eingestuft. Möglicherweise selbstsigniert oder der Hostname passt nicht.',
      category: 'ssl',
    });
  }

  if (isExpired) {
    findings.push({
      id: 'ssl-expired',
      severity: 'critical',
      title: `Zertifikat seit ${Math.abs(ssl.daysUntilExpiry)} Tagen abgelaufen`,
      description: 'Browser zeigen Sicherheitswarnungen. Sofort erneuern.',
      category: 'ssl',
    });
  } else if (ssl.daysUntilExpiry < 14) {
    findings.push({
      id: 'ssl-expiring-soon',
      severity: 'warning',
      title: `Zertifikat läuft in ${ssl.daysUntilExpiry} Tagen ab`,
      description: 'Wenn kein Auto-Renew läuft: jetzt erneuern. Let\'s Encrypt wird in der Regel 30 Tage vorher renewed.',
      category: 'ssl',
    });
  } else if (ssl.valid) {
    findings.push({
      id: 'ssl-ok',
      severity: 'success',
      title: `SSL-Zertifikat gültig (noch ${ssl.daysUntilExpiry} Tage)`,
      description: `Ausgestellt von ${ssl.issuer} via ${ssl.tlsVersion}.`,
      category: 'ssl',
    });
  }

  if (ssl.tlsVersion && /TLSv1(\.0|\.1)?$/.test(ssl.tlsVersion)) {
    findings.push({
      id: 'ssl-old-tls',
      severity: 'warning',
      title: `Veraltete TLS-Version: ${ssl.tlsVersion}`,
      description: 'TLS 1.0/1.1 sind deprecated. Auf TLS 1.2+ aktualisieren.',
      category: 'ssl',
    });
  }

  return findings;
}

/* ─── Propagation ────────────────────────────────────────────────────── */

export function propagationFindings(results: ResolverResult[]): Finding[] {
  if (results.length === 0) return [];

  // Wir vergleichen die Sets der A-Records. Sortiert + gejoint = stabiler Key.
  const aValuesByResolver = results
    .map((r) => ({
      id: r.resolver.id,
      key: r.records
        .filter((rec) => rec.type === 'A')
        .map((rec) => rec.value)
        .sort()
        .join(','),
      hasError: !!r.error,
    }))
    .filter((r) => !r.hasError && r.key.length > 0);

  if (aValuesByResolver.length < 2) return [];

  const uniqueKeys = new Set(aValuesByResolver.map((r) => r.key));
  if (uniqueKeys.size > 1) {
    return [{
      id: 'propagation-mismatch',
      severity: 'warning',
      title: 'Propagation-Abweichung erkannt',
      description: `${aValuesByResolver.length} Resolver liefern ${uniqueKeys.size} verschiedene Antworten — entweder noch nicht propagiert, oder GeoDNS / Anycast.`,
      category: 'dns',
    }];
  }

  return [{
    id: 'propagation-consistent',
    severity: 'success',
    title: 'Konsistente Propagation',
    description: `Alle ${aValuesByResolver.length} Resolver liefern dasselbe Ergebnis.`,
    category: 'dns',
  }];
}

/* ─── WHOIS / RDAP ───────────────────────────────────────────────────── */

/**
 * EPP-Status-Codes die ein klares Problem signalisieren.
 * Vollständige Liste: https://icann.org/epp
 */
const CRITICAL_STATUS = new Set([
  'clienthold',
  'serverhold',
  'pendingdelete',
  'pendingrestore',
  'redemptionperiod',
]);

export function whoisFindings(whois: WhoisInfo | null): Finding[] {
  if (!whois) {
    // Gar kein Finding: dass eine ccTLD kein RDAP anbietet, ist eine
    // Eigenschaft der Datenquelle und keine Schwäche der geprüften Domain.
    // Als 'info' zog es Score-Punkte ab, als 'success' stünde ein grünes "OK"
    // neben "nicht verfügbar". Die WHOIS-Ansicht sagt es ohnehin deutlich.
    return [];
  }

  const findings: Finding[] = [];

  // ── Ablauf-Check ─────────────────────────────────────────────────────
  if (whois.expiresAt) {
    const expires = new Date(whois.expiresAt);
    const daysUntilExpiry = Math.floor((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      findings.push({
        id: 'domain-expired',
        severity: 'critical',
        title: `Domain seit ${Math.abs(daysUntilExpiry)} Tagen abgelaufen`,
        description: 'Die Domain ist offiziell abgelaufen und kann jederzeit gelöscht oder neu vergeben werden.',
        category: 'dns',
      });
    } else if (daysUntilExpiry < 7) {
      findings.push({
        id: 'domain-expiring-critical',
        severity: 'critical',
        title: `Domain läuft in ${daysUntilExpiry} Tagen ab`,
        description: 'Verlängerung dringend! Andernfalls geht die Domain verloren.',
        category: 'dns',
      });
    } else if (daysUntilExpiry < 30) {
      findings.push({
        id: 'domain-expiring-soon',
        severity: 'warning',
        title: `Domain läuft in ${daysUntilExpiry} Tagen ab`,
        description: 'Verlängerung sollte rechtzeitig erfolgen, bevor die Frist knapp wird.',
        category: 'dns',
      });
    }
  }

  // ── Status-Codes ─────────────────────────────────────────────────────
  //
  // Ist die Domain schon als abgelaufen gemeldet, beschreiben
  // redemptionPeriod und pendingDelete denselben Zustand aus einer zweiten
  // Quelle — dann nicht zweimal abziehen.
  const alreadyReportedExpired = findings.some(
    (existing) => existing.id === 'domain-expired'
  );
  /*
   * Status-Codes, die bei einer bereits als abgelaufen gemeldeten Domain
   * denselben Sachverhalt beschreiben.
   *
   * clientHold/serverHold gehören dazu: der Registrar stellt eine Domain beim
   * Ablauf praktisch immer auf Hold. Ohne sie in dieser Liste ergaben
   * domain-expired und whois-status-clienthold zusammen 50 Punkte Abzug für
   * eine Ursache — genau die Doppelbestrafung, die dieser Fix beseitigen soll.
   */
  const REDUNDANT_WHEN_EXPIRED = new Set([
    'redemptionperiod',
    'pendingdelete',
    'clienthold',
    'serverhold',
  ]);

  for (const status of whois.status ?? []) {
    const norm = status.toLowerCase().replace(/\s+/g, '');
    if (alreadyReportedExpired && REDUNDANT_WHEN_EXPIRED.has(norm)) continue;
    if (CRITICAL_STATUS.has(norm)) {
      findings.push({
        id: `whois-status-${norm}`,
        severity: 'critical',
        title: `Domain-Status: ${status}`,
        description: getStatusExplanation(norm),
        category: 'dns',
      });
    }
  }

  // ── Domain-Alter ─────────────────────────────────────────────────────
  if (whois.createdAt) {
    const created = new Date(whois.createdAt);
    const ageDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

    if (ageDays < 30) {
      findings.push({
        id: 'domain-young',
        severity: 'info',
        title: `Domain ist erst ${ageDays} Tage alt`,
        description: 'Frisch registrierte Domains werden von Spam-/Phishing-Filtern oft skeptischer behandelt.',
        category: 'dns',
      });
    }
  }

  // ── DNSSEC-Delegation laut RDAP ──────────────────────────────────────
  // Cross-Check: wenn RDAP sagt "delegation signed", aber unser DNSSEC-Modul
  // hat den DS-Record nicht gefunden, liegt eine Inkonsistenz vor.
  // Das prüfen wir aber nicht hier, weil wir Cross-Module-Logik vermeiden.
  // Wenn DNSSEC laut RDAP aktiv ist, fügen wir nur Info hinzu.

  return findings;
}

function getStatusExplanation(status: string): string {
  const map: Record<string, string> = {
    clienthold: 'Der Registrar hat die Domain auf Hold gesetzt — sie wird nicht aufgelöst.',
    serverhold: 'Die Registry hat die Domain auf Hold gesetzt — Auflösung blockiert.',
    pendingdelete: 'Die Domain steht zur Löschung an. Sehr schwer noch zu retten.',
    pendingrestore: 'Die Domain ist im Restore-Prozess nach Ablauf — meist mit Gebühr verbunden.',
    redemptionperiod: 'Die Domain ist abgelaufen, kann aber noch eingelöst werden (gegen Gebühr).',
  };
  return map[status] ?? 'Achtung: ungewöhnlicher Status-Code.';
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
}

function spfIssueId(issue: string): string {
  return `spf-issue-${slug(issue)}`;
}
