import { describe, expect, it } from 'vitest';
import { version } from '../../package.json';
import { buildLabel } from './buildInfo';

describe('buildLabel', () => {
  it('zeigt die Version aus package.json mit dem Commit des Builds', () => {
    expect(buildLabel('085959d')).toBe(`v${version} · 085959d`);
  });

  it('zeigt ohne Commit nur die Version', () => {
    expect(buildLabel('')).toBe(`v${version}`);
    expect(buildLabel(undefined)).toBe(`v${version}`);
  });
});
