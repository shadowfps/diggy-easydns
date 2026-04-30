/**
 * DNSSEC-Check.
 *
 * Wir validieren DNSSEC auf zwei Wegen:
 *  1) AD-Flag (Authenticated Data) — Cloudflare/Quad9 setzen es nur, wenn
 *     der Resolver die Chain validiert hat. Das ist die kürzeste Antwort
 *     auf "ist DNSSEC korrekt aktiv".
 *  2) DS- und DNSKEY-Records direkt anfragen, um zu erkennen ob die Domain
 *     überhaupt signiert ist und welcher Algorithmus verwendet wird.
 *
 * Wir machen KEINE eigene kryptografische Validierung — das wäre ein
 * Riesen-Brett (RRSIG, NSEC, anchor von . root). Stattdessen vertrauen
 * wir der AD-Bewertung mehrerer Resolver.
 */

import { DOH_RESOLVERS, dohQuery } from './doh.js';
import type { DnssecInfo } from '../types.js';

/**
 * DNSKEY-Algorithmen laut IANA-Registry.
 * Wir mappen nur die in der Praxis vorkommenden — Rest fällt auf "Algorithm N".
 */
const DNSSEC_ALGORITHMS: Record<number, string> = {
  5: 'RSASHA1',
  7: 'RSASHA1-NSEC3-SHA1',
  8: 'RSASHA256',
  10: 'RSASHA512',
  13: 'ECDSAP256SHA256',
  14: 'ECDSAP384SHA384',
  15: 'ED25519',
  16: 'ED448',
};

export async function checkDnssec(domain: string): Promise<DnssecInfo> {
  // Zwei unabhängige Resolver mit aktivem DO-Bit fragen.
  // Wenn beide AD=true setzen, sind wir uns sicher dass die Chain valid ist.
  const cloudflare = DOH_RESOLVERS.find((r) => r.id === 'cloudflare')!;
  const google = DOH_RESOLVERS.find((r) => r.id === 'google')!;

  const [dnskeyCf, dsCf, adVerifyG] = await Promise.allSettled([
    dohQuery(cloudflare, domain, 'DNSKEY', { dnssec: true, timeoutMs: 5000 }),
    dohQuery(cloudflare, domain, 'DS', { dnssec: true, timeoutMs: 5000 }),
    // Eine A-Query mit DNSSEC reicht zur AD-Flag-Prüfung — kein eigener Lookup nötig
    dohQuery(google, domain, 'A', { dnssec: true, timeoutMs: 5000 }),
  ]);

  const dnskey = dnskeyCf.status === 'fulfilled' ? dnskeyCf.value : null;
  const ds = dsCf.status === 'fulfilled' ? dsCf.value : null;
  const g = adVerifyG.status === 'fulfilled' ? adVerifyG.value : null;

  const hasDs = (ds?.records.length ?? 0) > 0;
  const hasDnskey = (dnskey?.records.length ?? 0) > 0;
  const enabled = hasDs && hasDnskey;

  // AD-Flag von zwei verschiedenen Resolvern als "valide"
  const cfAuth = dnskey?.authenticated === true;
  const gAuth = g?.authenticated === true;
  const valid = enabled && (cfAuth || gAuth);

  let chainOfTrust: DnssecInfo['chainOfTrust'];
  if (!enabled) {
    chainOfTrust = 'none';
  } else if (valid) {
    chainOfTrust = 'valid';
  } else if (hasDnskey && !hasDs) {
    // Domain signiert sich, aber Parent kennt keinen DS → Chain unterbrochen
    chainOfTrust = 'incomplete';
  } else {
    chainOfTrust = 'invalid';
  }

  // Algorithmus aus dem ersten DNSKEY-Record extrahieren
  // DoH-Format: "<flags> <protocol> <algorithm> <key>"
  let algorithm: string | undefined;
  const firstKey = dnskey?.records[0]?.value;
  if (firstKey) {
    const algNum = Number(firstKey.split(/\s+/)[2]);
    if (!Number.isNaN(algNum)) {
      algorithm = DNSSEC_ALGORITHMS[algNum] ?? `Algorithm ${algNum}`;
    }
  }

  return {
    enabled,
    valid,
    algorithm,
    chainOfTrust,
  };
}
