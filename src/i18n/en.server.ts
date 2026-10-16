import type { ApiErrorCode, FindingKey } from '@/types/dns';
import type { Message } from './de';

/**
 * Englisch für Texte, die der Server liefert (#86): Findings und
 * Fehlermeldungen. Teil des englischen Chunks.
 *
 * Anders als die Oberflächentexte sind die Schlüssel hier Kennungen, keine
 * deutschen Sätze: der Server setzt Werte in seine Sätze ein („Zertifikat
 * läuft in 12 Tagen ab“), der fertige Satz taugt also nicht als Schlüssel.
 * Er schickt deshalb Kennung und Werte mit (shared/textKeys.ts). Auf Deutsch
 * zeigt der Client weiter den Text des Servers.
 *
 * Fehlt hier ein Eintrag oder liefert der Server einen Wert nicht, zeigt der
 * Client den deutschen Text — nie einen halben Satz.
 */

export interface FindingText {
  title: Message;
  description: Message;
  /** Erklärung zum Fix. Der Snippet selbst ist Code und bleibt, wie er ist. */
  fix?: Message;
}

const SPF_ISSUE = 'SPF record has a problem';

export const findings: Record<FindingKey, FindingText> = {
  // ─── DNS-Basics ──────────────────────────────────────────────────────
  'no-records': {
    title: 'No entry under this name',
    description:
      'There’s no DNS record at {domain}. If a DKIM key, a DMARC policy or a challenge token belongs here, it isn’t published (anymore) — or the name has a typo.',
  },
  'no-address': {
    title: 'No A/AAAA/CNAME records found',
    description: 'The domain doesn’t resolve to an IP. Visitors can’t reach the site.',
  },
  'no-address-host': {
    title: 'No A/AAAA/CNAME records found',
    description: 'The hostname {domain} doesn’t resolve to an IP. Visitors can’t reach this host.',
  },
  'no-ipv6': {
    title: 'No IPv6 (AAAA record)',
    description: 'The domain is only reachable over IPv4. IPv6 improves reachability on modern networks.',
  },
  'no-ipv6-host': {
    title: 'No IPv6 (AAAA record)',
    description: '{domain} is only reachable over IPv4.',
  },
  'no-ns': {
    title: 'No nameservers found',
    description:
      'Without NS records the domain doesn’t resolve. It has probably expired or is delegated incorrectly.',
  },
  'no-caa': {
    title: 'No CAA record',
    description:
      'CAA records let you decide which certificate authorities may issue certificates for your domain — a simple safeguard against mis-issuance.',
    fix: 'Add a CAA record that only allows the CA you actually use.',
  },
  'caa-present': {
    title: 'CAA record present',
    description: 'Only authorized certificate authorities may issue certificates for this domain.',
  },

  // ─── Mail ────────────────────────────────────────────────────────────
  'no-spf': {
    title: 'No SPF record found',
    description:
      'The domain receives email (MX present), but without SPF other servers can send email in your name.',
    fix: 'Add an SPF record as a TXT record on the domain.',
  },
  'no-spf-no-mx': {
    title: 'No SPF record found',
    description: 'Even without active email, SPF (with -all) protects against spoofing in your name.',
    fix: 'Add an SPF record as a TXT record on the domain.',
  },
  'spf-lookups-over-limit': {
    title: SPF_ISSUE,
    description: '{count} DNS lookups — the RFC limit is 10, so SPF fails.',
  },
  'spf-lookups-near-limit': {
    title: SPF_ISSUE,
    description: '{count} DNS lookups — close to the limit of 10.',
  },
  'spf-plus-all': {
    title: SPF_ISSUE,
    description: '+all allows any sender — it offers effectively no protection.',
  },
  'spf-no-all': {
    title: SPF_ISSUE,
    description: 'No "all" mechanism at the end — unusual, check your policy.',
  },
  'spf-issue': {
    title: SPF_ISSUE,
    description: 'Something in the SPF record looks off — check its syntax and lookup count.',
  },
  'spf-ok': {
    title: 'SPF record present and plausible',
    description: { one: '{count} DNS lookup, valid ending.', other: '{count} DNS lookups, valid ending.' },
  },
  'no-dmarc': {
    title: 'No DMARC record at _dmarc.<domain>',
    description: 'Without DMARC, attackers can more easily send email in your name (spoofing).',
    fix: 'Add a DMARC record. With p=none you only get reports at first — nothing is rejected yet.',
  },
  'dmarc-policy-none': {
    title: 'DMARC policy is p=none (reporting only)',
    description:
      'With p=none, spoofing attempts are reported but not rejected. Once the reports look stable, switch to quarantine.',
  },
  'dmarc-present': {
    title: 'DMARC policy: {policy}',
    description: 'DMARC record present — protection against email spoofing is active.',
  },
  'dmarc-present-no-policy': {
    title: 'DMARC policy: set',
    description: 'DMARC record present — protection against email spoofing is active.',
  },
  'no-dkim-found': {
    title: 'No DKIM selector found',
    description:
      'We tried common selectors (default, google, selector1, k1, …) and found nothing. Maybe you use an unusual selector — check manually, or set up DKIM.',
  },
  'dkim-present': {
    title: 'DKIM selectors active: {selectors}',
    description: 'Outgoing email is signed — recipients can verify that it’s authentic.',
  },
  'no-mta-sts': {
    title: 'No MTA-STS',
    description:
      'MTA-STS enforces TLS for incoming email. Without it, attackers can force a downgrade to unencrypted SMTP.',
  },

  // ─── DNSSEC ──────────────────────────────────────────────────────────
  'dnssec-off': {
    title: 'DNSSEC not enabled',
    description:
      'DNSSEC signs DNS answers cryptographically. It protects against DNS spoofing and cache poisoning.',
  },
  'dnssec-incomplete': {
    title: 'DNSSEC chain broken',
    description:
      'The domain has DNSKEYs, but the DS record in the parent zone is missing. Resolvers can’t validate the signature.',
    fix: 'Add the DS record that matches your DNSKEY at your registrar.',
  },
  'dnssec-invalid': {
    title: 'DNSSEC chain invalid',
    description:
      'DS record and DNSKEY exist, but the resolver didn’t validate the signature. The keys may have expired.',
  },
  'dnssec-valid': {
    title: 'DNSSEC active and valid',
    description: 'Chain of trust verified. Algorithm: {algorithm}.',
  },
  'dnssec-valid-no-algorithm': {
    title: 'DNSSEC active and valid',
    description: 'Chain of trust verified.',
  },

  // ─── SSL ─────────────────────────────────────────────────────────────
  'no-ssl': {
    title: 'No TLS reachable on port 443',
    description:
      'We couldn’t complete a TLS handshake. Either port 443 is closed, no web server is running, or the certificate is broken beyond use.',
  },
  'ssl-invalid': {
    title: 'SSL certificate invalid',
    description:
      'The certificate isn’t trusted by the system. It may be self-signed, or the hostname doesn’t match.',
  },
  'ssl-expired': {
    title: { one: 'Certificate expired {count} day ago', other: 'Certificate expired {count} days ago' },
    description: 'Browsers show security warnings. Renew it right away.',
  },
  'ssl-expiring-soon': {
    title: { one: 'Certificate expires in {count} day', other: 'Certificate expires in {count} days' },
    description: 'If auto-renew isn’t set up: renew now. Let’s Encrypt usually renews 30 days ahead.',
  },
  'ssl-ok': {
    title: {
      one: 'SSL certificate valid ({count} day left)',
      other: 'SSL certificate valid ({count} days left)',
    },
    description: 'Issued by {issuer} via {tlsVersion}.',
  },
  'ssl-old-tls': {
    title: 'Outdated TLS version: {tlsVersion}',
    description: 'TLS 1.0/1.1 are deprecated. Upgrade to TLS 1.2 or newer.',
  },

  // ─── Propagation ─────────────────────────────────────────────────────
  'propagation-mismatch': {
    title: 'Propagation mismatch detected',
    description:
      '{count} resolvers return {answers} different answers — either not propagated yet, or GeoDNS / Anycast.',
  },
  'propagation-consistent': {
    title: 'Consistent propagation',
    description: 'All {count} resolvers return the same result.',
  },

  // ─── WHOIS ───────────────────────────────────────────────────────────
  'domain-expired': {
    title: { one: 'Domain expired {count} day ago', other: 'Domain expired {count} days ago' },
    description:
      'The domain has officially expired and can be deleted or registered by someone else at any time.',
  },
  'domain-expiring-critical': {
    title: { one: 'Domain expires in {count} day', other: 'Domain expires in {count} days' },
    description: 'Renew urgently! Otherwise you’ll lose the domain.',
  },
  'domain-expiring-soon': {
    title: { one: 'Domain expires in {count} day', other: 'Domain expires in {count} days' },
    description: 'Renew in good time, before the deadline gets tight.',
  },
  'whois-status-clienthold': {
    title: 'Domain status: {status}',
    description: 'The registrar has put the domain on hold — it doesn’t resolve.',
  },
  'whois-status-serverhold': {
    title: 'Domain status: {status}',
    description: 'The registry has put the domain on hold — resolution is blocked.',
  },
  'whois-status-pendingdelete': {
    title: 'Domain status: {status}',
    description: 'The domain is about to be deleted. Very hard to rescue at this point.',
  },
  'whois-status-pendingrestore': {
    title: 'Domain status: {status}',
    description: 'The domain is being restored after it expired — usually for a fee.',
  },
  'whois-status-redemptionperiod': {
    title: 'Domain status: {status}',
    description: 'The domain has expired but can still be redeemed (for a fee).',
  },
  'domain-young': {
    title: { one: 'Domain is only {count} day old', other: 'Domain is only {count} days old' },
    description:
      'Freshly registered domains are often treated with more suspicion by spam and phishing filters.',
  },
};

