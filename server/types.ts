// Diese Types werden auch im Frontend (src/types/dns.ts) verwendet.
// Bei Änderungen beide Stellen synchron halten — oder später in shared/ auslagern.

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
