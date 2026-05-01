import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupStandardRecords, isValidDomain, normalizeDomain } from './services/dnsLookup.js';
import { buildReport } from './services/reportBuilder.js';
import { queryAllResolvers } from './services/propagation.js';
import { checkDnssec } from './services/dnssec.js';
import { checkSsl } from './services/ssl.js';
import { auditMail } from './services/mailAudit.js';
import { lookupWhois } from './services/whois.js';
import { lookupPageSpeed } from './services/pagespeed.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'diggy-api', version: '0.2.0' });
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

    // Standard-Records first — wenn die Domain nicht aufgelöst werden kann,
    // brauchen wir den Rest gar nicht zu probieren.
    const records = await lookupStandardRecords(domain);

    // SPF aus Apex-TXT extrahieren — Mail-Audit kann es so wiederverwenden,
    // ohne nochmal zu fragen.
    const spfFromApex = records
      .filter((r) => r.type === 'TXT')
      .map((r) => r.value)
      .find((v) => v.toLowerCase().startsWith('v=spf1'));

    // Alle weiteren Sub-Checks parallel.
    // Promise.allSettled — ein einzelner Fehler killt den Report nicht.
    const [propagationRes, dnssecRes, sslRes, mailRes, whoisRes] = await Promise.allSettled([
      queryAllResolvers(domain, { types: ['A', 'AAAA'] }),
      checkDnssec(domain),
      checkSsl(domain),
      auditMail(domain, spfFromApex),
      lookupWhois(domain),
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
        };
    const whois = whoisRes.status === 'fulfilled' ? whoisRes.value : null;

    const report = buildReport({ domain, records, propagation, dnssec, ssl, mail, whois });
    const elapsedMs = Date.now() - start;

    console.log(
      `[lookup] ${domain} → ${records.length} records, ${propagation.length} resolvers, ssl=${!!ssl}, dnssec=${dnssec.enabled}, whois=${!!whois} in ${elapsedMs}ms`
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
const distDir = resolve(__dirname, '../dist');
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
