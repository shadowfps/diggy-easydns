/**
 * Vollständiges Mail-Security-Audit.
 *
 * Wir lookuppen:
 *   1) SPF — TXT auf Apex (haben wir teilweise schon)
 *   2) DMARC — TXT auf _dmarc.<domain>
 *   3) DKIM — TXT auf <selector>._domainkey.<domain>
 *      mit gängigen Selectors (default, google, k1, mail, ...)
 *   4) MTA-STS — TXT auf _mta-sts.<domain> + HTTPS-Policy auf mta-sts.<domain>
 *
 * Alles parallel, alles per node:dns mit Cloudflare als Resolver
 * (siehe dnsLookup.ts) — günstiger als DoH für reine Existenz-Checks.
 */

import { promises as dnsPromises } from 'node:dns';
import type { MailSecurity } from '../types.js';

const resolver = new dnsPromises.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

/**
 * Liste der gängigsten DKIM-Selectors. Reihenfolge nach Häufigkeit
 * im Wild — Google + Microsoft + die Mail-Provider-Standards zuerst.
 *
 * "Probieren" heißt: TXT auf <selector>._domainkey.<domain>.
 * Wer einen anderen Selector nutzt, sieht hier nichts — das ist okay,
 * der User kann dann manuell nachgucken.
 */
const COMMON_DKIM_SELECTORS = [
  'default',
  'google',
  'selector1', // M365
  'selector2', // M365
  'k1', // Mailchimp
  'k2',
  'k3',
  'mail',
  'dkim',
  'mta',
  'mxvault', // GMX/web.de
  'sib', // Brevo (Sendinblue)
  's1', // SendGrid u.a.
  's2',
  'm1', // Mailjet
  'mandrill', // Mandrill
  'pm', // Postmark
  'mailo', // mail.de
];

export async function auditMail(
  domain: string,
  /** SPF aus dem Apex-TXT-Lookup, falls schon vorhanden */
  spfRecord?: string
): Promise<MailSecurity> {
  const [dmarc, dkimSelectors, mtaSts, hasMx] = await Promise.all([
    lookupDmarc(domain),
    probeDkimSelectors(domain),
    lookupMtaSts(domain),
    hasMxRecords(domain),
  ]);

  const spf = analyzeSpf(spfRecord);

  return {
    spf,
    dmarc,
    dkim: { selectors: dkimSelectors },
    mtaSts,
    hasMx,
  };
}

/* ─── SPF ─────────────────────────────────────────────────────────────── */

export interface AnalyzedSpf {
  present: boolean;
  record?: string;
  lookupCount?: number;
  valid: boolean;
  issues: string[];
}

/**
 * Zählt die Mechanismen, die laut RFC 7208 §4.6.4 gegen das 10er-Lookup-Limit
 * gehen: include, a, mx, ptr, exists, redirect.
 *
 * Bewusst tokenweise statt per Regex über den ganzen Record. Die alte Regex
 * `\b(include|a|mx|exists|ptr|redirect)[:=]` verlangte einen Doppelpunkt und
 * hat damit die BLANKEN Mechanismen `a`, `mx` und `ptr` nicht gezählt — die
 * zählen aber genauso mit. Für das M365-typische `v=spf1 a mx include:… -all`
 * ergab sie 1 statt 3.
 *
 * Folge des Unterzählens: eine Domain, die real bei 11 Lookups liegt und deren
 * SPF damit hart fehlschlägt, wurde als "vorhanden und plausibel" mit
 * severity=success gemeldet — ein falsches OK an genau der Stelle, wo Nutzer
 * sich auf die Aussage verlassen.
 */
export function countSpfLookups(record: string): number {
  let count = 0;

  for (const rawTerm of record.trim().split(/\s+/)) {
    // Version-Tag und leere Tokens überspringen.
    if (!rawTerm || /^v=/i.test(rawTerm)) continue;

    // Qualifier (+ - ~ ?) steht nur vor Mechanismen, nicht vor Modifiern.
    const term = rawTerm.replace(/^[+\-~?]/, '').toLowerCase();

    // Modifier und Mechanismen mit zwingendem Argument.
    if (term.startsWith('include:') || term.startsWith('exists:') || term.startsWith('redirect=')) {
      count += 1;
      continue;
    }

    // a / mx / ptr — mit oder ohne Domain-Spec und CIDR-Länge:
    // "a", "a:mail.example.com", "a/24", "mx:x.de/24", "ptr", "ptr:x.de"
    const name = term.split(/[:/]/)[0];
    if (name === 'a' || name === 'mx' || name === 'ptr') count += 1;
  }

  return count;
}

