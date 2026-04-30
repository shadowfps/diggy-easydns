import type { LookupReport, Resolver } from '@/types/dns';

export const MOCK_RESOLVERS: Resolver[] = [
  { id: 'google', name: 'Google', ip: '8.8.8.8', country: 'US', flag: '🇺🇸', provider: 'Google' },
  { id: 'cloudflare', name: 'Cloudflare', ip: '1.1.1.1', country: 'Global', flag: '🌐', provider: 'Cloudflare' },
  { id: 'quad9', name: 'Quad9', ip: '9.9.9.9', country: 'CH', flag: '🇨🇭', provider: 'Quad9' },
  { id: 'opendns', name: 'OpenDNS', ip: '208.67.222.222', country: 'US', flag: '🇺🇸', provider: 'Cisco' },
  { id: 'dnswatch', name: 'DNS.WATCH', ip: '84.200.69.80', country: 'DE', flag: '🇩🇪', provider: 'DNS.WATCH' },
  { id: 'iij', name: 'IIJ', ip: '210.130.1.1', country: 'JP', flag: '🇯🇵', provider: 'IIJ' },
];

export const MOCK_REPORT: LookupReport = {
  domain: 'example.com',
  timestamp: new Date().toISOString(),
  records: [
    { type: 'A', name: 'example.com', value: '93.184.215.14', ttl: 300 },
    { type: 'AAAA', name: 'example.com', value: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', ttl: 300 },
    { type: 'NS', name: 'example.com', value: 'a.iana-servers.net', ttl: 86400 },
    { type: 'NS', name: 'example.com', value: 'b.iana-servers.net', ttl: 86400 },
    { type: 'TXT', name: 'example.com', value: 'v=spf1 -all', ttl: 300 },
    { type: 'TXT', name: 'example.com', value: '_k2n1y4vw3qtb4skdx9e7dxt97qrmmq9', ttl: 300 },
    { type: 'CAA', name: 'example.com', value: '0 issue "digicert.com"', ttl: 86400 },
    { type: 'SOA', name: 'example.com', value: 'ns.icann.org. noc.dns.icann.org. 2024010101 7200 3600 1209600 3600', ttl: 3600 },
  ],
  propagation: MOCK_RESOLVERS.map((resolver, i) => ({
    resolver,
    records: [{
      type: 'A' as const,
      name: 'example.com',
      value: i === 4 ? '93.184.216.34' : '93.184.215.14',
      ttl: 300,
    }],
    responseTimeMs: 20 + Math.floor(Math.random() * 80),
  })),
  ssl: {
    valid: true,
    issuer: 'DigiCert Global G2 TLS RSA SHA256 2020 CA1',
    subject: 'www.example.org',
    validFrom: '2024-01-30T00:00:00Z',
    validTo: '2025-03-01T23:59:59Z',
    daysUntilExpiry: 89,
    sans: ['www.example.org', 'example.org', 'example.com', 'www.example.com'],
    tlsVersion: 'TLS 1.3',
    signatureAlgorithm: 'SHA256-RSA',
    isWildcard: false,
  },
  dnssec: {
    enabled: true,
    valid: true,
    algorithm: 'ECDSAP256SHA256',
    chainOfTrust: 'valid',
  },
  mail: {
    spf: {
      present: true,
      record: 'v=spf1 -all',
      lookupCount: 0,
      valid: true,
      issues: [],
    },
    dmarc: {
      present: false,
    },
    dkim: {
      selectors: [
        { selector: 'default', present: false },
        { selector: 'google', present: false },
      ],
    },
    mtaSts: { present: false },
  },
  whois: {
    registrar: 'IANA Reserved',
    createdAt: '1995-08-14',
    expiresAt: '2025-08-13',
    nameServers: ['a.iana-servers.net', 'b.iana-servers.net'],
  },
  findings: [
    {
      id: 'dmarc-missing',
      severity: 'critical',
      title: 'Kein DMARC-Record gefunden',
      description: 'Ohne DMARC können Angreifer leichter E-Mails in deinem Namen verschicken (Spoofing).',
      fix: {
        explanation: 'Lege einen TXT-Record auf _dmarc.example.com mit einer DMARC-Policy an.',
        snippet: '_dmarc.example.com  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"',
      },
      category: 'mail',
    },
    {
      id: 'spf-strict',
      severity: 'warning',
      title: 'SPF-Record sehr restriktiv',
      description: 'Mit "-all" werden alle nicht-autorisierten Mails hart abgelehnt. Prüfe ob alle legitimen Mailserver erfasst sind.',
      category: 'mail',
    },
    {
      id: 'propagation-mismatch',
      severity: 'warning',
      title: 'Propagation-Abweichung erkannt',
      description: '1 von 6 Resolvern liefert eine andere IP zurück. Möglicherweise noch im Propagationsprozess oder gecached.',
      category: 'dns',
    },
    {
      id: 'dnssec-valid',
      severity: 'info',
      title: 'DNSSEC aktiv und valide',
      description: 'Chain of Trust verifiziert. Algorithmus: ECDSAP256SHA256.',
      category: 'dnssec',
    },
    {
      id: 'caa-set',
      severity: 'success',
      title: 'CAA-Record vorhanden',
      description: 'Nur autorisierte Certificate Authorities dürfen für diese Domain Zertifikate ausstellen.',
      category: 'security',
    },
  ],
  healthScore: {
    score: 87,
    verdict: 'Solides Setup',
    counts: { success: 12, info: 3, warning: 2, critical: 1 },
  },
};
