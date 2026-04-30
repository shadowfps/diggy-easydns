/**
 * SSL/TLS-Cert-Check.
 *
 * Wir bauen einen TLS-Handshake auf Port 443 auf und lesen das vom Server
 * präsentierte Zertifikat. Validierung wird Node selbst übernehmen
 * (rejectUnauthorized=true) — wenn der Handshake klappt, ist die Cert-Chain
 * gegen das System-CA-Bundle gültig.
 *
 * Hostnamen mit punycode/IDN: Node macht das transparent für uns.
 */

import { connect } from 'node:tls';
import type { SslInfo } from '../types.js';

interface PeerCert {
  subject?: { CN?: string; O?: string };
  issuer?: { CN?: string; O?: string };
  valid_from?: string; // "Apr 30 14:00:00 2025 GMT"
  valid_to?: string;
  subjectaltname?: string; // "DNS:example.com, DNS:www.example.com"
  fingerprint256?: string;
  bits?: number;
  // Spezifisch für RSA, EC, etc. — wir brauchen nur das Vorhandensein
  pubkey?: Buffer;
  asn1Curve?: string;
}

/**
 * Versucht das Zertifikat zu holen. Bei jedem Fehler
 * (Timeout, Cert-invalid, kein TLS) → null.
 */
export async function checkSsl(domain: string, timeoutMs = 6000): Promise<SslInfo | null> {
  return new Promise<SslInfo | null>((resolve) => {
    let resolved = false;
    const safeResolve = (value: SslInfo | null) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.destroy();
      } catch {
        // bereits geschlossen — ignorieren
      }
      resolve(value);
    };

    const socket = connect({
      host: domain,
      port: 443,
      servername: domain, // SNI
      // Wir wollen WISSEN ob das Cert gültig ist.
      // rejectUnauthorized=true → bei Cert-Fehler → 'error'-Event.
      // Aber wir möchten bei einem ungültigen Cert trotzdem das Cert
      // einsehen können → daher rejectUnauthorized=false und valid manuell setzen.
      rejectUnauthorized: false,
      ALPNProtocols: ['h2', 'http/1.1'],
    });

    const timer = setTimeout(() => safeResolve(null), timeoutMs);

    socket.once('secureConnect', () => {
      clearTimeout(timer);

      const cert = socket.getPeerCertificate(false) as PeerCert;
      if (!cert || Object.keys(cert).length === 0) {
        return safeResolve(null);
      }

      const validFromDate = cert.valid_from ? new Date(cert.valid_from) : null;
      const validToDate = cert.valid_to ? new Date(cert.valid_to) : null;
      if (!validFromDate || !validToDate || isNaN(validToDate.getTime())) {
        return safeResolve(null);
      }

      const sans = parseSans(cert.subjectaltname);
      const cn = cert.subject?.CN ?? '';
      const isWildcard = sans.some((s) => s.startsWith('*.')) || cn.startsWith('*.');

      // socket.authorized ist true wenn das Cert vom System validiert wurde
      // (host-mismatch zählt auch als unauthorized)
      const valid = socket.authorized === true;

      const daysUntilExpiry = Math.floor(
        (validToDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      const info: SslInfo = {
        valid,
        issuer: formatDn(cert.issuer),
        subject: cn || formatDn(cert.subject) || domain,
        validFrom: validFromDate.toISOString(),
        validTo: validToDate.toISOString(),
        daysUntilExpiry,
        sans,
        tlsVersion: socket.getProtocol() ?? 'unknown',
        signatureAlgorithm: detectSignatureAlgorithm(cert),
        isWildcard,
      };

      safeResolve(info);
    });

    socket.once('error', () => {
      clearTimeout(timer);
      safeResolve(null);
    });
  });
}

/**
 * "DNS:example.com, DNS:www.example.com, DNS:*.example.com" → Array
 */
function parseSans(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('DNS:'))
    .map((s) => s.slice(4));
}

function formatDn(dn?: { CN?: string; O?: string }): string {
  if (!dn) return '';
  if (dn.CN && dn.O) return `${dn.CN} (${dn.O})`;
  return dn.CN ?? dn.O ?? '';
}

/**
 * Wir haben aus dem Peer-Cert keinen direkten String für sigAlg —
 * Node liefert pubkey/asn1Curve. Wir nähern an: wenn asn1Curve gesetzt
 * → ECDSA mit Kurve, sonst RSA mit Bits.
 */
function detectSignatureAlgorithm(cert: PeerCert): string {
  if (cert.asn1Curve) return `ECDSA ${cert.asn1Curve}`;
  if (cert.bits) return `RSA ${cert.bits}`;
  return 'unknown';
}
