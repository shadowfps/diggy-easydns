import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { lookupStandardRecords, isValidDomain, normalizeDomain } from './services/dnsLookup.js';
import { buildReport } from './services/reportBuilder.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'diggy-api', version: '0.1.0' });
});

/**
 * Haupt-Lookup-Endpoint.
 *
 * Status: Standard-DNS-Records (A/AAAA/MX/NS/TXT/CAA/SOA/CNAME) live.
 * TODO: Multi-Resolver, SSL, DNSSEC, Mail-Audit, WHOIS/RDAP.
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
    const records = await lookupStandardRecords(domain);
    const report = buildReport(domain, records);
    const elapsedMs = Date.now() - start;

    console.log(`[lookup] ${domain} → ${records.length} records in ${elapsedMs}ms`);
    res.json(report);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`[lookup] ${domain} failed:`, err);

    // Domain existiert nicht oder DNS-Auflösung fehlgeschlagen
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

app.listen(PORT, () => {
  console.log(`🐾 Diggy API läuft auf http://localhost:${PORT}`);
});
