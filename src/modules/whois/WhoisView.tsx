import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Building2, Server, ShieldCheck, ShieldOff, Lock, AlertCircle } from 'lucide-react';
import type { WhoisInfo } from '@/types/dns';
import { cn } from '@/lib/cn';
import { CardHeader } from '@/components/ui/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { t, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { CalendarButton } from '@/components/calendar/CalendarButton';

interface WhoisViewProps {
  /** Domain des Reports — Ziel des Links in der Kalender-Erinnerung. */
  domain: string;
  whois?: WhoisInfo;
  onUseDomain?: (domain: string) => void;
}

/** EPP-Status-Codes übersetzt für Laien — kurz & verständlich. */
const STATUS_LABELS: Record<string, { label: DeKey; tone: 'ok' | 'warn' | 'bad' }> = {
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

export function WhoisView({ domain, whois, onUseDomain }: WhoisViewProps) {
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
  const { tRich, formatDate } = useI18n();

  if (!whois) {
    return (
      <EmptyState icon={<AlertCircle className="size-5" />} title={t('WHOIS / RDAP nicht verfügbar')}>
        {t('Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.')}
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
          title={t('Registrierung')}
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
            label={t('Erstellt')}
            value={
              whois.createdAt ? (
                <span>
                  {formatDate(whois.createdAt, DATE_FORMAT)}
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
            label={t('Läuft ab')}
            value={
              whois.expiresAt ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{formatDate(whois.expiresAt, DATE_FORMAT)}</span>
                  {expiresInDays !== undefined && (
                    <span className={cn('badge', expiryBadge)}>
                      {expiresInDays < 0
                        ? t('vor {count} Tagen', { count: Math.abs(expiresInDays) })
                        : t('noch {count} Tage', { count: expiresInDays })}
                    </span>
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
          <Row
            label={t('Geändert')}
            value={whois.updatedAt ? formatDate(whois.updatedAt, DATE_FORMAT) : '—'}
          />
        </dl>

        {/* Nur mit bekanntem Ablauf, der noch bevorsteht — eine bereits
            abgelaufene Domain braucht keine Erinnerung mehr, sondern Handeln. */}
        {whois.expiresAt && expiresInDays !== undefined && expiresInDays >= 0 && (
          <div className="mt-4">
            <CalendarButton
              reminder={{
                kind: 'domain',
                // Liefert der Server die abgefragte Domain nicht mit (älterer
                // Stand), ist der Report-Name die beste verfügbare Angabe.
                subject: whois.domain ?? domain,
                expiresAt: whois.expiresAt,
                reportDomain: domain,
              }}
            />
          </div>
        )}
      </motion.div>

      {/* Nameserver aus WHOIS */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="card"
      >
        <CardHeader icon={<Server className="size-4" />} title={t('Nameserver (laut Registry)')} />

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
                    title={t('{value} in die Suche übernehmen', { value: ns })}
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
          <p className="mt-4 text-sm text-fg-subtle">{t('Keine Nameserver gemeldet.')}</p>
        )}
      </motion.div>

      {/* Status + DNSSEC */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="card"
      >
        <CardHeader icon={<Lock className="size-4" />} title={t('Domain-Status')} />

        {whois.status && whois.status.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {whois.status.map((s) => {
              const norm = s.toLowerCase().replace(/\s+/g, '');
              // Unbekannte Codes erscheinen roh — so, wie die Registry sie meldet.
              const meta = STATUS_LABELS[norm];
              return (
                <span key={s} title={s} className={cn('badge', STATUS_BADGE[meta?.tone ?? 'ok'])}>
                  {meta ? t(meta.label) : s}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-fg-subtle">{t('Keine Status-Codes.')}</p>
        )}

        <div className="mt-5 flex items-center gap-2 border-t border-line-subtle pt-4 text-sm">
          {whois.dnssecDelegated ? (
            <ShieldCheck className="size-4 shrink-0 text-success" />
          ) : (
            <ShieldOff className="size-4 shrink-0 text-fg-subtle" />
          )}
          <span className="text-fg-muted">
            {tRich('DNSSEC bei Registry: {status}', {
              status: (
                <span className={whois.dnssecDelegated ? 'font-medium text-success' : 'text-fg-subtle'}>
                  {whois.dnssecDelegated ? t('delegiert') : t('nicht delegiert')}
                </span>
              ),
            })}
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

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

function formatAge(days: number): string {
  if (days < 60) return t('{count} Tage', { count: days });
  const months = Math.floor(days / 30);
  if (months < 24) return t('{count} Monate', { count: months });
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return t('{count} Jahre', { count: years });
  return `${t('{count} Jahre', { count: years })}, ${t('{count} Monate', { count: remainingMonths })}`;
}
