import type {
  DnsRecord,
  Finding,
  HealthScore,
  LookupReport,
  MailSecurity,
} from '../types.js';

/**
 * Baut aus den rohen DNS-Records einen vollständigen LookupReport.
 *
 * Aktuell nur basierend auf Standard-DNS-Records. Sobald Multi-Resolver,
 * SSL und Mail-Audit dazukommen, werden hier weitere Findings/Score-Beiträge
 * eingehängt.
 */
export function buildReport(domain: string, records: DnsRecord[]): LookupReport {
  const mail = analyzeMail(records);
  const findings = generateFindings(records, mail);
  const healthScore = calculateScore(findings);

  return {
    domain,
    timestamp: new Date().toISOString(),
    records,
    propagation: [], // wird im nächsten Schritt befüllt
    dnssec: {
      enabled: false,
      valid: false,
      chainOfTrust: 'none',
    },
    mail,
    findings,
    healthScore,
  };
}

/**
 * Analysiert die TXT-Records auf SPF/DMARC.
 * DKIM braucht extra Lookups (kommt später) — DKIM-Selectors sind nicht im Apex sichtbar.
 */
function analyzeMail(records: DnsRecord[]): MailSecurity {
  const txtRecords = records.filter((r) => r.type === 'TXT').map((r) => r.value);

  const spfRecord = txtRecords.find((v) => v.toLowerCase().startsWith('v=spf1'));
  const dmarcRecord = txtRecords.find((v) => v.toLowerCase().startsWith('v=dmarc1'));

  // Note: DMARC steht eigentlich auf _dmarc.<domain>, nicht im Apex —
  // wir checken hier vorsichtshalber trotzdem, falls jemand's falsch konfiguriert hat.
  // Echter DMARC-Lookup folgt im Mail-Modul.

  return {
    spf: {
      present: !!spfRecord,
      record: spfRecord,
      valid: !!spfRecord,
      issues: [],
    },
    dmarc: {
      present: !!dmarcRecord,
      record: dmarcRecord,
      policy: extractDmarcPolicy(dmarcRecord),
    },
    dkim: { selectors: [] },
    mtaSts: { present: false },
  };
}

function extractDmarcPolicy(record?: string): 'none' | 'quarantine' | 'reject' | undefined {
  if (!record) return undefined;
  const match = record.match(/p=(\w+)/i);
  const policy = match?.[1]?.toLowerCase();
  if (policy === 'none' || policy === 'quarantine' || policy === 'reject') return policy;
  return undefined;
}

/**
 * Findings basierend auf den vorhandenen Daten.
 * Wir sind hier konservativ — nur Aussagen treffen die wir wirklich belegen können.
 */
function generateFindings(records: DnsRecord[], mail: MailSecurity): Finding[] {
  const findings: Finding[] = [];
  const types = new Set(records.map((r) => r.type));

  // ── DNS-Grundlage ──────────────────────────────────────────────────
  if (!types.has('A') && !types.has('AAAA') && !records.some((r) => r.type === 'CNAME')) {
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

  // ── CAA ────────────────────────────────────────────────────────────
  if (!types.has('CAA')) {
    findings.push({
      id: 'no-caa',
      severity: 'info',
      title: 'Kein CAA-Record',
      description: 'Mit CAA-Records legst du fest, welche Certificate Authorities für deine Domain Zertifikate ausstellen dürfen — ein einfacher Schutz gegen Mis-Issuance.',
      fix: {
        explanation: 'Lege einen CAA-Record an, der nur deine genutzte CA erlaubt.',
        snippet: `${records[0]?.name ?? 'example.com'}  CAA  0 issue "letsencrypt.org"`,
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

  // ── Mail ───────────────────────────────────────────────────────────
  const hasMx = types.has('MX');

  if (hasMx) {
    if (!mail.spf.present) {
      findings.push({
        id: 'no-spf',
        severity: 'warning',
        title: 'Kein SPF-Record bei aktivierter Mail-Zustellung',
        description: 'Die Domain hat MX-Records (empfängt Mails), aber keinen SPF-Record. Empfänger-Server können nicht prüfen, welche Server in deinem Namen senden dürfen.',
        fix: {
          explanation: 'Lege einen SPF-Record als TXT-Record auf der Domain an.',
          snippet: `${records[0]?.name ?? 'example.com'}  TXT  "v=spf1 mx ~all"`,
        },
        category: 'mail',
      });
    }

    if (!mail.dmarc.present) {
      findings.push({
        id: 'no-dmarc',
        severity: 'warning',
        title: 'Kein DMARC-Record',
        description: 'Ohne DMARC können Angreifer leichter E-Mails in deinem Namen verschicken (Spoofing).',
        fix: {
          explanation: 'Lege einen DMARC-Record auf _dmarc.<domain> an.',
          snippet: `_dmarc.${records[0]?.name ?? 'example.com'}  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@${records[0]?.name ?? 'example.com'}"`,
        },
        category: 'mail',
      });
    } else {
      findings.push({
        id: 'dmarc-present',
        severity: 'success',
        title: `DMARC-Policy: ${mail.dmarc.policy ?? 'unbekannt'}`,
        description: 'DMARC-Record vorhanden — Mail-Spoofing-Schutz aktiv.',
        category: 'mail',
      });
    }
  }

  // ── SPF Lookup-Limit (vereinfachter Check) ──────────────────────────
  if (mail.spf.record) {
    const includes = (mail.spf.record.match(/include:/gi) ?? []).length;
    if (includes > 8) {
      findings.push({
        id: 'spf-many-lookups',
        severity: 'warning',
        title: `SPF-Record nahe am 10-Lookup-Limit (${includes} includes)`,
        description: 'SPF erlaubt maximal 10 DNS-Lookups. Wird das Limit überschritten, schlägt SPF-Validierung fehl.',
        category: 'mail',
      });
    }

    const allMechanism = mail.spf.record.match(/[~\-+?]all\b/i)?.[0];
    if (allMechanism === '+all') {
      findings.push({
        id: 'spf-permissive',
        severity: 'critical',
        title: 'SPF-Record erlaubt alle Sender (+all)',
        description: 'Mit +all darf jeder Server in deinem Namen Mails verschicken. Das ist effektiv kein Schutz.',
        category: 'mail',
      });
    }
  }

  return findings;
}

/**
 * Berechnet einen Health-Score aus den Findings.
 * Gewichtung:
 *   critical = -25
 *   warning  = -8
 *   info     = -2
 *   success  = +0 (nur kosmetisch)
 *
 * Basis 100, Cap bei [0, 100].
 */
function calculateScore(findings: Finding[]): HealthScore {
  const counts = {
    success: 0,
    info: 0,
    warning: 0,
    critical: 0,
  };

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
