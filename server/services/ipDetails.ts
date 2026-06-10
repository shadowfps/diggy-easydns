import { isIP } from 'node:net';
import type { IpDetails } from '../types.js';

interface IpWhoResponse {
  success?: boolean;
  message?: string;
  ip?: string;
  type?: string;
  continent?: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  reverse?: string;
  asn?: string | number;
  org?: string;
  isp?: string;
  connection?: {
    asn?: number;
    org?: string;
    isp?: string;
    domain?: string;
  };
  timezone?: string | { id?: string };
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown[];
}

interface RdapCidr {
  v4prefix?: string;
  v6prefix?: string;
  length?: number;
}

interface RdapIpResponse {
  errorCode?: number;
  name?: string;
  country?: string;
  startAddress?: string;
  endAddress?: string;
  cidr0_cidrs?: RdapCidr[];
  entities?: RdapEntity[];
}

interface RdapDetails {
  network?: string;
  networkName?: string;
  organization?: string;
  country?: string;
}

const IPWHO_ENDPOINT = 'https://ipwhois.app/json';
const RDAP_ENDPOINT = 'https://rdap.org/ip';
const CACHE_TTL_MS = 30 * 60 * 1000;

const cache = new Map<string, { expiresAt: number; value: IpDetails }>();

export function isValidIpAddress(ip: string): boolean {
  return isIP(ip) !== 0;
}

export async function lookupIpDetails(ip: string, timeoutMs = 6000): Promise<IpDetails> {
  const normalizedIp = ip.trim();
  if (!isValidIpAddress(normalizedIp)) {
    throw new Error('Ungültige IP-Adresse.');
  }

  const cacheKey = normalizedIp.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [geoResult, rdapResult] = await Promise.allSettled([
    fetchIpWho(normalizedIp, timeoutMs),
    fetchRdap(normalizedIp, timeoutMs),
  ]);

  const geo = geoResult.status === 'fulfilled' ? geoResult.value : null;
  const rdap = rdapResult.status === 'fulfilled' ? rdapResult.value : null;

  if (!geo && !rdap) {
    throw new Error('Keine IP-Details verfügbar.');
  }

  const details: IpDetails = {
    ip: geo?.ip ?? normalizedIp,
    type: geo?.type ?? (isIP(normalizedIp) === 4 ? 'IPv4' : 'IPv6'),
    reverse: cleanText(geo?.reverse),
    organization: cleanText(geo?.org) ?? cleanText(geo?.connection?.org) ?? rdap?.organization ?? rdap?.networkName,
    isp: cleanText(geo?.isp) ?? cleanText(geo?.connection?.isp),
    asn: formatAsn(geo?.asn ?? geo?.connection?.asn),
    asnName: cleanText(geo?.org) ?? cleanText(geo?.connection?.org),
    asnDomain: cleanText(geo?.connection?.domain),
    network: rdap?.network,
    country: cleanText(geo?.country) ?? rdap?.country,
    region: cleanText(geo?.region),
    city: cleanText(geo?.city),
    latitude: normalizeNumber(geo?.latitude),
    longitude: normalizeNumber(geo?.longitude),
    timezone: readTimezone(geo?.timezone),
    source: [geo ? 'ipwhois.app' : null, rdap ? 'rdap.org' : null].filter(Boolean).join(' + '),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: details });
  return details;
}

async function fetchIpWho(ip: string, timeoutMs: number): Promise<IpWhoResponse | null> {
  const url = new URL(`${IPWHO_ENDPOINT}/${encodeURIComponent(ip)}`);
  const data = await fetchJson<IpWhoResponse>(url, timeoutMs, 'application/json');
  if (data.success === false) return null;
  return data;
}

async function fetchRdap(ip: string, timeoutMs: number): Promise<RdapDetails | null> {
  const url = new URL(`${RDAP_ENDPOINT}/${encodeURIComponent(ip)}`);
  const data = await fetchJson<RdapIpResponse>(url, timeoutMs, 'application/rdap+json, application/json');
  if (data.errorCode) return null;

  const cidrs = (data.cidr0_cidrs ?? [])
    .map((cidr) => {
      const prefix = cidr.v4prefix ?? cidr.v6prefix;
      if (!prefix || typeof cidr.length !== 'number') return null;
      return `${prefix}/${cidr.length}`;
    })
    .filter((value): value is string => Boolean(value));

  const range =
    data.startAddress && data.endAddress ? `${data.startAddress} - ${data.endAddress}` : undefined;
  const network = cidrs.length > 0 ? cidrs.join(', ') : range;
  const ownerEntity = data.entities?.find((entity) =>
    entity.roles?.some((role) => ['registrant', 'administrative', 'technical'].includes(role))
  );

  return {
    network,
    networkName: cleanText(data.name),
    organization: extractFnFromVcard(ownerEntity?.vcardArray),
    country: cleanText(data.country),
  };
}

async function fetchJson<T>(url: URL, timeoutMs: number, accept: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept },
    });
    if (!res.ok) {
      throw new Error(`IP-Details API Fehler (${res.status})`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === '-') return undefined;
  return normalized;
}

function normalizeNumber(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function formatAsn(value: number | string | undefined): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    return `AS${value}`;
  }

  const text = cleanText(value);
  if (!text) return undefined;
  return text.toUpperCase().startsWith('AS') ? text.toUpperCase() : `AS${text}`;
}

function readTimezone(value: IpWhoResponse['timezone']): string | undefined {
  if (typeof value === 'string') return cleanText(value);
  return cleanText(value?.id);
}

function extractFnFromVcard(vcard: unknown[] | undefined): string | undefined {
  if (!vcard || vcard.length < 2) return undefined;
  const props = vcard[1];
  if (!Array.isArray(props)) return undefined;

  for (const prop of props) {
    if (Array.isArray(prop) && prop[0] === 'fn' && typeof prop[3] === 'string') {
      return cleanText(prop[3]);
    }
  }
  return undefined;
}
