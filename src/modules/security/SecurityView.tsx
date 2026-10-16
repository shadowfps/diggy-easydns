import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Lock, ShieldCheck, ShieldAlert, ShieldOff, ShieldQuestion } from 'lucide-react';
import type { DnssecInfo, SslInfo } from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { cn } from '@/lib/cn';
import { CardHeader, type Tone } from '@/components/ui/CardHeader';
import { UncheckedBadge, UncheckedLine } from '@/components/ui/Unchecked';
import { CalendarButton } from '@/components/calendar/CalendarButton';

interface SecurityViewProps {
  /** Geprüfter Host — Betreff und Report-Link der Kalender-Erinnerung. */
  domain: string;
  ssl: SectionSlice<SslInfo | null>;
  /** false bei DNS-Einträgen wie `_dmarc.…` — dort gibt es keinen Host für TLS. */
  sslApplicable?: boolean;
  dnssec: SectionSlice<DnssecInfo>;
}

const NO_DNSSEC: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

/*
 * „nicht prüfbar“ (#101): eine ausgefallene Sektion genauso wie ein Timeout
 * im Check — vorher stand dort „Kein TLS“ bzw. „nicht aktiviert“. `unchecked`
 * ist die Zeile, warum; ohne sie hat der Check ein Ergebnis.
 */
export function SecurityView({ domain, ssl, sslApplicable = true, dnssec }: SecurityViewProps) {
  const dnssecInfo = dnssec.data ?? NO_DNSSEC;

  const sslUnchecked = (ssl.status === 'error' || ssl.lookupFailed) && (
    <UncheckedLine name="SSL" reason={ssl.lookupFailed} />
  );

  // Ein gefundener Schlüssel ist ein Ergebnis, auch wenn die zweite Abfrage
  // scheiterte.
  const dnssecFailed = !dnssecInfo.enabled && dnssecInfo.lookupFailed;
  const dnssecUnchecked = (dnssec.status === 'error' || dnssecFailed) && (
    <UncheckedLine name="DNSSEC" reason={dnssecFailed}>
      {/* Validierende Resolver weisen eine kaputte Signatur mit SERVFAIL ab. */}
      {dnssecFailed === 'servfail' &&
        'Bleibt es bei SERVFAIL, steckt meist eine fehlerhafte Signatur dahinter.'}
    </UncheckedLine>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SslCard
        domain={domain}
        ssl={ssl.data ?? undefined}
        applicable={sslApplicable}
        unchecked={sslUnchecked}
      />
      <DnssecCard dnssec={dnssecInfo} unchecked={dnssecUnchecked} />
    </div>
  );
}

/* ─── SSL ─────────────────────────────────────────────────────────────── */

/** Dieselben Schwellen wie die SSL-Findings: < 14 Tage Warnung, abgelaufen kritisch. */
function sslTone(ssl: SslInfo): Tone {
  if (!ssl.valid || ssl.daysUntilExpiry < 0) return 'danger';
  if (ssl.daysUntilExpiry < 14) return 'warning';
  return 'success';
}

