/**
 * Vollständiges Mail-Security-Audit.
 *
 * Wir lookuppen:
 *   1) SPF — TXT auf Apex (haben wir teilweise schon)
 *   2) DMARC — TXT auf _dmarc.<domain>
 *   3) DKIM — TXT auf <selector>._domainkey.<domain>
 *      mit gängigen Selectors (default, google, k1, mail, ...)
 *   4) MTA-STS — TXT auf _mta-sts.<domain> + HTTPS-Policy auf mta-sts.<domain>
 *   5) MX — ob die Domain überhaupt Mail annimmt (Null-MX, RFC 7505)
 *   6) BIMI — TXT auf default._bimi.<domain> (Markenlogo, #83)
 *   7) TLS-RPT — TXT auf _smtp._tls.<domain> (RFC 8460, #83)
 *
 * Alles parallel, alles per node:dns mit Cloudflare als Resolver
 * (siehe dnsLookup.ts) — günstiger als DoH für reine Existenz-Checks.
 */

import { promises as dnsPromises, type MxRecord } from 'node:dns';
import type { LookupFailure, MailBimi, MailSecurity, MailTlsRpt } from '../types.js';
import { dnsLookupFailure } from '../lib/dnsFailure.js';
import type { SpfLookup } from './dnsLookup.js';
import { isNullMx } from '../../shared/nullMx.js';
import { leadingVersion, matchTag } from '../../shared/mailTags.js';
import { declaredDmarcPolicy } from '../../shared/dmarc.js';
import { parseBimi, parseTlsRpt } from '../../shared/bimiTlsRpt.js';

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
  /** SPF aus dem Apex-TXT-Lookup (lookupSpfRecord) */
  spfLookup: SpfLookup = {}
): Promise<MailSecurity> {
  const [dmarc, dkim, mtaSts, mx, bimi, tlsRpt] = await Promise.all([
    lookupDmarc(domain),
    probeDkimSelectors(domain),
    lookupMtaSts(domain),
    lookupMx(domain),
    lookupBimi(domain),
    lookupTlsRpt(domain),
  ]);

  const spf: MailSecurity['spf'] = spfLookup.lookupFailed
    ? { present: false, valid: false, issues: [], lookupFailed: spfLookup.lookupFailed }
    : analyzeSpf(spfLookup.record);

  return {
    spf,
    dmarc,
    dkim,
    mtaSts,
    ...summarizeMx(mx),
    bimi,
    tlsRpt,
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
    const dmarcLines = merged.filter((r) => leadingVersion(r)?.toLowerCase() === 'dmarc1');
    const [dmarcLine] = dmarcLines;

    if (!dmarcLine) return { present: false };

    // Nur das gültige p= — was Empfänger ohne eins tun, entscheidet erst
    // effectiveDmarcPolicy (shared/dmarc.ts), ebenso, dass bei mehreren
    // Records keiner gilt. Report-Adressen bleiben unverändert.
    return {
      present: true,
      record: dmarcLine,
      ...(dmarcLines.length > 1 && { records: dmarcLines }),
      policy: declaredDmarcPolicy(dmarcLine),
      rua: matchTag(dmarcLine, 'rua'),
    };
  } catch (error) {
    // NXDOMAIN/NODATA heißt: kein DMARC-Record. Alles andere (Timeout,
    // SERVFAIL) nur, dass die Antwort fehlt — das muss der Client wissen,
    // sonst meldet der Report „DMARC fehlt“ und der Vergleich mit dem letzten
    // Check „DMARC entfernt“.
    const lookupFailed = dnsLookupFailure(error);
    return lookupFailed ? { present: false, lookupFailed } : { present: false };
  }
}

/* ─── DKIM ────────────────────────────────────────────────────────────── */

async function probeDkimSelectors(domain: string): Promise<MailSecurity['dkim']> {
  let lookupFailed: MailSecurity['dkim']['lookupFailed'];
  const checks = await Promise.all(
    COMMON_DKIM_SELECTORS.map(async (selector) => {
      try {
        const records = await resolver.resolveTxt(`${selector}._domainkey.${domain}`);
        const merged = records.map((chunks) => chunks.join(''));
        const dkimRecord = merged.find(isDkimKeyRecord);
        if (dkimRecord && hasUsableDkimKey(dkimRecord)) {
          return { selector, present: true, record: dkimRecord };
        }
        // TXT existiert aber ist DKIM-revoked (p=) oder kein echter DKIM-Record → ignorieren
        return null;
      } catch (error) {
        // NXDOMAIN/ENODATA — Selector existiert nicht. Alles andere: offen,
        // ob es ihn gibt.
        lookupFailed ??= dnsLookupFailure(error);
        return null;
      }
    })
  );

  const selectors = checks.filter((c): c is NonNullable<typeof c> => c !== null);
  // Ein gefundener Selector reicht für die Aussage „DKIM aktiv“ — dann ist
  // eine gescheiterte Probe egal. Ohne Fund hätte es genau diese sein können.
  return selectors.length === 0 && lookupFailed ? { selectors, lookupFailed } : { selectors };
}

