import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import { BlockedTargetError } from './lib/safeTarget.js';
import { concurrencyLimit, rateLimit } from './lib/rateLimit.js';
import { queryAllResolvers } from './services/propagation.js';
import { checkDnssec } from './services/dnssec.js';
import { checkSsl } from './services/ssl.js';
import { auditMail } from './services/mailAudit.js';
import { lookupWhois } from './services/whois.js';
import { lookupPageSpeed } from './services/pagespeed.js';
import { scanVirusTotal } from './services/virusscan.js';
import { isLookupableIpAddress, lookupIpDetails } from './services/ipDetails.js';
import { detectTechStack } from './services/techstack.js';
import { checkDomainsAvailability } from './services/domainAvailability.js';
import {
  ContactValidationError,
  isContactMailConfigured,
  sendContactMessage,
  validateContactInput,
} from './services/contactMail.js';
import {
  assertContactSubmissionAllowed,
  clampContactFields,
  ContactChallengeError,
  ContactRateLimitError,
  ContactSpamSilentError,
  assertContactSecretConfigured,
  isHoneypotTriggered,
  issueContactChallenge,
} from './services/contactSpamGuard.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const __dirname = dirname(fileURLToPath(import.meta.url));

/* ─── Sicherheits-Header (#9) ────────────────────────────────────────────── */

app.disable('x-powered-by');

/**
 * Die CSP ist auf die tatsächlich genutzten Quellen zugeschnitten:
 *  - `style-src` braucht 'unsafe-inline', weil Framer Motion und GSAP
 *    Inline-Styles für Transforms setzen. Ohne das bricht jede Animation.
 *  - `img-src data:` ist Pflicht für die SVG-Grain-Textur im Body-Background
 *    (src/styles/globals.css).
 *  - Keine Fremd-Hosts: Schriften liegen lokal im Bundle (#13), die App lädt
 *    zur Laufzeit nichts von Dritten.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    // Die App liefert keine Cross-Origin-Embeds aus; COEP würde nur die
    // Google-Fonts brechen, ohne hier etwas zu gewinnen.
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
      preload: false,
    },
  })
);

/* ─── CORS (#8) ──────────────────────────────────────────────────────────── */

/**
 * In Produktion liefert dieser Prozess Frontend UND API unter derselben Origin
 * aus — CORS ist dort schlicht nicht nötig. Vorher stand hier `cors()` ohne
 * Optionen, also `Access-Control-Allow-Origin: *` auf allen Routen, inklusive
 * POST /api/contact: jede fremde Seite konnte über die Browser ihrer Besucher
 * Kontaktnachrichten absetzen, wobei das IP-Rate-Limit die Besucher-IP traf
 * statt die des Angreifers.
 */
const corsOrigins = process.env.CORS_ORIGINS?.split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (corsOrigins?.length) {
  app.use(cors({ origin: corsOrigins }));
} else if (process.env.NODE_ENV !== 'production') {
  // Dev: Vite läuft auf 5173 und proxyt /api hierher.
  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
}

app.use(express.json({ limit: '64kb' }));

/**
 * CSRF-Riegel für den einzigen schreibenden Endpoint.
 *
 * Same-Origin-Requests des eigenen Frontends senden entweder keinen Origin
 * (klassisches Formular) oder die eigene Origin. Ein Cross-Site-Aufruf aus
 * einer fremden Seite trägt deren Origin — und wird hier abgelehnt, bevor
 * Token- und Rate-Limit-Budget verbraucht werden.
 */
function assertSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (!origin) return next(); // kein Origin -> kein Cross-Site-Fetch

  const allowed = new Set(corsOrigins ?? []);
  const host = req.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
  }

  if (!allowed.has(origin)) {
    res.status(403).json({
      error: 'cross_origin_denied',
      message: 'Anfragen von einer fremden Origin sind für diesen Endpoint nicht erlaubt.',
    });
    return;
  }

  next();
}

/** TTL für gecachte Lookup-Ergebnisse — kurz genug, um frisch zu bleiben. */
const LOOKUP_TTL_MS = 60_000;

/* ─── Rate-Limits ────────────────────────────────────────────────────────── */

/**
 * Basis-Limit für die gesamte API. Bemessen an einem echten Lookup: ein
 * Report löst 7 Requests aus (Records + 6 Sektionen), dazu ein /api/ip-details
 * pro A-Record. 120/min lässt also gut ein Dutzend Lookups pro Minute zu und
 * greift erst deutlich oberhalb normaler Nutzung.
 */
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  message: 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.',
});

/**
 * Deutlich strenger für die Endpoints, die auf kontingentierte Fremd-APIs
 * gehen. Diese Checks sind bewusst On-Demand (Nutzer klickt aktiv) — 10/Stunde
 * reichen für echte Nutzung und schützen den Key.
 *
 * Getrennte Buckets pro Anbieter: PageSpeed und VirusTotal haben eigene
 * Kontingente, ein gemeinsamer Zähler würde das eine Feature durch Nutzung des
 * anderen sperren.
 */
