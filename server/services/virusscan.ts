import type { VirusScanReport, VirusScanVerdict, VirusScanVendorResult } from '../types.js';

const VT_ENDPOINT = 'https://www.virustotal.com/api/v3/domains';
const TIMEOUT_MS = 15_000;

interface VtAnalysisResult {
  category: string;
  result: string;
  method: string;
  engine_name: string;
}

interface VtAttributes {
  reputation?: number;
  last_analysis_stats?: {
    malicious?: number;
    suspicious?: number;
    harmless?: number;
    undetected?: number;
    timeout?: number;
  };
  last_analysis_results?: Record<string, VtAnalysisResult>;
  last_analysis_date?: number;
  categories?: Record<string, string>;
  total_votes?: { harmless?: number; malicious?: number };
}

interface VtResponse {
  data?: { attributes?: VtAttributes };
  error?: { code?: string; message?: string };
}

export async function scanVirusTotal(domain: string): Promise<VirusScanReport> {
  const apiKey = process.env.VIRUS_TOTAL_API_KEY?.trim();
  if (!apiKey) throw new Error('VIRUS_TOTAL_API_KEY nicht konfiguriert.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${VT_ENDPOINT}/${encodeURIComponent(domain)}`, {
      headers: { 'x-apikey': apiKey, accept: 'application/json' },
      signal: controller.signal,
    });

    const payload = (await res.json()) as VtResponse;

    if (!res.ok || payload.error) {
      const code = payload.error?.code ?? res.status;
      if (res.status === 404) throw new Error(`Domain "${domain}" in VirusTotal nicht bekannt.`);
      if (res.status === 401) throw new Error('Ungültiger VirusTotal API-Key.');
      if (res.status === 429) throw new Error('VirusTotal Rate-Limit erreicht — bitte kurz warten.');
      throw new Error(`VirusTotal Fehler: ${code}`);
    }

    return normalize(domain, payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('VirusTotal Timeout — bitte erneut versuchen.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(domain: string, payload: VtResponse): VirusScanReport {
  const attrs = payload.data?.attributes ?? {};

  const stats = {
    malicious: attrs.last_analysis_stats?.malicious ?? 0,
    suspicious: attrs.last_analysis_stats?.suspicious ?? 0,
    harmless: attrs.last_analysis_stats?.harmless ?? 0,
    undetected: attrs.last_analysis_stats?.undetected ?? 0,
    timeout: attrs.last_analysis_stats?.timeout ?? 0,
  };

  const verdict: VirusScanVerdict =
    stats.malicious > 0 ? 'malicious' : stats.suspicious > 0 ? 'suspicious' : 'clean';

  const vendors: VirusScanVendorResult[] = Object.values(
    attrs.last_analysis_results ?? {}
  )
    .filter((r) => r.category !== 'undetected' && r.category !== 'timeout')
    .map((r) => ({
      name: r.engine_name,
      category: r.category as VirusScanVendorResult['category'],
      result: r.result ?? r.category,
    }))
    .sort((a, b) => {
      const order = { malicious: 0, suspicious: 1, harmless: 2 };
      return (order[a.category as keyof typeof order] ?? 3) - (order[b.category as keyof typeof order] ?? 3);
    });

  const lastAnalysisDate = attrs.last_analysis_date
    ? new Date(attrs.last_analysis_date * 1000).toISOString()
    : new Date().toISOString();

  return {
    domain,
    scannedAt: new Date().toISOString(),
    reputation: attrs.reputation ?? 0,
    verdict,
    stats,
    vendors,
    categories: attrs.categories ?? {},
    totalVotes: {
      harmless: attrs.total_votes?.harmless ?? 0,
      malicious: attrs.total_votes?.malicious ?? 0,
    },
    lastAnalysisDate,
  };
}
