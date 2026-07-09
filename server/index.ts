import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupStandardRecords, isValidDomain, normalizeDomain, getApexDomain, isApexDomain, lookupSpfRecord } from './services/dnsLookup.js';
import { buildReport } from './services/reportBuilder.js';
import { queryAllResolvers } from './services/propagation.js';
import { checkDnssec } from './services/dnssec.js';
import { checkSsl } from './services/ssl.js';
import { auditMail } from './services/mailAudit.js';
import { lookupWhois } from './services/whois.js';
import { lookupPageSpeed } from './services/pagespeed.js';
import { scanVirusTotal } from './services/virusscan.js';
import { isValidIpAddress, lookupIpDetails } from './services/ipDetails.js';
import { detectTechStack } from './services/techstack.js';
import { checkDomainsAvailability } from './services/domainAvailability.js';
import { isContactMailConfigured, sendContactMessage } from './services/contactMail.js';
import {
  assertContactSubmissionAllowed,
  clampContactFields,
  ContactChallengeError,
  ContactRateLimitError,
  ContactSpamSilentError,
  issueContactChallenge,
} from './services/contactSpamGuard.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'diggy-api', version: '0.3.0' });
});

app.get('/api/ip-details', async (req: Request, res: Response) => {
  const ip = String(req.query.ip ?? '').trim();

  if (!isValidIpAddress(ip)) {
    return res.status(400).json({
      error: 'invalid_ip',
      message: `"${ip}" sieht nicht nach einer gültigen IP-Adresse aus.`,
    });
  }

  try {
    const result = await lookupIpDetails(ip);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    const status = err.name === 'AbortError' ? 504 : 502;
    return res.status(status).json({
      error: 'ip_details_failed',
      message: err.message || 'IP-Details konnten nicht geladen werden.',
    });
  }
});

app.get('/api/pagespeed', async (req: Request, res: Response) => {
  const rawInput = String(req.query.domain ?? '');
  const domain = normalizeDomain(rawInput);
  const strategy = req.query.strategy === 'desktop' ? 'desktop' : 'mobile';

  if (!isValidDomain(domain)) {
    return res.status(400).json({
      error: 'invalid_domain',
      message: `"${rawInput}" sieht nicht nach einer gültigen Domain aus.`,
    });
  }

  try {
    const result = await lookupPageSpeed(domain, strategy);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    const message = err.message || 'PageSpeed-Analyse fehlgeschlagen.';
    const status = message.toLowerCase().includes('timeout') ? 504 : 502;
    return res.status(status).json({
      error: 'pagespeed_failed',
      message,
    });
  }
});

app.get('/api/virusscan', async (req: Request, res: Response) => {
  const rawInput = String(req.query.domain ?? '');
  const domain = normalizeDomain(rawInput);

  if (!isValidDomain(domain)) {
    return res.status(400).json({
      error: 'invalid_domain',
      message: `"${rawInput}" sieht nicht nach einer gültigen Domain aus.`,
    });
  }

  try {
    const result = await scanVirusTotal(domain);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    const status = err.name === 'AbortError' ? 504 : 502;
    return res.status(status).json({
      error: 'virusscan_failed',
      message: err.message || 'VirusTotal-Scan fehlgeschlagen.',
    });
  }
});

app.get('/api/contact/status', (_req: Request, res: Response) => {
  res.json({ configured: isContactMailConfigured() });
});

app.get('/api/contact/challenge', (req: Request, res: Response) => {
  if (!isContactMailConfigured()) {
    return res.status(503).json({
      error: 'contact_not_configured',
      message: 'Das Kontaktformular ist derzeit nicht eingerichtet.',
    });
  }

  try {
    res.json(issueContactChallenge(req));
  } catch (error) {
    if (error instanceof ContactRateLimitError) {
      return res.status(429).json({
        error: 'contact_rate_limited',
        message: error.message,
      });
    }
    throw error;
  }
});