function quotaLimiter(provider: string) {
  return rateLimit({
    windowMs: 60 * 60_000,
    max: 10,
    code: 'quota_rate_limited',
    message: `Der ${provider}-Check ist auf 10 Abfragen pro Stunde begrenzt, weil er ein externes API-Kontingent nutzt.`,
  });
}

const pageSpeedLimiter = quotaLimiter('PageSpeed');
const virusScanLimiter = quotaLimiter('VirusTotal');

/** Der Verfügbarkeits-Check fragt bis zu 10 RDAP-Server pro Request ab. */
const availabilityLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'Zu viele Verfügbarkeits-Checks. Bitte kurz warten.',
});

/**
 * Concurrency-Deckel für die langlaufenden Checks. PageSpeed läuft bis zu 45 s;
 * ohne diesen Deckel würden wenige parallele Requests von verschiedenen IPs den
 * Prozess belegen, ohne je ein Rate-Limit zu reißen.
 */
const pageSpeedConcurrency = concurrencyLimit(
  4,
  'Es laufen gerade zu viele PageSpeed-Analysen. Bitte in einer Minute erneut versuchen.'
);
const virusScanConcurrency = concurrencyLimit(
  4,
  'Es laufen gerade zu viele VirusTotal-Scans. Bitte kurz warten.'
);

// Health VOR dem Limiter: der Docker-Healthcheck fragt alle 30 s an und darf
// nie durch fremden Traffic in ein 429 laufen — sonst gilt der Container als
// unhealthy, obwohl er läuft.
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'diggy-api', version: '0.3.0' });
});

app.use('/api', apiLimiter);

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
  // Ein geblocktes Ziel ist ein Fehler der Eingabe (400), kein Upstream-Ausfall.
  if (error instanceof BlockedTargetError) {
    res.status(400).json({ error: 'blocked_target', message: error.message });
    return;
  }

  const err = error as Error;
  const status = err.name === 'AbortError' ? 504 : 502;
  res.status(status).json({ error: code, message: err.message || 'Sub-Check fehlgeschlagen.' });
}

app.get('/api/ip-details', async (req: Request, res: Response) => {
  const ip = String(req.query.ip ?? '').trim();

  if (!isLookupableIpAddress(ip)) {
    return res.status(400).json({
      error: 'invalid_ip',
      message: `"${ip.slice(0, 80)}" ist keine öffentliche IP-Adresse.`,
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

app.get('/api/pagespeed', pageSpeedLimiter, pageSpeedConcurrency, async (req: Request, res: Response) => {
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

app.get('/api/virusscan', virusScanLimiter, virusScanConcurrency, async (req: Request, res: Response) => {
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

app.post('/api/contact', assertSameOrigin, async (req: Request, res: Response) => {
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
    // Reihenfolge ist wichtig:
    //
    // 1. Honeypot zuerst — Bots füllen die versteckten Felder und lassen echte
    //    Felder oft leer. Sie sollen keine Validierungsmeldung als Signal
    //    bekommen, sondern einen stillen Scheinerfolg.
    if (isHoneypotTriggered(fields)) {
      throw new ContactSpamSilentError();
    }

    // 2. Feldvalidierung VOR dem Spam-Guard. Vorher lief es umgekehrt, dadurch
    //    verbrauchte ein simpler Tippfehler den Challenge-Token und einen von
    //    drei Stundenversuchen — und der zweite Versuch meldete wegen des
    //    verbrauchten Tokens fälschlich Erfolg, ohne etwas zu senden.
    const payload = validateContactInput({
      name: fields.name,
      email: fields.email,
      message: fields.message,
    });

    // 3. Erst jetzt Token entwerten, Rate-Limit zählen, Duplikate und Inhalt prüfen.
    assertContactSubmissionAllowed(req, { ...fields, ...payload });

    const result = await sendContactMessage(payload);
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

    if (error instanceof ContactValidationError) {
      return res.status(400).json({
        error: 'contact_invalid_input',
        message: error.message,
      });
    }

    const err = error as Error;
    return res.status(502).json({
      error: 'contact_failed',
      message: err.message || 'Nachricht konnte nicht gesendet werden.',
    });
  }
});

app.get('/api/domain-check', availabilityLimiter, async (req: Request, res: Response) => {
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

// Fehlkonfiguration soll beim Start auffallen, nicht beim ersten Formular-Request.
if (isContactMailConfigured()) {
  assertContactSecretConfigured();
}

app.listen(PORT, () => {
  console.log(`🐾 Diggy läuft auf http://localhost:${PORT}`);
});
