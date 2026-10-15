import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Building2, Server, ShieldCheck, ShieldOff, Lock, AlertCircle } from 'lucide-react';
import type { WhoisInfo } from '@/types/dns';
import { cn } from '@/lib/cn';
import { CardHeader } from '@/components/ui/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';

interface WhoisViewProps {
  whois?: WhoisInfo;
  onUseDomain?: (domain: string) => void;
}

/** EPP-Status-Codes übersetzt für Laien — kurz & verständlich. */
const STATUS_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  clienttransferprohibited: { label: 'Transfer-Sperre (Client)', tone: 'ok' },
  servertransferprohibited: { label: 'Transfer-Sperre (Registry)', tone: 'ok' },
  clientdeleteprohibited: { label: 'Lösch-Sperre (Client)', tone: 'ok' },
  serverdeleteprohibited: { label: 'Lösch-Sperre (Registry)', tone: 'ok' },
  clientupdateprohibited: { label: 'Update-Sperre (Client)', tone: 'ok' },
  serverupdateprohibited: { label: 'Update-Sperre (Registry)', tone: 'ok' },
  clientrenewprohibited: { label: 'Renewal-Sperre (Client)', tone: 'warn' },
  ok: { label: 'OK', tone: 'ok' },
  active: { label: 'Aktiv', tone: 'ok' },
  inactive: { label: 'Inaktiv', tone: 'warn' },
  pendingcreate: { label: 'Erstellung läuft', tone: 'warn' },
  pendingrenew: { label: 'Renewal läuft', tone: 'warn' },
  pendingupdate: { label: 'Update läuft', tone: 'warn' },
  pendingtransfer: { label: 'Transfer läuft', tone: 'warn' },
  pendingdelete: { label: 'Löschung läuft', tone: 'bad' },
  pendingrestore: { label: 'Restore läuft', tone: 'bad' },
  redemptionperiod: { label: 'Redemption Period', tone: 'bad' },
  clienthold: { label: 'Client-Hold (nicht aufgelöst!)', tone: 'bad' },
  serverhold: { label: 'Server-Hold (nicht aufgelöst!)', tone: 'bad' },
};

const STATUS_BADGE: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'badge-success',
  warn: 'badge-warning',
  bad: 'badge-danger',
};

export function WhoisView({ whois, onUseDomain }: WhoisViewProps) {
  /**
   * Bezugszeitpunkt einmal beim Mount festhalten.
   *
   * `Date.now()` stand vorher direkt in den beiden Rechnungen weiter unten und
   * lief damit bei jedem Render neu. Die Werte hingen also daran, wann die
   * Komponente zufällig neu rendert — genau das beanstandet react-hooks/purity.
   * Beide Angaben sind auf Tage gerundet, ein fester Zeitpunkt pro Mount reicht.
   *
   * Steht bewusst VOR dem frühen Return: Hooks müssen in jedem Render laufen.
   */
  const [now] = useState(() => Date.now());

  if (!whois) {
    return (
      <EmptyState icon={<AlertCircle className="size-5" />} title="WHOIS / RDAP nicht verfügbar">
        Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.
      </EmptyState>
    );
  }

  const expiresInDays = whois.expiresAt
    ? Math.floor((new Date(whois.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24))
    : undefined;
  const ageDays = whois.createdAt
    ? Math.floor((now - new Date(whois.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  // Dieselben Schwellen wie die WHOIS-Findings: unter 7 Tagen (oder schon
  // abgelaufen) kritisch, unter 30 Tagen eine Warnung.
  const expiryBadge =
    expiresInDays === undefined
      ? ''
      : expiresInDays < 7
      ? 'badge-danger'
      : expiresInDays < 30
      ? 'badge-warning'
      : 'badge-success';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Registrar + Daten */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="card md:col-span-2"
      >
        <CardHeader
          icon={<Building2 className="size-4" />}
          title="Registrierung"
          aside={
            whois.source && (
              <span
                className="block max-w-40 truncate font-mono text-xs text-fg-subtle sm:max-w-none"
                title={whois.source}
              >
                {whois.source}
              </span>
            )
          }
        />

        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Registrar" value={whois.registrar ?? '—'} />
          <Row
            label="Erstellt"
            value={
              whois.createdAt ? (
                <span>
                  {formatDate(whois.createdAt)}
                  {ageDays !== undefined && (
                    <span className="ml-2 text-xs text-fg-subtle">
                      ({formatAge(ageDays)})
                    </span>
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Row
            label="Läuft ab"
            value={
              whois.expiresAt ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{formatDate(whois.expiresAt)}</span>
                  {expiresInDays !== undefined && (
                    <span className={cn('badge', expiryBadge)}>
                      {expiresInDays < 0
                        ? `vor ${Math.abs(expiresInDays)} Tagen`
                        : `noch ${expiresInDays} Tage`}
                    </span>
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Row
            label="Geändert"
            value={whois.updatedAt ? formatDate(whois.updatedAt) : '—'}
          />
        </dl>
      </motion.div>

      {/* Nameserver aus WHOIS */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="card"
      >
        <CardHeader icon={<Server className="size-4" />} title="Nameserver (laut Registry)" />

        {whois.nameServers && whois.nameServers.length > 0 ? (
          // Klickbar als Chips (übernimmt den Namen in die Suche), sonst eine
          // schlichte Liste — ein nicht klickbarer Chip sähe bedienbar aus.
          <ul className={cn('mt-4', onUseDomain ? 'flex flex-wrap gap-2' : 'space-y-1.5')}>
            {whois.nameServers.map((ns) => (
              <li key={ns} className="min-w-0 max-w-full">
                {onUseDomain ? (
                  <button
                    type="button"
                    onClick={() => onUseDomain(ns)}
                    className="chip max-w-full font-mono"
                    title={`${ns} in die Suche übernehmen`}
                  >
                    <span className="min-w-0 truncate">{ns}</span>
                  </button>
                ) : (
                  <span className="block truncate font-mono text-[13px] text-fg">{ns}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-fg-subtle">Keine Nameserver gemeldet.</p>
        )}
      </motion.div>

      {/* Status + DNSSEC */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="card"
      >
        <CardHeader icon={<Lock className="size-4" />} title="Domain-Status" />

        {whois.status && whois.status.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {whois.status.map((s) => {
              const norm = s.toLowerCase().replace(/\s+/g, '');
              const meta = STATUS_LABELS[norm] ?? { label: s, tone: 'ok' as const };
              return (
                <span key={s} title={s} className={cn('badge', STATUS_BADGE[meta.tone])}>
                  {meta.label}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-fg-subtle">Keine Status-Codes.</p>
        )}

        <div className="mt-5 flex items-center gap-2 border-t border-line-subtle pt-4 text-sm">
          {whois.dnssecDelegated ? (
            <ShieldCheck className="size-4 shrink-0 text-success" />
          ) : (
            <ShieldOff className="size-4 shrink-0 text-fg-subtle" />
          )}
          <span className="text-fg-muted">
            DNSSEC bei Registry:{' '}
            <span className={whois.dnssecDelegated ? 'font-medium text-success' : 'text-fg-subtle'}>
              {whois.dnssecDelegated ? 'delegiert' : 'nicht delegiert'}
            </span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

/** Eine Zeile der Label/Wert-Liste — dieselbe Form wie in der Security-Ansicht. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-xs text-fg-subtle">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-fg wrap-break-word">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatAge(days: number): string {
  if (days < 60) return `${days} Tage`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} Monate`;
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return `${years} Jahre`;
  return `${years} Jahre, ${remainingMonths} Monate`;
}
