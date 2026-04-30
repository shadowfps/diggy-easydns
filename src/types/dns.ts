// Core DNS-Record-Typen
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
  priority?: number; // für MX, SRV
}

// Resolver für Multi-Resolver-Vergleich
export interface Resolver {
  id: string;
  name: string;
  ip: string;
  country: string;
  flag: string; // Emoji oder Code
  provider: string;
}

export interface ResolverResult {
  resolver: Resolver;
  records: DnsRecord[];
  responseTimeMs: number;
  error?: string;
}

// SSL/TLS
export interface SslInfo {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string; // ISO
  validTo: string; // ISO
  daysUntilExpiry: number;
  sans: string[];
  tlsVersion: string;
  signatureAlgorithm: string;
  isWildcard: boolean;
}

// DNSSEC
export interface DnssecInfo {
  enabled: boolean;
  valid: boolean;
  algorithm?: string;
  chainOfTrust: 'valid' | 'invalid' | 'incomplete' | 'none';
}

// Mail-Security
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
}

// Findings & Health Score
export type Severity = 'critical' | 'warning' | 'info' | 'success';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  description: string; // Erklärung für Laien
  fix?: {
    explanation: string; // Was tun (technisch)
    snippet?: string; // Konkreter DNS-Record o.ä. zum Kopieren
  };
  category: 'dns' | 'mail' | 'security' | 'ssl' | 'dnssec';
}

export interface HealthScore {
  score: number; // 0-100
  verdict: string; // "Solides Setup" etc.
  counts: {
    success: number;
    info: number;
    warning: number;
    critical: number;
  };
}

// WHOIS / RDAP
export interface WhoisInfo {
  registrar?: string;
  createdAt?: string;
  expiresAt?: string;
  updatedAt?: string;
  nameServers?: string[];
  status?: string[];
  dnssecDelegated?: boolean;
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

// Gesamter Lookup-Report
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
}
