import { describe, expect, it } from 'vitest';
import { isInspectableIp } from './IpAddressLink';

/**
 * isInspectableIp steuert in App.tsx, ob eine Eingabe als IP-Lookup oder als
 * Domain behandelt wird. Die alte Heuristik `/^[0-9a-f:]+$/` ließ alles durch,
 * was nur Hex-Zeichen und Doppelpunkte enthält.
 */
describe('isInspectableIp', () => {
  it('erkennt IPv4', () => {
    for (const ip of ['8.8.8.8', '127.0.0.1', '255.255.255.255', '0.0.0.0']) {
      expect(isInspectableIp(ip), ip).toBe(true);
    }
  });

  it('lehnt ungültige IPv4 ab', () => {
    for (const value of ['256.1.1.1', '1.2.3', '1.2.3.4.5', '1.2.3.']) {
      expect(isInspectableIp(value), value).toBe(false);
    }
  });

  it('erkennt IPv6 in voller und komprimierter Form', () => {
    for (const ip of [
      '2606:4700:4700::1111',
      '2001:0db8:0000:0000:0000:0000:0000:0001',
      '::1',
      '::',
      'fe80::1',
      '2a00:1450:4001:80e::200e',
      '::ffff:8.8.8.8',
    ]) {
      expect(isInspectableIp(ip), ip).toBe(true);
    }
  });

  it('lehnt Hex-Fragmente ab, die keine IPv6 sind — das war der Fehler', () => {
    for (const value of ['ab:cd', 'cafe:babe', 'dead:beef', 'a:b', ':::', 'v=spf1:x']) {
      expect(isInspectableIp(value), value).toBe(false);
    }
  });

  it('behandelt Domains nicht als IP', () => {
    for (const value of ['example.com', 'www.example.com', 'localhost', '']) {
      expect(isInspectableIp(value), JSON.stringify(value)).toBe(false);
    }
  });
});
