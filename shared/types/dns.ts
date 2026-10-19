/** Shared DNS/API types used by frontend and backend. */

import type { FindingKey, Phrase, SpfIssueKey, TextParams, TextRef } from '../textKeys.js';

export type { ApiErrorCode, FindingKey, Phrase, PhraseText, SpfIssueKey, TextParams, TextRef } from '../textKeys.js';

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
  /**
   * Restlaufzeit in Sekunden, wie der Resolver sie meldet — `null`, wenn sie
   * unbekannt ist (z. B. weil die TTL-Abfrage ausgefallen ist, #76).
   *
   * `null` statt eines optionalen Felds, weil `undefined` im JSON-Export
   * (`JSON.stringify`) samt Schlüssel verschwindet; `"ttl": null` sagt dort
   * ausdrücklich „unbekannt“. Und statt `0`, weil 0 eine gültige TTL ist
   * („nicht cachen“) — als Platzhalter stand bei MX, NS und TXT deshalb
   * immer eine falsche `0s` in der Liste.
   */
  ttl: number | null;
  priority?: number;
}

export type Severity = 'critical' | 'warning' | 'info' | 'success';

/**
 * Warum eine Abfrage keine Antwort brachte: Zeitüberschreitung, SERVFAIL
 * (oder eine andere Fehlerantwort des Resolvers) oder ein Netzwerkfehler.
 *
 * Ein Ausfall ist kein Ergebnis über die Domain. „Gibt es nicht“ — NXDOMAIN,
 * NODATA, Port 443 zu, Handshake abgelehnt — ist dagegen eines und wird nie so
 * markiert.
 */
export type LookupFailure = 'timeout' | 'servfail' | 'network';

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
   * Text-Kennung für die Übersetzung im Client (#86), wenn sie von `id`
   * abweicht. Fehlt sie, ist die `id` selbst die Kennung.
   */
  key?: FindingKey;
  /** Werte aus Titel und Beschreibung (`{count}` → `params.count`). */
  params?: TextParams;
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
  /**
   * Der Check selbst scheiterte (siehe `LookupFailure`): das Finding meldet nur
   * „konnte nicht geprüft werden“. Es wird angezeigt und gezählt, zieht aber
   * keine Punkte ab — sonst schwankte der Score mit der Erreichbarkeit der
   * Resolver statt mit der Domain.
   */
  unchecked?: boolean;
  /**
   * Nur eine Empfehlung: angezeigt und gezählt, aber ohne Score-Abzug. Für
   * Standards, die eine gute Mail-Konfiguration ergänzen, ohne dass ihr
   * Fehlen eine Lücke wäre (BIMI, TLS-RPT, #83) — sonst sänke der Score fast
   * jeder Domain, ohne dass sich an ihr etwas geändert hat.
   */
  advisory?: boolean;
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
  /**
   * Restlaufzeit des Negativ-Caches in Sekunden, je abgefragtem Typ ohne
   * Eintrag (NXDOMAIN/NODATA, #131): so lange gibt der Resolver „gibt es
   * nicht“ weiter. Nach RFC 2308 das Kleinere aus der TTL des mitgelieferten
   * SOA und seinem MINIMUM-Feld. Fehlt, wenn der Resolver kein SOA mitschickt —
   * dann ist die Zeit unbekannt.
   */
  negativeTtl?: Partial<Record<RecordType, number>>;
}

/**
 * Warum ein autoritativer Nameserver nicht prüfbar war (#133). Wie bei
 * `LookupFailure` eine Aussage über die Abfrage, nicht über die Domain.
 *
 * - `timeout`: keine Antwort in der Zeit — auch, wenn Port 53 vom Server aus
 *   gesperrt ist
 * - `network`: Verbindung scheiterte (kein Weg zum Ziel, Port zu, kein IPv6)
 * - `refused` / `servfail`: der Nameserver lehnte ab (REFUSED) oder meldete
 *   einen Fehler (SERVFAIL, FORMERR …)
 * - `not_authoritative`: er antwortete, aber nicht als zuständiger Server
 *   (AA-Bit fehlt): Verweis an andere Server, oder eine Antwort aus einem
 *   Cache — eine „lahme Delegation“
 * - `invalid_response`: Antwort unlesbar oder passt nicht zur Frage
 * - `blocked`: der Name zeigt nur auf nicht-öffentliche Adressen — nicht gefragt
 * - `no_address`: keine Adresse ermittelbar
 * - `rate_limited`: diese Adresse wurde in der letzten Minute zu oft gefragt
 * - `no_ipv6`: der diggy-Server hat kein IPv6 — die IPv6-Adresse wurde nicht
 *   gefragt, oder die Frage scheiterte schon am Verbinden
 */
