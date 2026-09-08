import { describe, expect, it } from 'vitest';
import { isPublicIp } from './safeTarget.js';

/**
 * Der Klassifizierer ist die Grundlage des SSRF-Schutzes. Er muss FAIL CLOSED
 * arbeiten: was er nicht sicher als öffentlich erkennt, gilt als intern.
 */
describe('isPublicIp', () => {
  it('blockt private und reservierte IPv4-Bereiche', () => {
    for (const ip of [
      '0.0.0.0',
      '10.0.0.1',
      '10.255.255.254',
      '100.64.0.1',
      '127.0.0.1',
      '127.1.2.3',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.2.5',
      '192.168.1.1',
      '198.18.0.1',
      '224.0.0.1',
      '240.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it('erlaubt öffentliche IPv4 — auch direkt an den Bereichsgrenzen', () => {
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '11.0.0.1',
      '172.15.255.255',
      '172.32.0.1',
      '100.63.255.255',
      '100.128.0.1',
      '223.255.255.255',
    ]) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });

  it('blockt Loopback, ULA, Link-local und Multicast in IPv6', () => {
    for (const ip of ['::', '::1', 'fe80::1', 'fe80::1%eth0', 'fc00::1', 'fd12:3456::1', 'ff02::1']) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it('prüft die eingebettete IPv4 in Mapped- und NAT64-Adressen', () => {
    expect(isPublicIp('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicIp('::ffff:10.0.0.1')).toBe(false);
    expect(isPublicIp('64:ff9b::169.254.169.254')).toBe(false);
    // Mit öffentlicher eingebetteter Adresse ist das ein reguläres Ziel.
    expect(isPublicIp('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicIp('64:ff9b::8.8.8.8')).toBe(true);
  });

  it('blockt Transitions-Präfixe komplett — die waren fail-open', () => {
    for (const ip of [
      '::127.0.0.1', // IPv4-compatible (::/96)
      '::ffff:0:127.0.0.1', // IPv4-translated
      '2002:7f00:1::', // 6to4 mit 127.0.0.1
      '2001:0:0:0:0:0:7f00:1', // Teredo
      '64:ff9b:1::127.0.0.1', // Local-Use-NAT64 (RFC 8215)
      '2001:10::1', // ORCHID
      '2001:20::1', // ORCHIDv2
      '2001:db8::1', // Doku-Präfix
      '5f00::1', // SRv6 (RFC 9602)
      '100::1', // Discard
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it('erlaubt reguläre öffentliche IPv6', () => {
    for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:80e::200e', '2a02:26f0::1']) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });

  it('gilt bei unparsbarer Eingabe als nicht-öffentlich (fail closed)', () => {
    for (const input of ['', 'garbage', '999.1.1.1', '1.2.3', 'localhost', '::gg']) {
      expect(isPublicIp(input), JSON.stringify(input)).toBe(false);
    }
  });
});