/**
 * DKIM-Key-Record nach RFC 6376 §3.6.1: `v=DKIM1` und `k=` sind optional,
 * ein Record aus nur `p=…` ist also vollständig. Steht vorn ein `v=` mit
 * anderem Wert, ist es kein DKIM-Record.
 */
function isDkimKeyRecord(record: string): boolean {
  const version = leadingVersion(record);
  if (version !== undefined) return version.toLowerCase() === 'dkim1';
  return matchTag(record, 'p') !== undefined || matchTag(record, 'k') !== undefined;
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
  const key = matchTag(record, 'p');
  // Kein p= überhaupt → ungewöhnlich, aber nicht offensichtlich revoked
  if (key === undefined) return true;
  return key.length > 0;
}

/* ─── MTA-STS ─────────────────────────────────────────────────────────── */

async function lookupMtaSts(domain: string): Promise<MailSecurity['mtaSts']> {
  try {
    const records = await resolver.resolveTxt(`_mta-sts.${domain}`);
    const merged = records.map((chunks) => chunks.join(''));
    const mtaSts = merged.find((r) => r.toLowerCase().startsWith('v=stsv1'));
    return { present: !!mtaSts };
  } catch (error) {
    const lookupFailed = dnsLookupFailure(error);
    return lookupFailed ? { present: false, lookupFailed } : { present: false };
  }
}

/* ─── BIMI und TLS-RPT ────────────────────────────────────────────────── */

/*
 * Regeln für beide: shared/bimiTlsRpt.ts. Das BIMI-Logo laden wir bewusst
 * nicht — die URL kommt aus fremdem DNS, und der Server soll weder als
 * Abrufer für beliebige Adressen dienen (SSRF) noch fremde Server belasten.
 */

async function lookupBimi(domain: string): Promise<MailBimi> {
  const txt = await resolveTxtOrMissing(`default._bimi.${domain}`);
  return Array.isArray(txt) ? parseBimi(txt) : { present: false, lookupFailed: txt.lookupFailed };
}

async function lookupTlsRpt(domain: string): Promise<MailTlsRpt> {
  const txt = await resolveTxtOrMissing(`_smtp._tls.${domain}`);
  return Array.isArray(txt) ? parseTlsRpt(txt) : { present: false, lookupFailed: txt.lookupFailed };
}

/**
 * TXT-Records eines Namens, Teilstrings zusammengesetzt (RFC 7208 §3.3, so
 * verlangt es auch BIMI). Ist die Abfrage gescheitert, der Grund.
 *
 * Nur NXDOMAIN und „keine TXT-Records“ heißen „gibt es nicht“ (siehe
 * dnsLookupFailure). Ein Timeout oder SERVFAIL sagt darüber nichts — als
 * „fehlt“ gemeldet, bekäme eine Domain mit korrektem Record einen falschen
 * Hinweis. Geworfen wird trotzdem nicht: Ein Ausfall hier darf den restlichen
 * Mail-Report nicht kippen.
 */
async function resolveTxtOrMissing(
  name: string
): Promise<string[] | { lookupFailed: LookupFailure }> {
  try {
    const records = await resolver.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch (error) {
    const lookupFailed = dnsLookupFailure(error);
    return lookupFailed ? { lookupFailed } : [];
  }
}

/* ─── MX ──────────────────────────────────────────────────────────────── */

async function lookupMx(domain: string): Promise<MxRecord[]> {
  try {
    return await resolver.resolveMx(domain);
  } catch {
    return [];
  }
}

/**
 * Ein Null-MX (`MX 0 .`) kommt aus `resolveMx` als `{ priority: 0, exchange: '' }`
 * an — das leere Ziel ist die Wurzel. Er ist ein MX-Record (`hasMx`), sagt
 * aber das Gegenteil eines normalen: hier wird keine Mail angenommen.
 */
export function summarizeMx(mx: readonly MxRecord[]): Pick<MailSecurity, 'hasMx' | 'nullMx'> {
  return {
    hasMx: mx.length > 0,
    nullMx: isNullMx(mx.map((r) => ({ priority: r.priority, value: r.exchange }))),
  };
}
