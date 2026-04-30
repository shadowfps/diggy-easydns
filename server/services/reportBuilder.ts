import type {
  DnsRecord,
  DnssecInfo,
  Finding,
  HealthScore,
  LookupReport,
  MailSecurity,
  ResolverResult,
  SslInfo,
  WhoisInfo,
} from '../types.js';

interface BuildReportInput {
  domain: string;
  records: DnsRecord[];
  propagation: ResolverResult[];
  dnssec: DnssecInfo;
  mail: MailSecurity;
  ssl: SslInfo | null;
  whois: WhoisInfo | null;
}

/**
 * Baut aus allen Sub-Modul-Ergebnissen den finalen LookupReport.
 *
 * Jedes Modul (DNS, Propagation, DNSSEC, SSL, Mail, WHOIS) trägt seinen Teil
 * zur Findings-Liste bei. Der Health-Score ist eine reine Aggregation.
 */
export function buildReport(input: BuildReportInput): LookupReport {
  const findings: Finding[] = [
    ...dnsFindings(input.records),
    ...mailFindings(input.records, input.mail, input.domain),
    ...dnssecFindings(input.dnssec),
    ...sslFindings(input.ssl),
    ...propagationFindings(input.propagation),
    ...whoisFindings(input.whois),
  ];

  const healthScore = calculateScore(findings);

  return {
    domain: input.domain,
    timestamp: new Date().toISOString(),
    records: input.records,
    propagation: input.propagation,
    ssl: input.ssl ?? undefined,
    dnssec: input.dnssec,
    mail: input.mail,
    whois: input.whois ?? undefined,
    findings,
    healthScore,
  };
}

/* ─── DNS-Basics ──────────────────────────────────────────────────────── */

