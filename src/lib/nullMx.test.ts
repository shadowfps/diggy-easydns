import { describe, expect, it } from 'vitest';
import { splitMxValue } from './nullMx';

describe('splitMxValue (#122)', () => {
  it('trennt Präferenz und Ziel', () => {
    expect(splitMxValue('10 mx.example.net')).toEqual({ priority: '10', target: 'mx.example.net' });
  });

  it('schreibt das leere Ziel eines Null-MX als „.“ — gespeichert und vergleichbar gemacht', () => {
    expect(splitMxValue('0 ')).toEqual({ priority: '0', target: '.' });
    expect(splitMxValue('0')).toEqual({ priority: '0', target: '.' });
    expect(splitMxValue('0 .')).toEqual({ priority: '0', target: '.' });
  });

  it('lässt einen Wert ohne Präferenz als Ziel stehen', () => {
    expect(splitMxValue('mx.example.net')).toEqual({ target: 'mx.example.net' });
  });
});
