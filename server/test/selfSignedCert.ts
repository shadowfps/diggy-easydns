/**
 * Selbstsigniertes Zertifikat für 127.0.0.1 und localhost — für Tests gegen
 * einen lokalen HTTPS-/HTTP/2-Server (#137).
 *
 * Nur mit node:crypto gebaut: Kein Schlüssel im Repo, den ein Secret-Scanner
 * meldet, kein `openssl` auf dem Runner nötig, und es läuft nie ab — jeder
 * Testlauf erzeugt ein neues, einen Tag gültig. ECDSA P-256 mit SHA-256; das
 * DER-Gerüst (RFC 5280) steht unten Feld für Feld.
 */

import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';

type Bytes = number[];

function length(n: number): Bytes {
  if (n < 0x80) return [n];
  const bytes: Bytes = [];
  for (let rest = n; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

const tlv = (tag: number, content: Bytes): Bytes => [tag, ...length(content.length), ...content];
const sequence = (...items: Bytes[]) => tlv(0x30, items.flat());
const set = (...items: Bytes[]) => tlv(0x31, items.flat());
const ascii = (text: string): Bytes => [...Buffer.from(text, 'ascii')];

function oid(dotted: string): Bytes {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * first + second];
  for (const arc of rest) {
    const chunk = [arc & 0x7f];
    for (let n = arc >> 7; n > 0; n >>= 7) chunk.unshift(0x80 | (n & 0x7f));
    bytes.push(...chunk);
  }
  return tlv(0x06, bytes);
}

/** INTEGER, positiv: mit führender Null, wenn das oberste Bit gesetzt ist. */
const integer = (bytes: Bytes) => tlv(0x02, bytes[0] & 0x80 ? [0, ...bytes] : bytes);

/** UTCTime `YYMMDDHHMMSSZ` — gilt bis 2049, länger braucht es kein Test. */
const utcTime = (date: Date) => tlv(0x17, ascii(date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));

export interface TestCertificate {
  cert: string;
  key: string;
}

export function selfSignedCert(): TestCertificate {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ecdsaWithSha256 = sequence(oid('1.2.840.10045.4.3.2'));
  const subject = sequence(set(sequence(oid('2.5.4.3'), tlv(0x0c, ascii('localhost')))));
  const now = Date.now();
  // Erstes Byte zwischen 0x40 und 0x7f: positiv, und ohne führende Null, die
  // OpenSSL bei INTEGER als unzulässiges Padding ablehnt.
  const serial = [...randomBytes(8)];
  serial[0] = (serial[0] & 0x3f) | 0x40;
  // subjectAltName: dNSName [2] localhost, iPAddress [7] 127.0.0.1
  const subjectAltName = sequence(
    oid('2.5.29.17'),
    tlv(0x04, sequence(tlv(0x82, ascii('localhost')), tlv(0x87, [127, 0, 0, 1])))
  );

  const tbsCertificate = sequence(
    tlv(0xa0, integer([2])), // Version 3
    integer(serial),
    ecdsaWithSha256,
    subject, // Aussteller = Inhaber
    sequence(utcTime(new Date(now - 60 * 60_000)), utcTime(new Date(now + 24 * 60 * 60_000))),
    subject,
    [...publicKey.export({ type: 'spki', format: 'der' })],
    tlv(0xa3, sequence(subjectAltName))
  );
  const signature = sign('sha256', Buffer.from(tbsCertificate), privateKey);
  const der = Buffer.from(sequence(tbsCertificate, ecdsaWithSha256, tlv(0x03, [0, ...signature])));

  return {
    cert: `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}
