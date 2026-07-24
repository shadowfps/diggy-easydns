import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupStandardRecords, isValidDomain, normalizeDomain, getApexDomain, lookupSpfRecord } from './services/dnsLookup.js';
import {
  dnsFindings,
  sslFindings,
  dnssecFindings,
  mailFindings,
  propagationFindings,
  whoisFindings,
} from './services/reportBuilder.js';
import { cached } from './lib/cache.js';
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

/** TTL für gecachte Lookup-Ergebnisse — kurz genug, um frisch zu bleiben. */
const LOOKUP_TTL_MS = 60_000;

/**
 * Validiert & normalisiert den `domain`-Query-Param. Sendet bei ungültiger
 * Eingabe selbst eine 400 und gibt null zurück — der Aufrufer bricht dann ab.
 */
function resolveDomainParam(req: Request, res: Response): string | null {
  const rawInput = String(req.query.domain ?? '');
  const domain = normalizeDomain(rawInput);
  if (!isValidDomain(domain)) {
    res.status(400).json({
      error: 'invalid_domain',
      message: `"${rawInput}" sieht nicht nach einer gültigen Domain aus.`,
    });
    return null;
  }
  return domain;
}

/** Einheitliche Fehlerantwort für die einzelnen Sub-Check-Endpoints. */
function sectionError(res: Response, code: string, error: unknown): void {
  const err = error as Error;
  const status = err.name === 'AbortError' ? 504 : 502;
  res.status(status).json({ error: code, message: err.message || 'Sub-Check fehlgeschlagen.' });
}

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
 * Primär-Endpoint: NUR die DNS-Records (+ die daraus abgeleiteten Findings).
 *
 * Das ist der schnelle Kern (meist 0,2-0,8s) und wird sofort zurückgegeben,
 * damit das Frontend die Records ohne Wartezeit rendern kann. Alle langsamen
 * Sub-Checks (SSL, WHOIS, Mail, …) laufen über die /api/lookup/*-Endpoints und
 * werden vom Client im Hintergrund nachgeladen.
 */
app.get('/api/lookup', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;

  try {
    const start = Date.now();
    const apexDomain = getApexDomain(domain);

    const records = await cached(`records:${domain}`, LOOKUP_TTL_MS, () =>
      lookupStandardRecords(domain)
    );
    const findings = dnsFindings(records, domain, apexDomain);

    console.log(`[lookup] ${domain} → ${records.length} records in ${Date.now() - start}ms`);
    res.json({
      domain,
      timestamp: new Date().toISOString(),
      records,
      findings,
    });
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

/* ─── Sekundäre Sub-Checks — je ein Endpoint, parallel nachgeladen ─────── */

app.get('/api/lookup/propagation', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;
  try {
    const propagation = await cached(`propagation:${domain}`, LOOKUP_TTL_MS, () =>
      queryAllResolvers(domain, { types: ['A', 'AAAA'] })
    );
    res.json({ propagation, findings: propagationFindings(propagation) });
  } catch (error) {
    sectionError(res, 'propagation_failed', error);
  }
});

app.get('/api/lookup/dnssec', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;
  const apexDomain = getApexDomain(domain);
  try {
    const dnssec = await cached(`dnssec:${apexDomain}`, LOOKUP_TTL_MS, () =>
      checkDnssec(apexDomain)
    );
    res.json({ dnssec, findings: dnssecFindings(dnssec) });
  } catch (error) {
    sectionError(res, 'dnssec_failed', error);
  }
});

app.get('/api/lookup/ssl', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;
  try {
    const ssl = await cached(`ssl:${domain}`, LOOKUP_TTL_MS, () => checkSsl(domain));
    res.json({ ssl, findings: sslFindings(ssl) });
  } catch (error) {
    sectionError(res, 'ssl_failed', error);
  }
});

app.get('/api/lookup/mail', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;
  const apexDomain = getApexDomain(domain);
  try {
    // SPF liegt auf der Apex-Domain — hier eigenständig holen (der Primär-
    // Endpoint liefert die Records ja nicht mehr an diesen Endpoint durch).
    const mail = await cached(`mail:${apexDomain}`, LOOKUP_TTL_MS, async () => {
      const spf = await lookupSpfRecord(apexDomain);
      return auditMail(apexDomain, spf);
    });
    res.json({ mail, findings: mailFindings(mail, apexDomain) });
  } catch (error) {
    sectionError(res, 'mail_failed', error);
  }
});

app.get('/api/lookup/whois', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;
  const apexDomain = getApexDomain(domain);
  try {
    const whois = await cached(`whois:${apexDomain}`, LOOKUP_TTL_MS, () =>
      lookupWhois(apexDomain)
    );
    res.json({ whois, findings: whoisFindings(whois) });
  } catch (error) {
    sectionError(res, 'whois_failed', error);
  }
});

app.get('/api/lookup/techstack', async (req: Request, res: Response) => {
  const domain = resolveDomainParam(req, res);
  if (!domain) return;
  try {
    const techStack = await cached(`techstack:${domain}`, LOOKUP_TTL_MS, () =>
      detectTechStack(domain)
    );
    res.json({ techStack });
  } catch (error) {
    sectionError(res, 'techstack_failed', error);
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
