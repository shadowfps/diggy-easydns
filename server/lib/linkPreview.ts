/**
 * Link-Vorschau für Permalinks (#81).
 *
 * Slack, Teams, Messenger & Co. führen kein JavaScript aus, sie lesen nur die
 * Meta-Tags aus dem ausgelieferten HTML. Die SPA setzt den Titel erst im
 * Browser — ein geteilter Permalink zeigte deshalb überall dieselbe
 * generische Vorschau. Für `/lookup/<domain>` schreibt der Server die Tags
 * darum selbst ins index.html.
 *
 * Bewusst ohne Lookup: die Vorschau nennt nur die Domain. Jeder Crawler-Abruf
 * würde sonst DNS-, TLS- und WHOIS-Abfragen auslösen, und wer Links mit
 * beliebigen Domains streut, könnte darüber Last erzeugen.
 */

import type { Request } from 'express';
import { isValidDnsName, normalizeDomain } from '../services/dnsLookup.js';
import { isDnsOnlyName } from '../../shared/dnsName.js';

/** Liegt in `public/` und landet unverändert in `dist/`. */
export const OG_IMAGE_PATH = '/og-image.png';
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;
const OG_IMAGE_ALT = 'diggy — DNS made friendly';
const SITE_NAME = 'diggy';

export interface PreviewMeta {
  title: string;
  description: string;
  /** Absolute URL der Seite — fehlt, wenn keine vertrauenswürdige Basis bekannt ist. */
  url?: string;
  /** Absolute URL des Vorschaubilds — relative URLs lehnen die Crawler ab. */
  image?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escaping für Text und Attributwerte.
 *
 * Beide Anführungszeichen, damit die Funktion in jedem Attribut-Kontext
 * sicher bleibt — auch wenn eine spätere Änderung auf einfache umstellt.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Holt die Domain aus einem Permalink-Pfad — oder null, wenn der Pfad keiner
 * ist oder die Domain nicht gültig ist.
 *
 * Spiegelt `getDomainFromLookupPath` im Client (src/lib/lookupPath.ts) und
 * normalisiert danach wie die API. Damit nennt die Vorschau genau die Domain,
 * die die Seite anschließend zeigt. Was die Prüfung besteht, enthält nur noch
 * `[a-z0-9._-]` — escaped wird trotzdem, falls sich die Regel einmal lockert.
 */
export function domainFromLookupPath(pathname: string): string | null {
  const match = /^\/lookup\/([^/]+)\/?$/i.exec(pathname);
  if (!match?.[1]) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    // Ein einzelnes `%` lässt decodeURIComponent werfen.
    return null;
  }

  const domain = normalizeDomain(decoded);
  return isValidDnsName(domain) ? domain : null;
}

/**
 * Hostname mit optionalem Port, oder eine IPv6-Adresse in Klammern. Alles
 * andere im Host-Header ist kein Ziel, auf das eine Vorschau zeigen sollte.
 */
const HOST_PATTERN = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

/**
 * Basis für og:url und og:image. Crawler brauchen absolute URLs.
 *
 * Bevorzugt die konfigurierte PUBLIC_ORIGIN — dieselbe Quelle wie die
 * CSRF-Prüfung, also nichts, was der Aufrufer bestimmt. Ohne sie wird die URL
 * aus dem Request gebildet: `req.host` und `req.protocol` beachten
 * `trust proxy` und nehmen dann die X-Forwarded-Werte des Proxys. Ein Host,
 * der nicht wie einer aussieht, ergibt null; die Vorschau kommt dann ohne
 * URL und Bild aus, statt Unsinn zu spiegeln.
 */
export function previewOrigin(req: Request, configuredOrigin: string | undefined): string | null {
  if (configuredOrigin) return configuredOrigin;

  // Express 5: req.host enthält den Port.
  const host = req.host;
  if (!host || !HOST_PATTERN.test(host)) return null;
  return `${req.protocol}://${host.toLowerCase()}`;
}