app.post('/api/contact', async (req: Request, res: Response) => {
  if (!isContactMailConfigured()) {
    return res.status(503).json({
      error: 'contact_not_configured',
      message: 'Das Kontaktformular ist derzeit nicht eingerichtet.',
    });
  }

  const body = req.body as Record<string, unknown> | undefined;
  const fields = clampContactFields({
    name: String(body?.name ?? ''),
    email: String(body?.email ?? ''),
    message: String(body?.message ?? ''),
    website: body?.website !== undefined ? String(body.website) : undefined,
    company: body?.company !== undefined ? String(body.company) : undefined,
    token: String(body?.token ?? ''),
  });

  try {
    assertContactSubmissionAllowed(req, fields);
    const result = await sendContactMessage({
      name: fields.name,
      email: fields.email,
      message: fields.message,
      website: fields.website,
      company: fields.company,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof ContactSpamSilentError) {
      return res.json({ sent: true });
    }
    if (error instanceof ContactRateLimitError) {
      return res.status(429).json({
        error: 'contact_rate_limited',
        message: error.message,
      });
    }
    if (error instanceof ContactChallengeError) {
      return res.status(400).json({
        error: 'contact_challenge_failed',
        message: error.message,
      });
    }

    const err = error as Error;
    const isValidation = err.message.includes('Bitte') || err.message.includes('Nachricht');
    return res.status(isValidation ? 400 : 502).json({
      error: 'contact_failed',
      message: err.message || 'Nachricht konnte nicht gesendet werden.',
    });
  }
});

app.get('/api/domain-check', async (req: Request, res: Response) => {
  const query = String(req.query.q ?? req.query.domain ?? '').trim();

  if (!query) {
    return res.status(400).json({
      error: 'invalid_query',
      message: 'Bitte einen Domain-Namen eingeben.',
    });
  }

  try {
    const result = await checkDomainsAvailability(query);
    res.json(result);
  } catch (error) {
    const err = error as Error;
    return res.status(400).json({
      error: 'domain_check_failed',
      message: err.message || 'Verfügbarkeits-Check fehlgeschlagen.',
    });
  }
});

/**
 * Haupt-Lookup-Endpoint.
 *
 * Wir machen alles parallel — der gesamte Lookup blockiert maximal so lange
 * wie der langsamste Sub-Check (etwa 6s SSL-Timeout im worst case).
 * Die meisten Domains liegen bei 1-3s gesamt.
 */
app.get('/api/lookup', async (req: Request, res: Response) => {
  const rawInput = String(req.query.domain ?? '');
  const domain = normalizeDomain(rawInput);

  if (!isValidDomain(domain)) {
    return res.status(400).json({
      error: 'invalid_domain',
      message: `"${rawInput}" sieht nicht nach einer gültigen Domain aus.`,
    });
  }

  try {
    const start = Date.now();
    const apexDomain = getApexDomain(domain);

    // Standard-Records first — wenn die Domain nicht aufgelöst werden kann,
    // brauchen wir den Rest gar nicht zu probieren.
    const records = await lookupStandardRecords(domain);

    // SPF liegt auf der Apex-Domain — bei Subdomain-Lookups separat holen.
    const spfFromApex = isApexDomain(domain)
      ? records
          .filter((r) => r.type === 'TXT')
          .map((r) => r.value)
          .find((v) => v.toLowerCase().startsWith('v=spf1'))
      : await lookupSpfRecord(apexDomain);

    // Alle weiteren Sub-Checks parallel.
    // Promise.allSettled — ein einzelner Fehler killt den Report nicht.
    const [propagationRes, dnssecRes, sslRes, mailRes, whoisRes, techStackRes] = await Promise.allSettled([
      queryAllResolvers(domain, { types: ['A', 'AAAA'] }),
      checkDnssec(apexDomain),
      checkSsl(domain),
      auditMail(apexDomain, spfFromApex),
      lookupWhois(apexDomain),
      detectTechStack(domain),
    ]);

    const propagation = propagationRes.status === 'fulfilled' ? propagationRes.value : [];
    const dnssec = dnssecRes.status === 'fulfilled'
      ? dnssecRes.value
      : { enabled: false, valid: false, chainOfTrust: 'none' as const };
    const ssl = sslRes.status === 'fulfilled' ? sslRes.value : null;
    const mail = mailRes.status === 'fulfilled'
      ? mailRes.value
      : {
          spf: { present: !!spfFromApex, record: spfFromApex, valid: !!spfFromApex, issues: [] },
          dmarc: { present: false },
          dkim: { selectors: [] },
          mtaSts: { present: false },
          hasMx: false,
        };
    const whois = whoisRes.status === 'fulfilled' ? whoisRes.value : null;
    const techStack = techStackRes.status === 'fulfilled' ? techStackRes.value : [];

    const report = buildReport({
      domain,
      apexDomain,
      records,
      propagation,
      dnssec,
      ssl,
      mail,
      whois,
      techStack,
    });
    const elapsedMs = Date.now() - start;

    console.log(
      `[lookup] ${domain} → ${records.length} records, ${propagation.length} resolvers, ssl=${!!ssl}, dnssec=${dnssec.enabled}, whois=${!!whois}, techStack=${techStack.length} in ${elapsedMs}ms`
    );
    res.json(report);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`[lookup] ${domain} failed:`, err);

    if (err.code === 'ENOTFOUND' || err.code === 'ESERVFAIL') {
      return res.status(404).json({
        error: 'domain_not_found',
        message: `Die Domain "${domain}" konnte nicht aufgelöst werden.`,
      });
    }

    res.status(500).json({
      error: 'lookup_failed',
      message: err.message ?? 'Unbekannter Fehler beim Lookup.',
    });
  }
});

// Production: Frontend aus dist/ ausliefern (SPA).
const distDir = resolve(__dirname, '../../dist');
const distIndex = resolve(distDir, 'index.html');
if (existsSync(distIndex)) {
  app.use(express.static(distDir));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(distIndex);
  });
}

app.listen(PORT, () => {
  console.log(`🐾 Diggy läuft auf http://localhost:${PORT}`);
});
