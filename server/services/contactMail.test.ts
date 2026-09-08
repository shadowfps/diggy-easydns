import { describe, expect, it } from 'vitest';
import {
  ContactValidationError,
  sanitizeMailDisplayName,
  validateContactInput,
} from './contactMail.js';

const input = (overrides: Partial<{ name: string; email: string; message: string }> = {}) => ({
  name: 'Testerin',
  email: 'test@example.com',
  message: 'Eine ausreichend lange Testnachricht.',
  ...overrides,
});

describe('validateContactInput', () => {
  it('lässt gültige Eingaben durch und normalisiert', () => {
    const result = validateContactInput(input({ email: '  Test@Example.COM ', name: '  Max  ' }));
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('Max');
  });

  /**
   * Nodemailer interpretiert einen Wert mit Komma oder Semikolon als
   * ADRESSLISTE. `a,opfer@example.com` ging damit an opfer@example.com und
   * umging Empfänger-Tageslimit, Selbstsende-Prüfung und Duplikat-Hash, weil
   * alle drei auf dem Rohstring arbeiten.
   */
  it('lehnt Adresslisten-Injektion ab', () => {
    for (const email of [
      'a,opfer@example.com',
      'a;opfer@example.com',
      'a, opfer@example.com',
      'a<opfer@example.com>',
      'a@example.com, b@example.com',
      'a@example.com;b@example.com',
      'a(kommentar)@example.com',
      'a[b]@example.com',
      'a:b@example.com',
      '"a"@example.com,b@example.com',
    ]) {
      expect(() => validateContactInput(input({ email })), email).toThrow(ContactValidationError);
    }
  });

  it('lehnt sonstige ungültige Adressen ab', () => {
    for (const email of ['ohne-at', 'a@b', '@example.com', 'a@', 'a b@example.com', '']) {
      expect(() => validateContactInput(input({ email })), JSON.stringify(email)).toThrow(
        ContactValidationError
      );
    }
  });

  it('erzwingt Mindest- und Maximallänge der Nachricht', () => {
    expect(() => validateContactInput(input({ message: 'kurz' }))).toThrow(ContactValidationError);
    expect(() => validateContactInput(input({ message: 'x'.repeat(5001) }))).toThrow(
      ContactValidationError
    );
  });

  it('lehnt Steuerzeichen ab', () => {
    expect(() => validateContactInput(input({ name: 'Max\u0001Mustermann' }))).toThrow(
      ContactValidationError
    );
    expect(() => validateContactInput(input({ message: 'Lang genug\u0000mit NUL' }))).toThrow(
      ContactValidationError
    );
  });

  it('verlangt einen Namen', () => {
    expect(() => validateContactInput(input({ name: '   ' }))).toThrow(ContactValidationError);
  });
});

describe('sanitizeMailDisplayName', () => {
  it('entfernt Zeichen, die Header-Injection erlauben würden', () => {
    const injected = sanitizeMailDisplayName('Max\r\nBcc: opfer@example.com');
    expect(injected).not.toContain('\n');
    expect(injected).not.toContain('\r');

    const quoted = sanitizeMailDisplayName('Max" <evil@example.com>, "a');
    expect(quoted).not.toContain('<');
    expect(quoted).not.toContain('>');
    expect(quoted).not.toContain('"');
  });

  it('kürzt auf die Maximallänge', () => {
    expect(sanitizeMailDisplayName('n'.repeat(500))).toHaveLength(120);
  });
});