/**
 * Fehlermeldungen nach Code. Wo der Server je nach Ursache verschiedene
 * deutsche Sätze schickt (Timeout, Kontingent, Upstream), steht hier ein
 * Satz, der für alle passt.
 */
export const apiErrors: Record<ApiErrorCode, string> = {
  cross_site_denied: 'This check can only be started from within diggy.',
  cross_origin_denied: 'Requests from another origin aren’t allowed for this endpoint.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  quota_rate_limited:
    'The {provider} check is limited to 10 requests per hour because it uses an external API quota.',
  server_busy: 'Too many checks are running right now. Please try again in a minute.',
  not_a_hostname: '"{input}" is a DNS entry, not a host — this check needs a web server.',
  invalid_domain: '"{input}" doesn’t look like a valid domain.',
  blocked_target: 'This target isn’t a public address.',
  invalid_ip: '"{input}" isn’t a public IP address.',
  domain_not_found: 'The domain "{domain}" couldn’t be resolved.',
  invalid_query: 'Please enter a domain name.',
  lookup_failed: 'The lookup failed.',
  propagation_failed: 'The propagation check failed.',
  dnssec_failed: 'The DNSSEC check failed.',
  ssl_failed: 'The SSL check failed.',
  mail_failed: 'The email audit failed.',
  whois_failed: 'The WHOIS lookup failed.',
  techstack_failed: 'Tech stack detection failed.',
  ip_details_failed: 'Couldn’t load the IP details.',
  pagespeed_failed:
    'The PageSpeed analysis failed. Heavy pages sometimes time out — please try again.',
  virusscan_failed: 'The VirusTotal scan failed. Please try again in a moment.',
  domain_check_failed: 'Please enter a valid domain name or label, e.g. myproject or myproject.com.',
  contact_not_configured: 'The contact form isn’t set up at the moment.',
  contact_rate_limited: 'Too many form requests. Please try again later.',
  contact_challenge_failed:
    'The form has expired or was sent too quickly. Please reload the page and try again.',
  contact_invalid_input: 'Please check your name, email address and message.',
  contact_failed: 'Your message couldn’t be sent right now. Please try again later.',
};
