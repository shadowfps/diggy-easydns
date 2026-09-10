/** Shared DNS/API types used by frontend and backend. */

export type RecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'NS'
  | 'TXT'
  | 'SOA'
  | 'CAA'
  | 'SRV'
  | 'PTR'
  | 'DNSKEY'
  | 'DS';

export interface DnsRecord {
  type: RecordType;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
}

export type Severity = 'critical' | 'warning' | 'info' | 'success';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  fix?: {
    explanation: string;
    snippet?: string;
  };
  category: 'dns' | 'mail' | 'security' | 'ssl' | 'dnssec';
  /**
   * IDs von Findings, die dieses hier verursachen.
   *
   * Ist eines davon im Report vorhanden, beschreibt dieses Finding nur eine
   * Folge und geht NICHT zusätzlich in den Score ein — angezeigt wird es
   * weiterhin, denn für Nutzer ist die Folge oft die relevantere Aussage.
   *
   * Nötig, weil Findings in verschiedenen Endpoints entstehen und ihre
   * Erzeuger sich gegenseitig nicht sehen: `no-address` kommt aus
   * `/api/lookup`, `domain-expired` aus `/api/lookup/whois`. Eine abgelaufene
   * Domain löst nicht mehr auf — beide Findings sind wahr, aber es ist eine
   * Ursache, und drei Criticals dafür machen den Score unlesbar.
   */
  causedBy?: string[];
}

export interface HealthScore {
  score: number;
  verdict: string;
  counts: {
    success: number;
    info: number;
    warning: number;
    critical: number;
  };
}

export interface Resolver {
  id: string;
  name: string;
  ip: string;
  country: string;
  flag: string;
  provider: string;
}

export interface ResolverResult {
  resolver: Resolver;
  records: DnsRecord[];
  responseTimeMs: number;
  error?: string;
}

export interface SslInfo {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  sans: string[];
  tlsVersion: string;
  signatureAlgorithm: string;
  isWildcard: boolean;
}

export interface DnssecInfo {
  enabled: boolean;
  valid: boolean;
  algorithm?: string;
  chainOfTrust: 'valid' | 'invalid' | 'incomplete' | 'none';
}

export interface MailSecurity {
  spf: {
    present: boolean;
    record?: string;
    lookupCount?: number;
    valid: boolean;
    issues: string[];
  };
  dmarc: {
    present: boolean;
    record?: string;
    policy?: 'none' | 'quarantine' | 'reject';
    rua?: string;
  };
  dkim: {
    selectors: { selector: string; present: boolean; record?: string }[];
  };
  mtaSts: { present: boolean };
  /** Ob die Apex-Domain MX-Records hat (für Findings bei Subdomain-Lookups). */
  hasMx: boolean;
}

export interface WhoisInfo {
  registrar?: string;
  /** ISO date — Domain-Registrierung */
  createdAt?: string;
  /** ISO date — Ablaufdatum */
  expiresAt?: string;
  /** ISO date — letzte Änderung am Registrar */
  updatedAt?: string;
  /** Aus dem RDAP-Response übernommene Nameserver */
  nameServers?: string[];
  /** EPP-Status-Codes z.B. 'clientTransferProhibited' */
  status?: string[];
  /** secureDNS.delegationSigned aus RDAP */
  dnssecDelegated?: boolean;
  /** Welcher RDAP-Registry geantwortet hat (für UI-Transparenz) */
  source?: string;
}

export interface IpDetails {
  ip: string;
  type?: 'IPv4' | 'IPv6' | string;
  reverse?: string;
  /** PTR-Records aus einem echten Reverse-DNS-Lookup (kann mehrere Hostnamen enthalten). */
  ptr?: string[];
  organization?: string;
  isp?: string;
  asn?: string;
  asnName?: string;
  asnDomain?: string;
  network?: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  source?: string;
}

export type PageSpeedStrategy = 'mobile' | 'desktop';

export interface PageSpeedReport {
  domain: string;
  requestedUrl: string;
  finalUrl: string;
  strategy: PageSpeedStrategy;
  fetchedAt: string;
  source: 'psi';
  performanceScore: number;
  metrics: {
    fcpMs?: number;
    lcpMs?: number;
    ttfbMs?: number;
    tbtMs?: number;
    inpMs?: number;
    cls?: number;
  };
  fieldData: {
    overallCategory?: 'fast' | 'average' | 'slow';
    lcp: { percentile?: number; category?: 'fast' | 'average' | 'slow' };
    cls: { percentile?: number; category?: 'fast' | 'average' | 'slow' };
    inp: { percentile?: number; category?: 'fast' | 'average' | 'slow' };
    fcp: { percentile?: number; category?: 'fast' | 'average' | 'slow' };
  };
  opportunities: {
    id: string;
    title: string;
    description?: string;
    score?: number;
    displayValue?: string;
    numericValue?: number;
  }[];
}

export type VirusScanVerdict = 'clean' | 'suspicious' | 'malicious';

export interface VirusScanVendorResult {
  name: string;
  category: 'malicious' | 'suspicious' | 'harmless' | 'undetected' | 'timeout';
  result: string;
}

export interface VirusScanReport {
  domain: string;
  scannedAt: string;
  reputation: number;
  verdict: VirusScanVerdict;
  stats: {
    malicious: number;
    suspicious: number;
    harmless: number;
    undetected: number;
    timeout: number;
  };
  vendors: VirusScanVendorResult[];
  categories: Record<string, string>;
  totalVotes: { harmless: number; malicious: number };
  lastAnalysisDate: string;
}

export type TechCategory =
  | 'cms'
  | 'framework'
  | 'language'
  | 'css'
  | 'server'
  | 'library'
  | 'cdn'
  | 'hosting';

export interface DetectedTech {
  name: string;
  category: TechCategory;
  version?: string;
  confidence: 'high' | 'medium';
}

export interface LookupReport {
  domain: string;
  timestamp: string;
  records: DnsRecord[];
  propagation: ResolverResult[];
  ssl?: SslInfo;
  dnssec: DnssecInfo;
  mail: MailSecurity;
  whois?: WhoisInfo;
  findings: Finding[];
  healthScore: HealthScore;
  techStack: DetectedTech[];
}

export type DomainAvailabilityStatus = 'available' | 'taken' | 'unknown';

export interface DomainAvailabilityResult {
  domain: string;
  status: DomainAvailabilityStatus;
  /** RDAP-Registry, die geantwortet hat */
  source?: string;
}

export interface DomainCheckReport {
  query: string;
  label: string;
  checkedAt: string;
  results: DomainAvailabilityResult[];
}
