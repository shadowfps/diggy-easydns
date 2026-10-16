import { describe, expect, it } from 'vitest';
import type { RecordType } from '@/types/dns';
import {
  MAIL_EXPLANATIONS,
  RECORD_EXPLANATIONS,
  explainRecordType,
  type Explanation,
} from './explanations';

/**
 * Zu jedem Begriff aus #80 gibt es eine Erklärung — und sie hat die Form, die
 * der InfoButton erwartet: ein kurzer Titel und ein bis zwei Sätze.
 */

const RECORD_TYPES: RecordType[] = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CAA', 'SOA', 'CNAME'];
const MAIL_TERMS = ['SPF', 'DKIM', 'DMARC', 'MTA-STS'] as const;

function expectWellFormed(explanation: Explanation | undefined) {
  expect(explanation).toBeDefined();
  expect(explanation!.title.trim()).not.toBe('');
  // Ein Titel, kein Satz.
  expect(explanation!.title.length).toBeLessThanOrEqual(40);
  // Ein bis zwei Sätze, und nicht zu lang — mehr wird im Popover zur Textwand.
  const sentences = explanation!.text.match(/[.!?](?=\s|$)/g) ?? [];
  expect(sentences.length).toBeGreaterThanOrEqual(1);
  expect(sentences.length).toBeLessThanOrEqual(2);
  expect(explanation!.text.length).toBeLessThanOrEqual(260);
}

describe('Erklärungen', () => {
  it.each(RECORD_TYPES)('erklärt den Record-Typ %s', (type) => {
    expectWellFormed(explainRecordType(type));
  });

  it.each(MAIL_TERMS)('erklärt den Mail-Begriff %s', (term) => {
    expectWellFormed(MAIL_EXPLANATIONS[term]);
  });

  it('hat keine Erklärungen ohne Abnehmer', () => {
    expect(Object.keys(RECORD_EXPLANATIONS).sort()).toEqual([...RECORD_TYPES].sort());
    expect(Object.keys(MAIL_EXPLANATIONS).sort()).toEqual([...MAIL_TERMS].sort());
  });

  it('liefert für Typen ohne Text nichts statt eines leeren Popovers', () => {
    expect(explainRecordType('SRV')).toBeUndefined();
    expect(explainRecordType('DNSKEY')).toBeUndefined();
  });

  it('erklärt die TTL beim A-Record', () => {
    expect(RECORD_EXPLANATIONS.A.text).toContain('TTL');
  });
});
