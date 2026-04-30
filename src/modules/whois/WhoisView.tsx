import { motion } from 'framer-motion';
import {
  Building2,
  Calendar,
  RefreshCw,
  Server,
  ShieldCheck,
  Lock,
  AlertCircle,
} from 'lucide-react';
import type { WhoisInfo } from '@/types/dns';
import { cn } from '@/lib/cn';

interface WhoisViewProps {
  whois?: WhoisInfo;
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

export function WhoisView({ whois }: WhoisViewProps) {
  if (!whois) {
    return (
      <div className="surface rounded-xl p-12 text-center">
        <AlertCircle className="w-5 h-5 mx-auto mb-2 text-ink-900/40 dark:text-ink-50/40" />
        <h3 className="text-base font-medium mb-1">WHOIS / RDAP nicht verfügbar</h3>
        <p className="text-sm text-ink-900/50 dark:text-ink-50/50">
          Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.
        </p>
      </div>
    );
  }

  const expiresInDays = whois.expiresAt
    ? Math.floor((new Date(whois.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : undefined;
  const ageDays = whois.createdAt
    ? Math.floor((Date.now() - new Date(whois.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Registrar + Daten */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="surface rounded-xl p-5 md:col-span-2"
      >
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-ink-900/60 dark:text-ink-50/60" />
          <span className="text-sm font-medium">Registrierung</span>
          {whois.source && (
            <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 font-mono">
              {whois.source}
            </span>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <Row
            icon={<Building2 className="w-3.5 h-3.5" />}
            label="Registrar"
            value={whois.registrar ?? '—'}
          />
          <Row
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Erstellt"
            value={
              whois.createdAt ? (
                <span>
                  {formatDate(whois.createdAt)}
                  {ageDays !== undefined && (
                    <span className="ml-2 text-xs text-ink-900/40 dark:text-ink-50/40">
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
            icon={<Calendar className="w-3.5 h-3.5" />}
            label="Läuft ab"
            value={
              whois.expiresAt ? (
                <span className="flex items-center gap-2">
                  <span>{formatDate(whois.expiresAt)}</span>
                  {expiresInDays !== undefined && (
                    <span
                      className={cn(
                        'text-xs font-medium px-1.5 py-0.5 rounded',
                        expiresInDays < 0
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : expiresInDays < 30
                          ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      )}
                    >
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
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            label="Geändert"
            value={whois.updatedAt ? formatDate(whois.updatedAt) : '—'}
          />
        </div>
      </motion.div>

      {/* Nameserver aus WHOIS */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="surface rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-ink-900/60 dark:text-ink-50/60" />
          <span className="text-sm font-medium">Nameserver (laut Registry)</span>
        </div>

        {whois.nameServers && whois.nameServers.length > 0 ? (
          <ul className="space-y-1.5">
            {whois.nameServers.map((ns) => (
              <li
                key={ns}
                className="font-mono text-xs text-ink-900/80 dark:text-ink-50/80 flex items-center gap-2"
              >
                <span className="w-1 h-1 rounded-full bg-diggy-500/60" />
                {ns}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-900/50 dark:text-ink-50/50">Keine Nameserver gemeldet.</p>
        )}
      </motion.div>

      {/* Status + DNSSEC */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="surface rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-ink-900/60 dark:text-ink-50/60" />
          <span className="text-sm font-medium">Domain-Status</span>
        </div>

        {whois.status && whois.status.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {whois.status.map((s) => {
              const norm = s.toLowerCase().replace(/\s+/g, '');
              const meta = STATUS_LABELS[norm] ?? { label: s, tone: 'ok' as const };
              return (
                <span
                  key={s}
                  title={s}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full font-medium',
                    meta.tone === 'ok' &&
                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    meta.tone === 'warn' &&
                      'bg-orange-500/10 text-orange-700 dark:text-orange-300',
                    meta.tone === 'bad' &&
                      'bg-red-500/10 text-red-700 dark:text-red-300'
                  )}
                >
                  {meta.label}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-900/50 dark:text-ink-50/50 mb-4">Keine Status-Codes.</p>
        )}

        <div className="pt-3 border-t border-ink-100 dark:border-ink-900/80 flex items-center gap-2 text-sm">
          <ShieldCheck
            className={cn(
              'w-4 h-4',
              whois.dnssecDelegated
                ? 'text-emerald-500'
                : 'text-ink-900/30 dark:text-ink-50/30'
            )}
          />
          <span className="text-ink-900/70 dark:text-ink-50/70">
            DNSSEC bei Registry:{' '}
            <span className={whois.dnssecDelegated ? 'font-medium' : 'text-ink-900/50 dark:text-ink-50/50'}>
              {whois.dnssecDelegated ? 'delegiert' : 'nicht delegiert'}
            </span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-ink-900/40 dark:text-ink-50/40 mt-0.5">{icon}</span>
      <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 w-20 shrink-0 font-medium pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-ink-900/80 dark:text-ink-50/80 break-words">{value}</span>
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
