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
import { pinnedLookup, resolvePublicHost, UnresolvableTargetError } from '../lib/safeTarget.js';
import type { LookupFailure, SslInfo } from '../types.js';

/**
 * Ergebnis des TLS-Checks. Früher `SslInfo | null` — `null` stand für „kein
 * TLS“ und für „Handshake im Timeout“ zugleich, und beides wurde als
 * Warnung „Kein TLS auf Port 443“ gemeldet (#101).
 *
 *  - `none`: es gibt dort kein TLS — keine Adresse, Port 443 zu, Handshake
 *    abgelehnt, kein brauchbares Zertifikat.
 *  - `failed`: wir wissen es nicht — Zeitüberschreitung, Netz oder Host nicht
 *    erreichbar, DNS gerade gestört.
 */
export type SslCheckResult =
  | { status: 'ok'; info: SslInfo }
  | { status: 'none' }
  | { status: 'failed'; reason: LookupFailure };

/**
 * Socket-Fehler, die nichts über den Server sagen, sondern nur, dass wir ihn
 * nicht erreicht haben. ENETUNREACH kommt etwa, wenn eine Domain nur AAAA hat
 * und unser Server kein IPv6 spricht.
 *
 * Alles andere — ECONNREFUSED (Port zu), ECONNRESET und die OpenSSL-Fehler
 * (Handshake abgelehnt, kein TLS auf dem Port) — ist eine Antwort des Servers.
 */
const NETWORK_ERRORS = new Set([
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EHOSTDOWN',
  'EADDRNOTAVAIL',
]);

const NONE: SslCheckResult = { status: 'none' };

function socketFailure(error: NodeJS.ErrnoException): SslCheckResult {
  if (error.code === 'ETIMEDOUT') return { status: 'failed', reason: 'timeout' };
  if (error.code && NETWORK_ERRORS.has(error.code)) return { status: 'failed', reason: 'network' };
  return NONE;
}

/**
 * Ohne Adresse kein Zertifikat — es sei denn, die Auflösung scheiterte nur
 * gerade: EAI_AGAIN liefert getaddrinfo bei SERVFAIL und Resolver-Timeouts,
 * ENOTFOUND/ENODATA bei Namen ohne Adresse.
 */
function resolveFailure(error: UnresolvableTargetError): SslCheckResult {
  const code = (error.cause as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EAI_AGAIN' ? { status: 'failed', reason: 'servfail' } : NONE;
}

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
 * Versucht das Zertifikat zu holen. Ein ungültiges Zertifikat ist ein
 * Ergebnis (`valid: false`), kein Fehler; zur Unterscheidung von „kein TLS“
 * und „nicht erreicht“ siehe SslCheckResult.
 */
export async function checkSsl(domain: string, timeoutMs = 4000): Promise<SslCheckResult> {
  // SSRF-Guard: nicht gegen interne Adressen handshaken. Wirft
  // BlockedTargetError, wenn die Domain auf ein nicht-öffentliches Ziel zeigt.
  let target;
  try {
    target = await resolvePublicHost(domain);
  } catch (error) {
    // Kein A/AAAA-Record (Mail-only-Domain, geparkte Domain, Public Suffix):
    // gültige Eingabe, es gibt dort nur kein Zertifikat. Der Aufrufer macht
    // daraus das Finding "Kein TLS auf Port 443 erreichbar" — außer die
    // Auflösung scheiterte nur gerade.
    if (error instanceof UnresolvableTargetError) return resolveFailure(error);
    throw error;
  }

  return new Promise<SslCheckResult>((resolve) => {
    let resolved = false;
    const safeResolve = (value: SslCheckResult) => {
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
      // Verbindung auf die geprüften Adressen pinnen — sonst bliebe zwischen
      // Prüfung und Handshake ein DNS-Rebinding-Fenster.
      lookup: pinnedLookup(target),
      // Wir wollen WISSEN ob das Cert gültig ist.
      // rejectUnauthorized=true → bei Cert-Fehler → 'error'-Event.
      // Aber wir möchten bei einem ungültigen Cert trotzdem das Cert
      // einsehen können → daher rejectUnauthorized=false und valid manuell setzen.
      rejectUnauthorized: false,
      ALPNProtocols: ['h2', 'http/1.1'],
    });

    // Ein stumm verworfenes SYN (Firewall) sieht genauso aus wie ein
    // überlasteter Server — beides ist „nicht erreicht“, nicht „kein TLS“.
    const timer = setTimeout(
      () => safeResolve({ status: 'failed', reason: 'timeout' }),
      timeoutMs
    );

    socket.once('secureConnect', () => {
      clearTimeout(timer);

      const cert = socket.getPeerCertificate(false) as PeerCert;
      if (!cert || Object.keys(cert).length === 0) {
        return safeResolve(NONE);
      }

      const validFromDate = cert.valid_from ? new Date(cert.valid_from) : null;
      const validToDate = cert.valid_to ? new Date(cert.valid_to) : null;
      if (!validFromDate || !validToDate || isNaN(validToDate.getTime())) {
        return safeResolve(NONE);
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

      safeResolve({ status: 'ok', info });
    });

    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      safeResolve(socketFailure(error));
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
