import { motion } from 'framer-motion';
import { Lock, ShieldCheck, ShieldAlert, ShieldOff, Calendar, Award, Hash } from 'lucide-react';
import type { DnssecInfo, SslInfo } from '@/types/dns';
import { cn } from '@/lib/cn';

interface SecurityViewProps {
  ssl?: SslInfo;
  dnssec: DnssecInfo;
}

export function SecurityView({ ssl, dnssec }: SecurityViewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SslCard ssl={ssl} />
      <DnssecCard dnssec={dnssec} />
    </div>
  );
}

/* ─── SSL ─────────────────────────────────────────────────────────────── */

function SslCard({ ssl }: { ssl?: SslInfo }) {
  if (!ssl) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="surface rounded-xl p-5"
      >
        <CardHeader icon={<Lock className="w-4 h-4" />} title="SSL / TLS" />
        <div className="mt-4 flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
          <ShieldOff className="w-4 h-4" />
          <span>Kein TLS auf Port 443 erreichbar</span>
        </div>
      </motion.div>
    );
  }

  const expiryColor =
    ssl.daysUntilExpiry < 0
      ? 'text-red-600 dark:text-red-400'
      : ssl.daysUntilExpiry < 14
      ? 'text-orange-600 dark:text-orange-400'
      : 'text-emerald-600 dark:text-emerald-400';

  const validFrom = new Date(ssl.validFrom).toLocaleDateString('de-DE');
  const validTo = new Date(ssl.validTo).toLocaleDateString('de-DE');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="surface rounded-xl p-5"
    >
      <CardHeader
        icon={<Lock className="w-4 h-4" />}
        title="SSL / TLS"
        badge={
          ssl.valid ? (
            <Badge tone="ok">gültig</Badge>
          ) : (
            <Badge tone="bad">nicht vertrauenswürdig</Badge>
          )
        }
      />

      <div className="mt-4 space-y-3 text-sm">
        <Row icon={<Award className="w-3.5 h-3.5" />} label="Aussteller" value={ssl.issuer} />
        <Row icon={<Hash className="w-3.5 h-3.5" />} label="Subject" value={ssl.subject} mono />
        <Row
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Gültig"
          value={
            <span>
              {validFrom} – {validTo}
              <span className={cn('ml-2 text-xs font-medium', expiryColor)}>
                {ssl.daysUntilExpiry < 0
                  ? `seit ${Math.abs(ssl.daysUntilExpiry)} Tagen abgelaufen`
                  : `noch ${ssl.daysUntilExpiry} Tage`}
              </span>
            </span>
          }
        />
        <Row
          icon={<Lock className="w-3.5 h-3.5" />}
          label="Protokoll"
          value={`${ssl.tlsVersion} · ${ssl.signatureAlgorithm}`}
        />
      </div>

      {ssl.sans.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-900/80">
          <div className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 mb-2 font-medium">
            SANs ({ssl.sans.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ssl.sans.slice(0, 12).map((san) => (
              <span
                key={san}
                className="font-mono text-[11px] px-2 py-0.5 rounded bg-ink-100 dark:bg-ink-900 text-ink-900/70 dark:text-ink-50/70"
              >
                {san}
              </span>
            ))}
            {ssl.sans.length > 12 && (
              <span className="text-[11px] text-ink-900/40 dark:text-ink-50/40 self-center">
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

function DnssecCard({ dnssec }: { dnssec: DnssecInfo }) {
  let statusIcon = <ShieldOff className="w-4 h-4 text-ink-900/40 dark:text-ink-50/40" />;
  let statusText = 'inaktiv';
  let badge = <Badge tone="muted">nicht aktiviert</Badge>;
  let body = (
    <p className="text-sm text-ink-900/60 dark:text-ink-50/60 leading-relaxed">
      DNSSEC schützt deine Domain gegen DNS-Spoofing. Die meisten Registrare bieten DNSSEC mit
      einem Klick — beim Hosting-Panel nachsehen.
    </p>
  );

  if (dnssec.enabled && dnssec.valid && dnssec.chainOfTrust === 'valid') {
    statusIcon = <ShieldCheck className="w-4 h-4 text-emerald-500" />;
    statusText = 'aktiv & valide';
    badge = <Badge tone="ok">Chain of Trust valide</Badge>;
    body = (
      <div className="text-sm space-y-2">
        <div className="flex items-center gap-2 text-ink-900/70 dark:text-ink-50/70">
          <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 w-20 shrink-0">
            Algorithmus
          </span>
          <span className="font-mono text-xs">{dnssec.algorithm ?? 'unbekannt'}</span>
        </div>
        <div className="flex items-center gap-2 text-ink-900/70 dark:text-ink-50/70">
          <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 w-20 shrink-0">
            Status
          </span>
          <span>DS- und DNSKEY-Records vorhanden, von Cloudflare und Quad9 validiert.</span>
        </div>
      </div>
    );
  } else if (dnssec.enabled && dnssec.chainOfTrust === 'incomplete') {
    statusIcon = <ShieldAlert className="w-4 h-4 text-red-500" />;
    statusText = 'Chain unterbrochen';
    badge = <Badge tone="bad">Chain unterbrochen</Badge>;
    body = (
      <p className="text-sm text-ink-900/70 dark:text-ink-50/70 leading-relaxed">
        Die Domain hat einen DNSKEY, aber der Parent-DS-Record fehlt. Resolver können die Signatur
        nicht prüfen → DNSSEC ist effektiv aus. Beim Registrar den DS-Record nachtragen.
      </p>
    );
  } else if (dnssec.enabled && dnssec.chainOfTrust === 'invalid') {
    statusIcon = <ShieldAlert className="w-4 h-4 text-red-500" />;
    statusText = 'invalid';
    badge = <Badge tone="bad">Validierung fehlgeschlagen</Badge>;
    body = (
      <p className="text-sm text-ink-900/70 dark:text-ink-50/70 leading-relaxed">
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
      className="surface rounded-xl p-5"
    >
      <CardHeader icon={statusIcon} title={`DNSSEC · ${statusText}`} badge={badge} />
      <div className="mt-4">{body}</div>
    </motion.div>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

function CardHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-ink-900/60 dark:text-ink-50/60">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      {badge}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-ink-900/40 dark:text-ink-50/40 mt-0.5">{icon}</span>
      <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 w-20 shrink-0 font-medium pt-0.5">
        {label}
      </span>
      <span
        className={cn(
          'flex-1 text-ink-900/80 dark:text-ink-50/80 break-words',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'ok' | 'bad' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider',
        tone === 'ok' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        tone === 'bad' && 'bg-red-500/10 text-red-600 dark:text-red-400',
        tone === 'muted' && 'bg-ink-100 dark:bg-ink-900 text-ink-900/50 dark:text-ink-50/50'
      )}
    >
      {children}
    </span>
  );
}
