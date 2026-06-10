import type { DetectedTech, TechCategory } from '../types.js';

const USER_AGENT =
  'Mozilla/5.0 (compatible; Diggy-Bot/1.0) Safari/537.36';

const MAX_BYTES = 100_000; // 100 KB
const TIMEOUT_MS = 8_000;

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function push(
  results: DetectedTech[],
  name: string,
  category: TechCategory,
  confidence: 'high' | 'medium',
  version?: string,
) {
  // Avoid duplicates
  if (!results.some((t) => t.name === name)) {
    results.push({ name, category, confidence, ...(version ? { version } : {}) });
  }
}

/** Fetch up to MAX_BYTES from a URL, following redirects (max 3). */
async function fetchTruncated(url: string): Promise<{ html: string; headers: Headers } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.byteLength;
      if (totalBytes >= MAX_BYTES) {
        reader.cancel().catch(() => undefined);
        break;
      }
    }

    const combined = new Uint8Array(totalBytes > MAX_BYTES ? MAX_BYTES : totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      const end = Math.min(chunk.byteLength, MAX_BYTES - offset);
      combined.set(chunk.subarray(0, end), offset);
      offset += end;
      if (offset >= MAX_BYTES) break;
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(combined);
    return { html, headers: res.headers };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ─── Detection ──────────────────────────────────────────────────────────── */

function detectFromHeaders(headers: Headers, results: DetectedTech[]) {
  const server = headers.get('server') ?? '';
  const powered = headers.get('x-powered-by') ?? '';

  // Servers
  if (/apache/i.test(server)) push(results, 'Apache', 'server', 'high');
  if (/nginx/i.test(server)) push(results, 'nginx', 'server', 'high');
  if (/microsoft-iis/i.test(server)) push(results, 'IIS', 'server', 'high');
  if (/litespeed/i.test(server)) push(results, 'LiteSpeed', 'server', 'high');
  if (/caddy/i.test(server)) push(results, 'Caddy', 'server', 'high');

  // Languages / runtimes
  if (/php/i.test(powered)) {
    const version = powered.match(/PHP\/([\d.]+)/i)?.[1];
    push(results, 'PHP', 'language', 'high', version);
  }
  if (/express|node/i.test(powered)) push(results, 'Node.js', 'language', 'high');

  // CMS
  if (headers.get('x-typo3-parsetime') !== null) push(results, 'TYPO3', 'cms', 'high');
  if (headers.get('x-drupal-cache') !== null || headers.get('x-drupal-dynamic-cache') !== null) {
    push(results, 'Drupal', 'cms', 'high');
  }

  // CDN / Hosting
  if (headers.get('cf-cache-status') !== null || headers.get('cf-ray') !== null) {
    push(results, 'Cloudflare', 'cdn', 'high');
  }
  if (headers.get('x-vercel-id') !== null) push(results, 'Vercel', 'hosting', 'high');
  if (headers.get('x-nf-request-id') !== null) push(results, 'Netlify', 'hosting', 'high');

  // PHP via cookie
  const cookie = headers.get('set-cookie') ?? '';
  if (/PHPSESSID/i.test(cookie)) push(results, 'PHP', 'language', 'medium');
}

function detectFromHtml(html: string, results: DetectedTech[]) {
  // ── Generator meta ────────────────────────────────────────────────────────
  const generatorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i);
  const generator = generatorMatch?.[1] ?? '';

  if (/wordpress/i.test(generator)) {
    const version = generator.match(/WordPress\s+([\d.]+)/i)?.[1];
    push(results, 'WordPress', 'cms', 'high', version);
  }
  if (/typo3/i.test(generator)) push(results, 'TYPO3', 'cms', 'high');
  if (/joomla/i.test(generator)) {
    const version = generator.match(/Joomla!\s+([\d.]+)/i)?.[1];
    push(results, 'Joomla', 'cms', 'high', version);
  }
  if (/drupal/i.test(generator)) push(results, 'Drupal', 'cms', 'high');
  if (/astro/i.test(generator)) push(results, 'Astro', 'framework', 'high');

  // ── Script / link src attributes ──────────────────────────────────────────
  const srcAttrs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]);

  const hasSrc = (pattern: RegExp) => srcAttrs.some((s) => pattern.test(s));

  // WordPress
  if (hasSrc(/\/wp-content\//i) || hasSrc(/\/wp-json\//i) || /wp-content\//i.test(html)) {
    push(results, 'WordPress', 'cms', 'high');
  }
  // TYPO3
  if (hasSrc(/typo3temp\//i) || hasSrc(/typo3conf\//i)) push(results, 'TYPO3', 'cms', 'high');
  // Joomla
  if (hasSrc(/\/components\/com_/i) || hasSrc(/\/media\/jui\//i)) {
    push(results, 'Joomla', 'cms', 'high');
  }
  // Drupal
  if (hasSrc(/\/sites\/default\/files\//i) || hasSrc(/drupal\.js/i)) {
    push(results, 'Drupal', 'cms', 'medium');
  }
  // Shopify
  if (hasSrc(/cdn\.shopify\.com/i)) push(results, 'Shopify', 'cms', 'high');
  // Contao
  if (hasSrc(/contao\//i) || /contao\//i.test(html)) push(results, 'Contao', 'cms', 'medium');
  // Kirby
  if (hasSrc(/\/kirby\//i) || /kirby-panel/i.test(html)) push(results, 'Kirby', 'cms', 'medium');
  // React
  if (hasSrc(/react(?:\.min)?\.js/i)) push(results, 'React', 'framework', 'high');
  // Vue.js
  if (hasSrc(/vue(?:\.runtime)?(?:\.min)?\.js/i)) push(results, 'Vue.js', 'framework', 'high');
  // Angular
  if (hasSrc(/angular(?:\.min)?\.js/i)) push(results, 'Angular', 'framework', 'high');
  // Next.js
  if (hasSrc(/\/_next\/static\//i)) push(results, 'Next.js', 'framework', 'high');
  // Nuxt.js
  if (hasSrc(/\/_nuxt\//i)) push(results, 'Nuxt.js', 'framework', 'high');
  // jQuery
  if (hasSrc(/jquery(?:\.min)?\.js/i)) push(results, 'jQuery', 'library', 'high');
  // Bootstrap (CSS)
  if (hasSrc(/bootstrap(?:\.min)?\.css/i)) push(results, 'Bootstrap', 'css', 'high');

  // ── Inline JS / global variable patterns ──────────────────────────────────
  if (/__reactFiber|data-reactroot|__REACT_DEVTOOLS/i.test(html)) {
    push(results, 'React', 'framework', 'high');
  }
  if (/__vue_app__|vue\.config/i.test(html)) push(results, 'Vue.js', 'framework', 'high');
  if (/ng-version|angular\.module/i.test(html)) push(results, 'Angular', 'framework', 'high');
  if (/__NEXT_DATA__|__nextjs_original_stack_frame/i.test(html)) {
    push(results, 'Next.js', 'framework', 'high');
  }
  if (/__nuxt|__NUXT_DATA__/i.test(html)) push(results, 'Nuxt.js', 'framework', 'high');
  if (/Shopify\.theme|Shopify\.shop/i.test(html)) push(results, 'Shopify', 'cms', 'high');
  if (/jQuery\.fn\.jquery/i.test(html)) push(results, 'jQuery', 'library', 'high');

  // ── HTML attribute patterns ───────────────────────────────────────────────
  if (/data-v-[a-f0-9]{6,8}/i.test(html)) push(results, 'Vue.js', 'framework', 'high');
  if (/ng-version=/i.test(html)) push(results, 'Angular', 'framework', 'high');
  if (/data-reactroot/i.test(html)) push(results, 'React', 'framework', 'high');

  // ── Svelte ────────────────────────────────────────────────────────────────
  if (/svelte-[a-z0-9]+/i.test(html)) push(results, 'Svelte', 'framework', 'medium');

  // ── PHP via .php script paths ─────────────────────────────────────────────
  if (/href=["'][^"']*\.php/i.test(html) || /src=["'][^"']*\.php/i.test(html)) {
    push(results, 'PHP', 'language', 'medium');
  }

  // ── Bootstrap via class names ─────────────────────────────────────────────
  if (!results.some((t) => t.name === 'Bootstrap')) {
    const bootstrapClassPatterns = [/\bcontainer\b/, /\brow\b/, /\bcol-(?:sm|md|lg|xl|xxl|xs)-?\d+\b/];
    const matchCount = bootstrapClassPatterns.filter((p) => p.test(html)).length;
    if (matchCount >= 2) push(results, 'Bootstrap', 'css', 'medium');
  }

  // ── Tailwind CSS ──────────────────────────────────────────────────────────
  const tailwindPatterns = [
    /\bflex\b/,
    /\bitems-/,
    /\bpx-\d/,
    /\bpy-\d/,
    /\btext-sm\b/,
    /\btext-base\b/,
    /\btext-lg\b/,
    /\brounded\b/,
    /\bbg-/,
    /\bdark:/,
    /\bhover:/,
    /\bborder\b/,
    /\bgap-\d/,
    /\bgrid\b/,
    /\bhidden\b/,
    /\bblock\b/,
  ];

  // Only check inside class attributes to reduce false positives
  const classContent = [...html.matchAll(/class=["']([^"']{0,2000})["']/gi)]
    .map((m) => m[1])
    .join(' ');

  if (classContent.length > 0) {
    const tailwindHits = tailwindPatterns.filter((p) => p.test(classContent)).length;
    if (tailwindHits >= 5) push(results, 'Tailwind CSS', 'css', 'high');
    else if (tailwindHits >= 3) push(results, 'Tailwind CSS', 'css', 'medium');
  }
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

export async function detectTechStack(domain: string): Promise<DetectedTech[]> {
  const results: DetectedTech[] = [];

  try {
    // Try HTTPS first, fall back to HTTP
    let fetched = await fetchTruncated(`https://${domain}`);
    if (!fetched) fetched = await fetchTruncated(`http://${domain}`);
    if (!fetched) return [];

    const { html, headers } = fetched;

    detectFromHeaders(headers, results);
    detectFromHtml(html, results);
  } catch {
    // Never throw — return whatever we collected so far
  }

  return results;
}