export type AuthoritativeFailure =
  | 'timeout'
  | 'network'
  | 'refused'
  | 'servfail'
  | 'not_authoritative'
  | 'invalid_response'
  | 'blocked'
  | 'no_address'
  | 'rate_limited'
  | 'no_ipv6';

/** Antwort eines autoritativen Nameservers, direkt über Port 53 gefragt (#133). */
export interface AuthoritativeServer {
  /** Name aus dem NS-Record, ohne Punkt am Ende. */
  host: string;
  /** Die gefragte Adresse — fehlt bei `blocked` und `no_address`. */
  ip?: string;
  /**
   * Records aus dem Answer-Abschnitt: der gefragte Typ, dazu ein CNAME, dem
   * der Name folgt. Leer bei einem Fehler und bei „gibt es nicht“.
   */
  records: DnsRecord[];
  /** Seriennummer aus dem SOA der Zone, wie dieser Server es führt. */
  serial?: string;
  /**
   * Primary aus dem SOA (MNAME). Seriennummern sind nur unter Servern
   * desselben Primary vergleichbar: Zonen bei zwei Anbietern führt jeder mit
   * eigener Zählung (Route 53 immer mit 1).
   */
  primary?: string;
  responseTimeMs: number;
  error?: AuthoritativeFailure;
}

/** Antwort von `/api/lookup/authoritative`. */
export interface AuthoritativeResult {
  domain: string;
  type: RecordType;
  /** Die zuständige Zone; fehlt, wenn sie sich nicht ermitteln ließ. */
  zone?: string;
  /** Je gefragter Adresse ein Eintrag — höchstens acht. */
  nameservers: AuthoritativeServer[];
  /** Weitere Nameserver der Zone, die über der Obergrenze lagen und nicht gefragt wurden. */
  omitted?: number;
  /**
   * Die Nameserver haben IPv6-Adressen, gefragt wurde aber nur über IPv4:
   * Der diggy-Server hat kein IPv6.
   */
  ipv6Skipped?: true;
  /**
   * Die Zone oder ihre Nameserver ließen sich nicht ermitteln: `no_zone` —
   * kein NS-Record bis hinauf zur registrierbaren Domain; `lookup_failed` —
   * die Abfrage dafür scheiterte.
   */
  error?: 'no_zone' | 'lookup_failed';
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
  /**
   * Die DS- oder DNSKEY-Abfrage scheiterte (Timeout, SERVFAIL, HTTP-Fehler).
   * `enabled` und `valid` sind dann nur der Stand ohne diese Antwort, nicht
   * belastbar. Truthy heißt gescheitert; der Wert nennt den Grund.
   */
  lookupFailed?: LookupFailure;
}

/*
 * `lookupFailed` in MailSecurity: die Abfrage scheiterte (Timeout, SERVFAIL) —
 * `present: false` heißt dann „unbekannt“, nicht „kein Record“. Fehlt das
 * Feld, war die Antwort echt (auch NXDOMAIN/NODATA).
 */
