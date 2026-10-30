import type { PageSpeedReport, PageSpeedStrategy } from '../types.js';
import type { TextParams } from '../../shared/textKeys.js';
import { UpstreamQuotaError, UpstreamTargetError, UpstreamTimeoutError } from '../lib/upstreamError.js';

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

/*
 * PSI/Lighthouse braucht für große Seiten lange — gemessen am 30.10.2026:
 * mittwald.de mobil 77 s, desktop über 120 s; kleine Seiten 7 s (#147). Mit
 * 45 s scheiterte jede größere Seite. Mehr als 95 s bringt nichts: Cloudflare
 * bricht eine Anfrage nach 100 s ab (Fehler 524).
 */
const DEFAULT_TIMEOUT_MS = 90_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 95_000;

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
      const message = payload.error?.message ?? `PageSpeed API Fehler (${res.status})`;
      if (res.status === 429 || payload.error?.code === 429) throw new UpstreamQuotaError(message);
      // Lighthouse kam an die Seite nicht heran: „Lighthouse returned error: DNS_FAILURE“.
      const reason = /Lighthouse returned error: ([A-Z_]+)/.exec(message)?.[1];
      if (reason) throw new UpstreamTargetError(message, { params: { reason } });
      throw new Error(message);
    }
    return normalizePsi(domain, strategy, payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Eigene Klasse, damit die Route den Timeout am Typ erkennt (504) und
      // nicht am Wort „Timeout“ in der Meldung.
      const seconds = Math.round(effectiveMs / 1000);
      throw new UpstreamTimeoutError(`PageSpeed Timeout nach ${seconds}s.`, { cause: error, params: { seconds } });
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

export type PageSpeedErrorCode = 'pagespeed_timeout' | 'pagespeed_quota' | 'pagespeed_unreachable' | 'pagespeed_failed';

/**
 * Was /api/pagespeed dem Nutzer sagt (#147). Vorher kam bei jedem Fehler nur
 * „PageSpeed fehlgeschlagen“ an — oder die Rohmeldung von Google samt Hinweis
 * auf die .env. Die eigentliche Ursache gehört ins Log (server/index.ts).
 */
export function describePageSpeedError(error: unknown): {
  error: PageSpeedErrorCode;
  message: string;
  params?: TextParams;
} {
  if (error instanceof UpstreamTimeoutError) {
    const seconds = error.params?.seconds ?? Math.round(DEFAULT_TIMEOUT_MS / 1000);
    return {
      error: 'pagespeed_timeout',
      message: `Google braucht für die Analyse dieser Seite länger als ${seconds} Sekunden. Große Seiten schafft PageSpeed nicht immer — versuch es in ein paar Minuten noch einmal.`,
      params: { seconds },
    };
  }
  if (error instanceof UpstreamQuotaError) {
    return {
      error: 'pagespeed_quota',
      message: 'Das Tageskontingent für PageSpeed-Analysen ist aufgebraucht. Morgen geht es wieder.',
    };
  }
  if (error instanceof UpstreamTargetError) {
    const reason = String(error.params?.reason ?? '');
    return {
      error: 'pagespeed_unreachable',
      message: `Google konnte die Seite nicht laden (${reason}).`,
      params: { reason },
    };
  }
  return {
    error: 'pagespeed_failed',
    message: 'Die PageSpeed-Analyse ist fehlgeschlagen. Versuch es in ein paar Minuten noch einmal.',
  };
}