/**
 * Die Vorschau-Daten für einen Permalink.
 *
 * Der Titel folgt `buildDocumentTitle` im Client, damit Vorschau und Tab
 * gleich heißen. Kein Score in der Beschreibung: der Server rechnet keinen —
 * der Client setzt ihn aus den Findings der einzeln geladenen Sektionen
 * zusammen (useProgressiveLookup), und ein aus dem 60-s-Cache nachgebauter
 * Wert wäre eine zweite Quelle, die vom angezeigten Score abweichen kann.
 */
export function lookupPreview(domain: string, origin: string | null): PreviewMeta {
  // DNS-Einträge wie _dmarc.example.com haben kein SSL und keine
  // Propagation — die Beschreibung soll nichts versprechen, was die Seite
  // dann als „nicht anwendbar“ zeigt.
  const description = isDnsOnlyName(domain)
    ? `DNS-Einträge, Mail-Schutz und DNSSEC zu ${domain} auf einen Blick.`
    : `DNS, Mail-Schutz, SSL und Propagation von ${domain} auf einen Blick.`;

  return {
    title: `${domain} — diggy`,
    description,
    // Die geprüfte Domain enthält nichts, was in einem Pfad kodiert werden
    // müsste; encodeURIComponent hält das so, falls sich die Regel ändert.
    url: origin ? `${origin}/lookup/${encodeURIComponent(domain)}` : undefined,
    image: origin ? `${origin}${OG_IMAGE_PATH}` : undefined,
  };
}

function metaName(name: string, content: string): string {
  return `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
}

function metaProperty(property: string, content: string): string {
  return `<meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;
}

/** Die Tags für den `<head>`: Titel, Beschreibung, Open Graph, Twitter. */
export function renderPreviewTags(meta: PreviewMeta): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    metaName('description', meta.description),
    metaProperty('og:type', 'website'),
    metaProperty('og:site_name', SITE_NAME),
    metaProperty('og:locale', 'de_DE'),
    metaProperty('og:title', meta.title),
    metaProperty('og:description', meta.description),
  ];

  if (meta.url) tags.push(metaProperty('og:url', meta.url));

  if (meta.image) {
    tags.push(
      metaProperty('og:image', meta.image),
      metaProperty('og:image:width', String(OG_IMAGE_WIDTH)),
      metaProperty('og:image:height', String(OG_IMAGE_HEIGHT)),
      metaProperty('og:image:alt', OG_IMAGE_ALT)
    );
  }

  // Ohne Bild wäre die große Karte leer — dann die kleine.
  tags.push(metaName('twitter:card', meta.image ? 'summary_large_image' : 'summary'));

  // Einrückung wie im index.html, damit der Quelltext lesbar bleibt.
  return tags.join('\n    ');
}

const TITLE_TAG = /<title>[\s\S]*?<\/title>/i;
const DESCRIPTION_TAG = /[ \t]*<meta\s+name=["']description["'][^>]*>[ \t]*\r?\n?/i;
const HEAD_END = /<\/head>/i;

/**
 * Bereitet index.html einmal beim Start als Vorlage vor.
 *
 * Der vorhandene `<title>` und die Standard-Beschreibung fliegen raus — sonst
 * stünden sie doppelt da, und Crawler nehmen meist den ersten Treffer. An die
 * Stelle des Titels kommen die neuen Tags. Pro Request bleibt nur das
 * Zusammensetzen dreier Strings; die Datei wird nicht erneut gelesen.
 *
 * Inline-Scripts bleiben Byte für Byte erhalten. Das ist wichtig: die CSP
 * erlaubt das Theme-Script über den SHA-256 seines Inhalts, den der Server
 * beim Start aus derselben Datei ableitet.
 *
 * Gibt null zurück, wenn das HTML weder `<title>` noch `</head>` enthält —
 * dann liefert der Server das unveränderte index.html aus.
 */
export function createIndexRenderer(html: string): ((meta: PreviewMeta) => string) | null {
  const template = html.replace(DESCRIPTION_TAG, '');

  const title = TITLE_TAG.exec(template);
  const insertAt = title?.index ?? template.search(HEAD_END);
  if (insertAt < 0) return null;

  const before = template.slice(0, insertAt);
  const after = template.slice(insertAt + (title?.[0].length ?? 0));

  return (meta) => before + renderPreviewTags(meta) + after;
}