export interface MailSecurity {
  spf: {
    present: boolean;
    record?: string;
    lookupCount?: number;
    valid: boolean;
    issues: string[];
    /** Dieselben Probleme als Kennung und Werte, in gleicher Reihenfolge (#86). */
    issueDetails?: TextRef<SpfIssueKey>[];
    lookupFailed?: LookupFailure;
  };
  dmarc: {
    /** Unter `_dmarc.<domain>` steht ein Record mit `v=DMARC1` — ob er wirkt, ist eine andere Frage. */
    present: boolean;
    /** Der Record — bei mehreren der erste, alle stehen dann in `records`. */
    record?: string;
    /**
     * Nur bei mehr als einem Record mit `v=DMARC1`: alle. Dann wenden
     * Empfänger DMARC gar nicht an (RFC 7489 §6.6.3, Schritt 5). Fehlt bei
     * genau einem Record und in Antworten älterer Server.
     */
    records?: string[];
    /**
     * `p=` aus dem Record, nur wenn gültig. Bewertet wird nicht dieses Feld,
     * sondern die wirksame Policy (`effectiveDmarcPolicy`, shared/dmarc.ts):
     * Ohne gültiges `p=` kann sie trotzdem `none` sein, mit ungültigem `sp=`
     * ist sie höchstens `none`, auch neben `p=reject`, und bei mehreren
     * Records gilt gar keine (RFC 7489 §6.6.3).
     */
    policy?: 'none' | 'quarantine' | 'reject';
    rua?: string;
    lookupFailed?: LookupFailure;
  };
  dkim: {
    selectors: { selector: string; present: boolean; record?: string }[];
    /** Nur ohne gefundenen Selector: mindestens eine Probe blieb unbeantwortet. */
    lookupFailed?: LookupFailure;
  };
  mtaSts: { present: boolean; lookupFailed?: LookupFailure };
  /**
   * Ob die Apex-Domain MX-Records hat (für Findings bei Subdomain-Lookups).
   * Auch ein Null-MX zählt hier mit — ob die Domain Mail empfängt, sagt erst
   * `hasMx && !nullMx`.
   */
  hasMx: boolean;
  /**
   * Null-MX nach RFC 7505 (`MX 0 .`): die Domain nimmt bewusst keine Mail an.
   * Regel und Rolle von SPF/DMARC: shared/nullMx.ts.
   */
  nullMx: boolean;
  /**
   * BIMI und TLS-RPT (#83). Optional, weil ältere Server-Antworten sie nicht
   * kennen — dann zeigt der Mail-Tab die Karten nicht an.
   */
  bimi?: MailBimi;
  tlsRpt?: MailTlsRpt;
}

/**
 * Gemeinsamer Teil von BIMI und TLS-RPT: ein TXT-Record unter einem festen
 * Namen, der mit einem Versions-Tag beginnt (Regeln: shared/bimiTlsRpt.ts).
 */
export interface MailPolicyRecord {
  /**
   * Unter dem Namen steht ein Record, der dafür gedacht ist — auch ein
   * ungültiger. `false` heißt: fehlt.
   */
  present: boolean;
  /** Die gefundenen Records; mehr als einer ist ungültig. */
  records?: string[];
  /** Warum Empfänger den Record nicht auswerten; fehlt bei einem gültigen. */
  invalid?: string;
  /** Derselbe Grund als Satzbaustein, für die Übersetzung (#86). */
  invalidDetail?: Phrase;
  /**
   * Die DNS-Abfrage ist gescheitert (Timeout, SERVFAIL); der Wert nennt den
   * Grund. Dann wissen wir nicht, ob der Record existiert — das ist kein
   * „fehlt“, sondern „nicht prüfbar“ (#101).
   */
  lookupFailed?: LookupFailure;
}

/** BIMI-Record auf `default._bimi.<domain>`. */
export interface MailBimi extends MailPolicyRecord {
  /** `l=` und `a=` leer: Die Domain verzichtet ausdrücklich auf BIMI. */
  declined?: boolean;
  /** Logo-URL aus `l=`, nur https. Wird nie vom Server geladen. */
  logoUrl?: string;
  /** Zertifikats-URL (VMC/CMC) aus `a=`, nur https. */
  evidenceUrl?: string;
}

/** TLS-RPT-Record auf `_smtp._tls.<domain>` (RFC 8460). */
export interface MailTlsRpt extends MailPolicyRecord {
  /** Berichtsziele aus `rua=`: `mailto:`- oder `https:`-URIs. */
  rua?: string[];
}

export interface WhoisInfo {
  /**
   * Die tatsächlich abgefragte, registrierbare Domain — bei `www.example.com`
   * also `example.com`. Optional, weil ältere Reports (History, JSON-Export)
   * sie noch nicht enthalten.
   */
  domain?: string;
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
  /**
   * Record-Typen, deren Abfrage scheiterte (Timeout, SERVFAIL …). Sie fehlen
   * in `records`, ohne dass es sie nicht gibt.
   */
  failedRecordTypes?: RecordType[];
  /**
   * Der TLS-Check scheiterte (Timeout, Netzwerk, DNS). `ssl` fehlt dann, ohne
   * dass es kein Zertifikat gibt.
   */
  sslLookupFailed?: LookupFailure;
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