function dnsFindings(records: DnsRecord[]): Finding[] {
  const findings: Finding[] = [];
  const types = new Set(records.map((r) => r.type));
  const apex = records[0]?.name ?? 'example.com';

  if (!types.has('A') && !types.has('AAAA') && !types.has('CNAME')) {
    findings.push({
      id: 'no-address',
      severity: 'critical',
      title: 'Keine A/AAAA/CNAME-Records gefunden',
      description: 'Die Domain löst zu keiner IP auf. Besucher können die Seite nicht erreichen.',
      category: 'dns',
    });
  }

  if (!types.has('AAAA')) {
    findings.push({
      id: 'no-ipv6',
      severity: 'info',
      title: 'Kein IPv6 (AAAA-Record)',
      description: 'Domain ist nur über IPv4 erreichbar. IPv6 verbessert Erreichbarkeit für moderne Netzwerke.',
      category: 'dns',
    });
  }

  if (!types.has('NS')) {
    findings.push({
      id: 'no-ns',
      severity: 'critical',
      title: 'Keine Nameserver gefunden',
      description: 'Ohne NS-Records ist die Domain nicht aufgelöst. Vermutlich abgelaufen oder fehlerhaft delegiert.',
      category: 'dns',
    });
  }

  if (!types.has('CAA')) {
    findings.push({
      id: 'no-caa',
      severity: 'info',
      title: 'Kein CAA-Record',
      description: 'Mit CAA-Records legst du fest, welche Certificate Authorities für deine Domain Zertifikate ausstellen dürfen — ein einfacher Schutz gegen Mis-Issuance.',
      fix: {
        explanation: 'Lege einen CAA-Record an, der nur deine genutzte CA erlaubt.',
        snippet: `${apex}  CAA  0 issue "letsencrypt.org"`,
      },
      category: 'security',
    });
  } else {
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

function mailFindings(
  records: DnsRecord[],
  mail: MailSecurity,
  domain: string
): Finding[] {
  const findings: Finding[] = [];
  const hasMx = records.some((r) => r.type === 'MX');

  // Wenn keine MX → nicht für Mail eingerichtet, aber wir prüfen trotzdem
  // Spoofing-Schutz (jemand kann ja in deinem Namen Mails versenden, auch
  // wenn du nicht empfängst).

  if (!mail.spf.present) {
    findings.push({
      id: 'no-spf',
      severity: hasMx ? 'warning' : 'info',
      title: 'Kein SPF-Record gefunden',
      description: hasMx
        ? 'Die Domain empfängt Mails (MX vorhanden), aber ohne SPF können andere Server in deinem Namen versenden.'
        : 'Auch ohne aktive Mail-Zustellung schützt SPF (mit -all) gegen Spoofing in deinem Namen.',
      fix: {
        explanation: 'Lege einen SPF-Record als TXT-Record auf der Domain an.',
        snippet: hasMx
          ? `${domain}  TXT  "v=spf1 mx ~all"`
          : `${domain}  TXT  "v=spf1 -all"`,
      },
      category: 'mail',
    });
  } else {
    for (const issue of mail.spf.issues) {
      findings.push({
        id: `spf-issue-${slug(issue)}`,
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

  if (!mail.dmarc.present) {
    findings.push({
      id: 'no-dmarc',
      severity: hasMx ? 'warning' : 'info',
      title: 'Kein DMARC-Record auf _dmarc.<domain>',
      description: 'Ohne DMARC können Angreifer leichter E-Mails in deinem Namen verschicken (Spoofing).',
      fix: {
        explanation: 'Lege einen DMARC-Record an. Mit p=none läuft erstmal nur Reporting, ohne abzulehnen.',
        snippet: `_dmarc.${domain}  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}"`,
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
        description: 'Mit p=none werden Spoofing-Versuche zwar gemeldet, aber nicht abgelehnt. Sobald Reports stabil aussehen: auf quarantine wechseln.',
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

  if (hasMx && mail.dkim.selectors.length === 0) {
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

  if (hasMx && !mail.mtaSts.present) {
    findings.push({
      id: 'no-mta-sts',
      severity: 'info',
      title: 'Kein MTA-STS',
      description: 'MTA-STS erzwingt TLS für eingehende Mail. Ohne MTA-STS können Angreifer einen Downgrade auf unverschlüsselten SMTP-Transport erzwingen.',
      category: 'mail',
    });
  }

  return findings;
}

/* ─── DNSSEC ─────────────────────────────────────────────────────────── */

function dnssecFindings(dnssec: DnssecInfo): Finding[] {
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

function sslFindings(ssl: SslInfo | null): Finding[] {
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

  if (!ssl.valid) {
    findings.push({
      id: 'ssl-invalid',
      severity: 'critical',
      title: 'SSL-Zertifikat ungültig',
      description: 'Cert wird vom System nicht als vertrauenswürdig eingestuft. Möglicherweise selbstsigniert, abgelaufen, oder der Hostname passt nicht.',
      category: 'ssl',
    });
  }

  if (ssl.daysUntilExpiry < 0) {
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

function propagationFindings(results: ResolverResult[]): Finding[] {
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

function whoisFindings(whois: WhoisInfo | null): Finding[] {
  if (!whois) {
    return [{
      id: 'whois-unavailable',
      severity: 'info',
      title: 'WHOIS / RDAP nicht verfügbar',
      description: 'Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.',
      category: 'dns',
    }];
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
  for (const status of whois.status ?? []) {
    const norm = status.toLowerCase().replace(/\s+/g, '');
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

/* ─── Score ───────────────────────────────────────────────────────────── */

function calculateScore(findings: Finding[]): HealthScore {
  const counts = { success: 0, info: 0, warning: 0, critical: 0 };
  let score = 100;

  for (const f of findings) {
    counts[f.severity]++;
    if (f.severity === 'critical') score -= 25;
    else if (f.severity === 'warning') score -= 8;
    else if (f.severity === 'info') score -= 2;
  }

  score = Math.max(0, Math.min(100, score));

  let verdict: string;
  if (score >= 90) verdict = 'Hervorragend';
  else if (score >= 75) verdict = 'Solides Setup';
  else if (score >= 55) verdict = 'Optimierbar';
  else if (score >= 30) verdict = 'Lückenhaft';
  else verdict = 'Kritisch';

  return { score, verdict, counts };
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
}