function SslCard({
  domain,
  ssl,
  applicable,
  unchecked,
}: {
  domain: string;
  ssl?: SslInfo;
  applicable: boolean;
  unchecked?: ReactNode;
}) {
  if (!applicable) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card"
      >
        <CardHeader icon={<Lock className="size-4" />} title="SSL / TLS" />
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">
          Nicht anwendbar: Namen mit Unterstrich sind DNS-Einträge, keine Hosts —
          unter ihnen läuft kein Webserver mit Zertifikat.
        </p>
      </motion.div>
    );
  }

  if (!ssl) {
    // Der zugehörige Befund (no-ssl) ist eine Warnung, kein kritischer Fehler.
    // Scheiterte nur der Check, ist nichts bewertet: neutral, „nicht prüfbar“.
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card"
      >
        <CardHeader
          icon={<Lock className="size-4" />}
          title="SSL / TLS"
          tone={unchecked ? 'neutral' : 'warning'}
          aside={unchecked && <UncheckedBadge />}
        />
        {unchecked ? (
          <div className="mt-4">{unchecked}</div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-warning">
            <ShieldOff className="size-4 shrink-0" />
            <span>Kein TLS auf Port 443 erreichbar</span>
          </div>
        )}
      </motion.div>
    );
  }

  const tone = sslTone(ssl);
  const expiryBadge =
    ssl.daysUntilExpiry < 0
      ? 'badge-danger'
      : ssl.daysUntilExpiry < 14
      ? 'badge-warning'
      : 'badge-success';

  const validFrom = new Date(ssl.validFrom).toLocaleDateString('de-DE');
  const validTo = new Date(ssl.validTo).toLocaleDateString('de-DE');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card"
    >
      <CardHeader
        icon={<Lock className="size-4" />}
        title="SSL / TLS"
        tone={tone}
        aside={
          ssl.valid ? (
            <span className="badge badge-success">gültig</span>
          ) : (
            <span className="badge badge-danger">nicht vertrauenswürdig</span>
          )
        }
      />

      <dl className="mt-4 space-y-3">
        <Row label="Aussteller" value={ssl.issuer} />
        <Row label="Subject" value={ssl.subject} mono />
        <Row
          label="Gültig"
          value={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {validFrom} – {validTo}
              </span>
              <span className={cn('badge', expiryBadge)}>
                {ssl.daysUntilExpiry < 0
                  ? `seit ${Math.abs(ssl.daysUntilExpiry)} Tagen abgelaufen`
                  : `noch ${ssl.daysUntilExpiry} Tage`}
              </span>
            </span>
          }
        />
        <Row label="Protokoll" value={`${ssl.tlsVersion} · ${ssl.signatureAlgorithm}`} />
      </dl>

      {/* Für ein abgelaufenes Zertifikat gibt es nichts mehr vorzumerken. */}
      {ssl.daysUntilExpiry >= 0 && (
        <div className="mt-4">
          <CalendarButton
            reminder={{
              kind: 'certificate',
              subject: domain,
              expiresAt: ssl.validTo,
              reportDomain: domain,
            }}
          />
        </div>
      )}

      {ssl.sans.length > 0 && (
        <div className="mt-5 border-t border-line-subtle pt-5">
          <div className="text-xs text-fg-subtle">SANs ({ssl.sans.length})</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {ssl.sans.slice(0, 12).map((san) => (
              <span key={san} className="badge font-mono font-normal">
                {san}
              </span>
            ))}
            {ssl.sans.length > 12 && (
              <span className="self-center text-xs text-fg-subtle">
                +{ssl.sans.length - 12}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ─── DNSSEC ─────────────────────────────────────────────────────────── */

function DnssecCard({ dnssec, unchecked }: { dnssec: DnssecInfo; unchecked?: ReactNode }) {
  let icon = <ShieldOff className="size-4" />;
  let tone: Tone = 'neutral';
  let statusText = 'inaktiv';
  let badge = <span className="badge">nicht aktiviert</span>;
  let body = (
    <p className="text-sm leading-relaxed text-fg-muted">
      DNSSEC schützt deine Domain gegen DNS-Spoofing. Die meisten Registrare bieten DNSSEC mit
      einem Klick — beim Hosting-Panel nachsehen.
    </p>
  );

  if (unchecked) {
    icon = <ShieldQuestion className="size-4" />;
    statusText = 'unbekannt';
    badge = <UncheckedBadge />;
    body = <>{unchecked}</>;
  } else if (dnssec.enabled && dnssec.valid && dnssec.chainOfTrust === 'valid') {
    icon = <ShieldCheck className="size-4" />;
    tone = 'success';
    statusText = 'aktiv & valide';
    badge = <span className="badge badge-success">Chain of Trust valide</span>;
    body = (
      <dl className="space-y-3">
        <Row label="Algorithmus" value={dnssec.algorithm ?? 'unbekannt'} mono />
        <Row
          label="Status"
          value="DS- und DNSKEY-Records vorhanden, von Cloudflare und Quad9 validiert."
        />
      </dl>
    );
  } else if (dnssec.enabled && dnssec.chainOfTrust === 'incomplete') {
    icon = <ShieldAlert className="size-4" />;
    tone = 'danger';
    statusText = 'Chain unterbrochen';
    badge = <span className="badge badge-danger">Chain unterbrochen</span>;
    body = (
      <p className="text-sm leading-relaxed text-fg-muted">
        Die Domain hat einen DNSKEY, aber der Parent-DS-Record fehlt. Resolver können die Signatur
        nicht prüfen → DNSSEC ist effektiv aus. Beim Registrar den DS-Record nachtragen.
      </p>
    );
  } else if (dnssec.enabled && dnssec.chainOfTrust === 'invalid') {
    icon = <ShieldAlert className="size-4" />;
    tone = 'danger';
    statusText = 'invalid';
    badge = <span className="badge badge-danger">Validierung fehlgeschlagen</span>;
    body = (
      <p className="text-sm leading-relaxed text-fg-muted">
        DS und DNSKEY sind da, aber die Chain validiert nicht. Möglicherweise abgelaufene
        Signaturen oder falsche Schlüssel.
      </p>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className="card"
    >
      <CardHeader icon={icon} title={`DNSSEC · ${statusText}`} tone={tone} aside={badge} />
      <div className="mt-4">{body}</div>
    </motion.div>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

/** Eine Zeile der Label/Wert-Liste — dieselbe Form wie in der WHOIS-Ansicht. */
function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-xs text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          'min-w-0 flex-1 text-sm text-fg wrap-break-word',
          mono && 'font-mono text-[13px]'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
