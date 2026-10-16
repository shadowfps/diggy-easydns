import { describe, expect, it } from 'vitest';
import { leadingVersion, matchTag } from './mailTags.js';

describe('matchTag', () => {
  it.each(['sp=none; p=reject', 'p=reject; sp=none'])(
    'trennt Policy und Subdomain-Policy: %s',
    (record) => {
      expect(matchTag(record, 'p')).toBe('reject');
      expect(matchTag(record, 'sp')).toBe('none');
    }
  );

  it('trimmt Namen und Werte und vergleicht Namen kleingeschrieben', () => {
    expect(matchTag(' ; P \t= REJECT \t; ', 'p')).toBe('REJECT');
  });

  it('erhält Großbuchstaben, Leerzeichen und Gleichheitszeichen in Werten', () => {
    expect(matchTag('rua=mailto:Reports@example.com, mailto:Other@example.com', 'rua'))
      .toBe('mailto:Reports@example.com, mailto:Other@example.com');
    expect(matchTag('p=AbC123==;', 'p')).toBe('AbC123==');
  });

  it('findet fehlende Tags weder in anderen Namen noch in Werten', () => {
    expect(matchTag('sp=none; rua=mailto:p=reject@example.com; p', 'p')).toBeUndefined();
    expect(matchTag('', 'p')).toBeUndefined();
    expect(matchTag(undefined, 'p')).toBeUndefined();
  });

  it('nimmt bei doppelten Tags den ersten Wert, auch einen leeren', () => {
    expect(matchTag('p=none; P=reject', 'p')).toBe('none');
    expect(matchTag('p= ; p=reject', 'p')).toBe('');
  });
});

describe('leadingVersion', () => {
  it('liest v= nur als erstes Tag', () => {
    expect(leadingVersion('v=DMARC1; p=reject')).toBe('DMARC1');
    expect(leadingVersion(' v = DMARC1 ;p=reject')).toBe('DMARC1');
    expect(leadingVersion('v=DKIM1')).toBe('DKIM1');
  });

  it('übersieht ein v= an anderer Stelle oder ein fehlendes', () => {
    expect(leadingVersion('p=reject; v=DMARC1')).toBeUndefined();
    expect(leadingVersion('; v=DMARC1')).toBeUndefined();
    expect(leadingVersion('sv=DMARC1; p=reject')).toBeUndefined();
    expect(leadingVersion('')).toBeUndefined();
    expect(leadingVersion(undefined)).toBeUndefined();
  });
});
