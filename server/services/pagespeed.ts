import type { PageSpeedReport, PageSpeedStrategy } from '../types.js';

interface PsiMetric {
  percentile?: number;
  category?: 'FAST' | 'AVERAGE' | 'SLOW';
}

interface PsiLoadingExperience {
  metrics?: Record<string, PsiMetric>;
  overall_category?: 'FAST' | 'AVERAGE' | 'SLOW';
}

interface PsiAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  displayValue?: string;
}

interface PsiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score?: number };
    };
    audits?: Record<string, PsiAudit>;
    finalUrl?: string;
    fetchTime?: string;
  };
  loadingExperience?: PsiLoadingExperience;
  originLoadingExperience?: PsiLoadingExperience;
  error?: {
    code?: number;
    message?: string;
  };
}

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const DEFAULT_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;

/** PSI/Lighthouse kann bei mobilen Runs und schweren Seiten locker 30–90s brauchen. */
function resolveTimeoutMs(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(explicit)));
  }
  const fromEnv = parseInt(process.env.PAGESPEED_TIMEOUT_MS ?? '', 10);
  const base =
    Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, base));
}

export async function lookupPageSpeed(
  domain: string,
  strategy: PageSpeedStrategy = 'mobile',
  timeoutMs?: number
): Promise<PageSpeedReport> {
  const effectiveMs = resolveTimeoutMs(timeoutMs);
  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  const targetUrl = `https://${domain}`;
  const params = new URLSearchParams({
    url: targetUrl,
    strategy,
    category: 'performance',
  });
  if (apiKey) params.set('key', apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveMs);

  try {
    const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });

    const payload = (await res.json()) as PsiResponse;
    if (!res.ok || payload.error) {
      throw new Error(payload.error?.message ?? `PageSpeed API Fehler (${res.status})`);
    }
    return normalizePsi(domain, strategy, payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `PageSpeed Timeout nach ${effectiveMs / 1000}s. Schwere oder mobile Ansicht kann länger dauern — ` +
          `in der .env z. B. PAGESPEED_TIMEOUT_MS=90000 setzen oder Desktop-Strategie testen.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizePsi(
  domain: string,
  strategy: PageSpeedStrategy,
  payload: PsiResponse
): PageSpeedReport {
  const audits = payload.lighthouseResult?.audits ?? {};
  const perfScoreRaw = payload.lighthouseResult?.categories?.performance?.score;
  const performanceScore =
    typeof perfScoreRaw === 'number' ? Math.round(Math.max(0, Math.min(1, perfScoreRaw)) * 100) : 0;

  const fieldMetrics = payload.originLoadingExperience?.metrics ?? payload.loadingExperience?.metrics ?? {};
  const finalUrl = payload.lighthouseResult?.finalUrl ?? `https://${domain}`;
  const fetchedAt = payload.lighthouseResult?.fetchTime ?? new Date().toISOString();

  return {
    domain,
    requestedUrl: `https://${domain}`,
    finalUrl,
    strategy,
    fetchedAt,
    source: 'psi',
    performanceScore,
    metrics: {
      fcpMs: readMs(audits['first-contentful-paint']),
      lcpMs: readMs(audits['largest-contentful-paint']),
      ttfbMs: readMs(audits['server-response-time']),
      tbtMs: readMs(audits['total-blocking-time']),
      cls: readUnit(audits['cumulative-layout-shift']),
      inpMs: readFieldPercentile(fieldMetrics, 'INTERACTION_TO_NEXT_PAINT'),
    },
    fieldData: {
      overallCategory: normalizeCategory(
        payload.originLoadingExperience?.overall_category ?? payload.loadingExperience?.overall_category
      ),
      lcp: readFieldMetric(fieldMetrics, 'LARGEST_CONTENTFUL_PAINT_MS'),
      cls: readFieldMetric(fieldMetrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE'),
      inp: readFieldMetric(fieldMetrics, 'INTERACTION_TO_NEXT_PAINT'),
      fcp: readFieldMetric(fieldMetrics, 'FIRST_CONTENTFUL_PAINT_MS'),
    },
    opportunities: extractTopOpportunities(audits),
  };
}

function readMs(audit?: PsiAudit): number | undefined {
  if (typeof audit?.numericValue !== 'number') return undefined;
  return Math.round(audit.numericValue);
}

function readUnit(audit?: PsiAudit): number | undefined {
  if (typeof audit?.numericValue !== 'number') return undefined;
  return Number(audit.numericValue.toFixed(3));
}

function readFieldPercentile(metrics: Record<string, PsiMetric>, key: string): number | undefined {
  const value = metrics[key]?.percentile;
  if (typeof value !== 'number') return undefined;
  return Math.round(value);
}

function readFieldMetric(
  metrics: Record<string, PsiMetric>,
  key: string
): { percentile?: number; category?: 'fast' | 'average' | 'slow' } {
  const metric = metrics[key];
  return {
    percentile: typeof metric?.percentile === 'number' ? Math.round(metric.percentile) : undefined,
    category: normalizeCategory(metric?.category),
  };
}

function normalizeCategory(input?: string): 'fast' | 'average' | 'slow' | undefined {
  if (input === 'FAST') return 'fast';
  if (input === 'AVERAGE') return 'average';
  if (input === 'SLOW') return 'slow';
  return undefined;
}

function extractTopOpportunities(audits: Record<string, PsiAudit>): PageSpeedReport['opportunities'] {
  return Object.values(audits)
    .filter((audit) => typeof audit.score === 'number' && audit.scoreDisplayMode === 'numeric')
    .filter((audit) => (audit.score ?? 1) < 0.9)
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 5)
    .map((audit) => ({
      id: audit.id ?? 'unknown',
      title: audit.title ?? 'Optimierungspotenzial',
      description: audit.description,
      score: typeof audit.score === 'number' ? Number(audit.score.toFixed(2)) : undefined,
      displayValue: audit.displayValue,
      numericValue: typeof audit.numericValue === 'number' ? Math.round(audit.numericValue) : undefined,
    }));
}
