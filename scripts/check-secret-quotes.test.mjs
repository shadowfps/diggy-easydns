import { describe, expect, it } from 'vitest';
import { quotedSecrets } from './check-secret-quotes.mjs';

/**
 * Der Deploy prüft damit, ob ein Secret samt den Anführungszeichen aus der
 * .env angelegt wurde — so war das Kontaktformular monatelang kaputt.
 */
describe('quotedSecrets', () => {
  it('findet Werte in doppelten und einfachen Anführungszeichen', () => {
    const env = {
      SMTP_PASS: '"geheim#mit#raute"',
      CONTACT_FROM: `'"diggy Kontaktformular" <noreply@example.com>'`,
      CONTACT_TO: 'hallo@example.com',
    };
    expect(quotedSecrets(['SMTP_PASS', 'CONTACT_FROM', 'CONTACT_TO'], env)).toEqual(['SMTP_PASS', 'CONTACT_FROM']);
  });

  it('lässt einen Absender mit Anzeigenamen in Anführungszeichen durch', () => {
    expect(quotedSecrets(['CONTACT_FROM'], { CONTACT_FROM: '"diggy Kontaktformular" <noreply@diggydns.cloud>' })).toEqual([]);
  });

  it('ignoriert leere, fehlende und einzelne Zeichen', () => {
    expect(quotedSecrets(['A', 'B', 'C', 'D'], { A: '', B: '"', C: `"'` })).toEqual([]);
  });

  it('prüft auch mit Leerraum drumherum — der Server schneidet ihn ab', () => {
    expect(quotedSecrets(['SMTP_PASS'], { SMTP_PASS: ' "geheim" ' })).toEqual(['SMTP_PASS']);
  });
});
