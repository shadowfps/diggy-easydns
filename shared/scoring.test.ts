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
