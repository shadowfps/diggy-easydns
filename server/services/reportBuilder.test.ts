import { describe, expect, it } from 'vitest';
import { dnsFindings, sslFindings, whoisFindings } from './reportBuilder.js';
import { calculateScore } from '../../shared/scoring.js';
import type { DnsRecord, SslInfo, WhoisInfo } from '../types.js';

const ssl = (overrides: Partial<SslInfo> = {}): SslInfo => ({
  valid: true,
  issuer: 'Test CA',
  subject: 'example.com',
  validFrom: new Date(Date.now() - 86_400_000).toISOString(),
  validTo: new Date(Date.now() + 90 * 86_400_000).toISOString(),
  daysUntilExpiry: 90,
  sans: ['example.com'],
  tlsVersion: 'TLSv1.3',
  signatureAlgorithm: 'ECDSA prime256v1',
  isWildcard: false,
  ...overrides,
});

describe('sslFindings', () => {
  it('meldet ein gültiges Zertifikat als success', () => {
    const findings = sslFindings(ssl());
    expect(findings.map((f) => f.id)).toEqual(['ssl-ok']);
  });

  /**
   * Ein abgelaufenes Zertifikat ist per Definition auch nicht
   * vertrauenswürdig. Vorher feuerten ssl-invalid UND ssl-expired, ein
   * einziges Problem kostete damit 50 von 100 Punkten.
   */
  it('bestraft ein abgelaufenes Zertifikat nur einmal', () => {
    const findings = sslFindings(ssl({ valid: false, daysUntilExpiry: -5 }));
    expect(findings.map((f) => f.id)).toEqual(['ssl-expired']);
    expect(calculateScore(findings).score).toBe(75);
  });

  it('meldet ein ungültiges, aber nicht abgelaufenes Zertifikat als ungültig', () => {
    const findings = sslFindings(ssl({ valid: false }));
    expect(findings.map((f) => f.id)).toEqual(['ssl-invalid']);
  });

  it('warnt vor bald ablaufenden Zertifikaten', () => {
    expect(sslFindings(ssl({ daysUntilExpiry: 5 })).map((f) => f.id)).toContain(
      'ssl-expiring-soon'
    );
  });

  it('bemängelt veraltete TLS-Versionen', () => {
    expect(sslFindings(ssl({ tlsVersion: 'TLSv1.1' })).map((f) => f.id)).toContain('ssl-old-tls');
  });

  it('meldet fehlendes TLS', () => {
    expect(sslFindings(null).map((f) => f.id)).toEqual(['no-ssl']);
  });
});

describe('dnsFindings — Zusammenspiel mit WHOIS', () => {
  const noRecords: DnsRecord[] = [];

  it('deklariert no-address und no-ns als Folge von Domain-Ablauf und Hold', () => {
    const findings = dnsFindings(noRecords, 'example.com', 'example.com');
    for (const id of ['no-address', 'no-ns']) {
      const finding = findings.find((f) => f.id === id);
      expect(finding?.causedBy, id).toContain('domain-expired');
      expect(finding?.causedBy, id).toContain('whois-status-clienthold');
    }
  });

  /**
   * Der Gesamt-Score über beide Endpoints: eine abgelaufene, gehaltene Domain
   * ergab vorher drei Criticals aus einer Ursache.
   */
  it('kostet bei abgelaufener Domain nur einmal Punkte', () => {
    const dns = dnsFindings(noRecords, 'example.com', 'example.com');
    const whois = whoisFindings({
      registrar: 'Test',
      nameServers: [],
      status: ['clientHold'],
      source: 'test',
      expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    });

    const all = [...dns, ...whois];
    // Drei Criticals aus einer Ursache: no-address, no-ns, domain-expired.
    expect(all.filter((f) => f.severity === 'critical')).toHaveLength(3);
    // Abgezogen wird nur die Ursache (25) plus die Info-Findings
    // (no-ipv6, no-caa = 4, unter dem Deckel von 6).
    expect(calculateScore(all).score).toBe(71);
  });

  it('zählt no-address voll, wenn die Domain nicht abgelaufen ist', () => {
    const dns = dnsFindings(noRecords, 'example.com', 'example.com');
    const whois = whoisFindings({
      registrar: 'Test',
      nameServers: ['ns1.example.com'],
      status: ['ok'],
      source: 'test',
      expiresAt: new Date(Date.now() + 300 * 86_400_000).toISOString(),
    });
    const all = [...dns, ...whois];
    expect(all.some((f) => f.id === 'no-address')).toBe(true);
    // no-address (25) plus no-ns (25) plus gedeckelte Infos (6).
    expect(calculateScore(all).score).toBeLessThanOrEqual(50);
  });
});

describe('whoisFindings', () => {
  it('erzeugt kein Finding, wenn RDAP nichts liefert', () => {
    // Dass eine TLD kein RDAP anbietet, ist keine Schwäche der Domain und
    // darf den Score nicht drücken.
    expect(whoisFindings(null)).toEqual([]);
    expect(calculateScore(whoisFindings(null)).score).toBe(100);
  });

  const whois = (overrides: Partial<WhoisInfo> = {}): WhoisInfo => ({
    registrar: 'Test Registrar',
    nameServers: ['ns1.example.com'],
    status: [],
    source: 'test',
    ...overrides,
  });

  it('meldet eine abgelaufene Domain', () => {
    const findings = whoisFindings(
      whois({ expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString() })
    );
    expect(findings.map((f) => f.id)).toContain('domain-expired');
  });

  it('zählt Redemption Period bei abgelaufener Domain nicht doppelt', () => {
    const findings = whoisFindings(
      whois({
        expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        status: ['redemptionPeriod'],
      })
    );
    expect(findings.filter((f) => f.severity === 'critical')).toHaveLength(1);
    expect(calculateScore(findings).score).toBe(75);
  });

  /**
   * Der Registrar stellt eine Domain beim Ablauf praktisch immer auf Hold.
   * Ohne Dedup ergaben domain-expired und whois-status-clienthold zusammen
   * 50 Punkte Abzug für eine Ursache.
   */
  it('zählt clientHold bei abgelaufener Domain nicht doppelt', () => {
    const findings = whoisFindings(
      whois({
        expiresAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        status: ['clientHold', 'redemptionPeriod'],
      })
    );
    expect(findings.filter((f) => f.severity === 'critical')).toHaveLength(1);
    expect(findings[0].id).toBe('domain-expired');
    expect(calculateScore(findings).score).toBe(75);
  });

  it('meldet clientHold auch ohne Ablaufdatum', () => {
    const findings = whoisFindings(whois({ status: ['clientHold'] }));
    expect(findings.map((f) => f.id)).toContain('whois-status-clienthold');
  });

  it('warnt vor bald ablaufenden Domains', () => {
    const findings = whoisFindings(
      whois({ expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString() })
    );
    expect(findings.map((f) => f.id)).toContain('domain-expiring-soon');
  });
});