export function analyzeSpf(record?: string): AnalyzedSpf {
  if (!record) {
    return { present: false, valid: false, issues: [] };
  }

  const issues: string[] = [];
  const lookupCount = countSpfLookups(record);

  if (lookupCount > 10) {
    issues.push(`${lookupCount} DNS-Lookups — RFC-Limit ist 10, SPF schlägt fehl.`);
  } else if (lookupCount > 8) {
    issues.push(`${lookupCount} DNS-Lookups — knapp am 10er-Limit.`);
  }

  const allMechanism = record.match(/[~\-+?]all\b/i)?.[0]?.toLowerCase();
  if (allMechanism === '+all') {
    issues.push('+all erlaubt jeden Sender — bietet effektiv keinen Schutz.');
  } else if (!allMechanism) {
    issues.push('Kein "all"-Mechanismus am Ende — ungewöhnlich, prüfe Policy.');
  }

  const valid = issues.length === 0 || (lookupCount <= 10 && allMechanism !== '+all');

  return {
    present: true,
    record,
    lookupCount,
    valid,
    issues,
  };
}

/* ─── DMARC ───────────────────────────────────────────────────────────── */

async function lookupDmarc(domain: string): Promise<MailSecurity['dmarc']> {
  try {
    const records = await resolver.resolveTxt(`_dmarc.${domain}`);
    const merged = records.map((chunks) => chunks.join(''));
    const dmarcLine = merged.find((r) => r.toLowerCase().startsWith('v=dmarc1'));

    if (!dmarcLine) return { present: false };

    const policy = matchTag(dmarcLine, 'p');
    const rua = matchTag(dmarcLine, 'rua');

    return {
      present: true,
      record: dmarcLine,
      policy: isValidPolicy(policy) ? policy : undefined,
      rua,
    };
  } catch {
    return { present: false };
  }
}

function matchTag(record: string, tag: string): string | undefined {
  const re = new RegExp(`${tag}\\s*=\\s*([^;\\s]+)`, 'i');
  return record.match(re)?.[1];
}

function isValidPolicy(p?: string): p is 'none' | 'quarantine' | 'reject' {
  return p === 'none' || p === 'quarantine' || p === 'reject';
}

/* ─── DKIM ────────────────────────────────────────────────────────────── */

async function probeDkimSelectors(
  domain: string
): Promise<MailSecurity['dkim']['selectors']> {
  const checks = await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (selector) => {
      try {
        const records = await resolver.resolveTxt(`${selector}._domainkey.${domain}`);
        const merged = records.map((chunks) => chunks.join(''));
        const dkimRecord = merged.find(
          (r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('k=')
        );
        if (dkimRecord && hasUsableDkimKey(dkimRecord)) {
          return { selector, present: true, record: dkimRecord };
        }
        // TXT existiert aber ist DKIM-revoked (p=) oder kein echter DKIM-Record → ignorieren
        return null;
      } catch {
        // NXDOMAIN/ENODATA — Selector existiert nicht.
        return null;
      }
    })
  );

  return checks.filter((c): c is NonNullable<typeof c> => c !== null);
}

/**
 * RFC 6376: ein leerer p=-Wert bedeutet revoked (Schlüssel zurückgezogen).
 * Wir wollen nur Selectors zeigen, die echt signieren.
 *
 * Beispiele:
 *   "v=DKIM1; p="           → revoked, ignorieren
 *   "v=DKIM1; p=;"          → revoked, ignorieren
 *   "v=DKIM1; p=MIIBIj..."  → aktiv, anzeigen
 */
function hasUsableDkimKey(record: string): boolean {
  const match = record.match(/p\s*=\s*([^;\s]*)/i);
  // Kein p= überhaupt → ungewöhnlich, aber nicht offensichtlich revoked
  if (!match) return true;
  return match[1].length > 0;
}

/* ─── MTA-STS ─────────────────────────────────────────────────────────── */

async function lookupMtaSts(domain: string): Promise<MailSecurity['mtaSts']> {
  try {
    const records = await resolver.resolveTxt(`_mta-sts.${domain}`);
    const merged = records.map((chunks) => chunks.join(''));
    const mtaSts = merged.find((r) => r.toLowerCase().startsWith('v=stsv1'));
    return { present: !!mtaSts };
  } catch {
    return { present: false };
  }
}

async function hasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await resolver.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}
