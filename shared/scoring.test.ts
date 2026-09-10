import { describe, expect, it } from 'vitest';
import { calculateScore, verdictFor } from './scoring.js';
import type { Finding } from './types/dns.js';

const finding = (severity: Finding['severity'], id: string = severity): Finding => ({
  id,
  severity,
  title: id,
  description: '',
  category: 'dns',
});

describe('calculateScore', () => {
  it('startet bei 100 ohne Findings', () => {
    expect(calculateScore([]).score).toBe(100);
  });

  it('zieht pro Severity den festgelegten Betrag ab', () => {
    expect(calculateScore([finding('critical')]).score).toBe(75);
    expect(calculateScore([finding('warning')]).score).toBe(92);
    expect(calculateScore([finding('info')]).score).toBe(98);
    expect(calculateScore([finding('success')]).score).toBe(100);
  });

  it('klemmt bei 0 statt negativ zu werden', () => {
    const many = Array.from({ length: 10 }, (_, i) => finding('critical', `c${i}`));
    expect(calculateScore(many).score).toBe(0);
  });

  /**
   * Info-Findings feuern bei üblichen Setups (kein IPv6, kein CAA, kein
   * DNSSEC, kein MTA-STS). Eine einwandfrei konfigurierte Domain landete
   * dadurch bei 92 und damit knapp unter "Hervorragend" — für Empfehlungen,
   * nicht für Mängel.
   */
  it('deckelt den Abzug aus info-Findings', () => {
    const infos = Array.from({ length: 6 }, (_, i) => finding('info', `i${i}`));
    // 6 × 2 = 12 wären es ohne Deckel, der Deckel liegt bei 6.
    expect(calculateScore(infos).score).toBe(94);
  });

  it('lässt critical und warning ungedeckelt', () => {
    const mixed = [
      finding('critical', 'c1'),
      finding('warning', 'w1'),
      ...Array.from({ length: 6 }, (_, i) => finding('info', `i${i}`)),
    ];
    expect(calculateScore(mixed).score).toBe(100 - 25 - 8 - 6);
  });

  /**
   * Findings entstehen in verschiedenen Endpoints und sehen sich gegenseitig
   * nicht. Eine abgelaufene Domain löst nicht mehr auf — `no-address` aus
   * /api/lookup und `domain-expired` aus /api/lookup/whois sind beide wahr,
   * beschreiben aber eine Ursache. Ohne Dedup waren das 50 Punkte für ein
   * Problem.
   */
  it('zieht ein Folge-Finding nicht zusätzlich ab, wenn seine Ursache vorliegt', () => {
    const consequence: Finding = {
      ...finding('critical', 'no-address'),
      causedBy: ['domain-expired'],
    };
    const cause = finding('critical', 'domain-expired');

    expect(calculateScore([cause, consequence]).score).toBe(75);
    // Die Liste bleibt vollständig — nur der Score ändert sich.
    expect(calculateScore([cause, consequence]).counts.critical).toBe(2);
  });

  it('zählt ein Folge-Finding normal, wenn die Ursache NICHT vorliegt', () => {
    const standalone: Finding = {
      ...finding('critical', 'no-address'),
      causedBy: ['domain-expired'],
    };
    expect(calculateScore([standalone]).score).toBe(75);
  });

  it('prüft alle genannten Ursachen, nicht nur die erste', () => {
    const consequence: Finding = {
      ...finding('critical', 'no-address'),
      causedBy: ['domain-expired', 'whois-status-clienthold'],
    };
    const hold = finding('critical', 'whois-status-clienthold');
    expect(calculateScore([hold, consequence]).score).toBe(75);
  });

  it('deduplizert auch info-Findings über causedBy', () => {
    const consequence: Finding = { ...finding('info', 'folge'), causedBy: ['ursache'] };
    const cause = finding('info', 'ursache');
    // Nur die Ursache zählt: 2 Punkte, nicht 4.
    expect(calculateScore([cause, consequence]).score).toBe(98);
  });

  it('zählt die Severities mit', () => {
    const result = calculateScore([finding('critical'), finding('warning'), finding('info', 'i2')]);
    expect(result.counts).toEqual({ success: 0, info: 1, warning: 1, critical: 1 });
  });
});

describe('verdictFor', () => {
  it('trifft die Schwellen genau', () => {
    expect(verdictFor(100)).toBe('Hervorragend');
    expect(verdictFor(90)).toBe('Hervorragend');
    expect(verdictFor(89)).toBe('Solides Setup');
    expect(verdictFor(75)).toBe('Solides Setup');
    expect(verdictFor(74)).toBe('Optimierbar');
    expect(verdictFor(55)).toBe('Optimierbar');
    expect(verdictFor(54)).toBe('Lückenhaft');
    expect(verdictFor(30)).toBe('Lückenhaft');
    expect(verdictFor(29)).toBe('Kritisch');
    expect(verdictFor(0)).toBe('Kritisch');
  });
});
