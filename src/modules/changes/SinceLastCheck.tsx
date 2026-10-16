import { useId, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  History,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { LookupReport } from '@/types/dns';
import type { SectionKey } from '@/hooks/useProgressiveLookup';
import {
  createHistoryEntry,
  type LookupHistoryEntry,
  type TrackedRecordType,
} from '@/lib/lookupHistory';
import { changeTone, diffChecks, type ChangeTone, type CheckChange } from '@/lib/checkChanges';
import { cn } from '@/lib/cn';

interface SinceLastCheckProps {
  /** Der letzte Check dieser Domain, bevor der laufende ihn überschrieben hat. */
  previous: LookupHistoryEntry;
  report: LookupReport;
  failed: readonly SectionKey[];
  /**
   * Erst vergleichen, wenn alle Sektionen fertig sind. Vorher stünden im
   * Report Defaults für noch ladende Checks, und der Vergleich meldete
   * „DMARC entfernt“, nur weil die Antwort noch unterwegs ist.
   */
  settled: boolean;
  className?: string;
}

/**
 * „Seit dem letzten Check“: was sich geändert hat, seit die Domain zuletzt
 * geprüft wurde (#79). Alles kommt aus der lokalen History.
 *
 * Eingeklappt, bis man die Liste öffnet: so bleibt die Karte vom Laden bis
 * zum Ergebnis gleich hoch, und die Tabs darunter springen nicht, während
 * man schon in den Records liest. Die Zahl der Änderungen steht im Kopf.
 */
export function SinceLastCheck({ previous, report, failed, settled, className }: SinceLastCheckProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const listId = useId();

  const changes = useMemo(
    () =>
      settled
        ? diffChecks(previous, createHistoryEntry(report, failed, report.timestamp))
        : null,
    [settled, previous, report, failed]
  );

  const checkedAt = formatDateTime(previous.lookedUpAt);
  const status =
    changes === null
      ? 'Wird verglichen, sobald alle Checks fertig sind …'
      : changes.length === 0
        ? `Keine Änderungen seit ${checkedAt}`
        : `${changes.length} ${changes.length === 1 ? 'Änderung' : 'Änderungen'} seit ${checkedAt}`;
  const expandable = changes !== null && changes.length > 0;

  const head = (
    <>
      {/* Mobil ohne Kachel: sonst bricht der Titel um, sobald rechts der
          Pfeil zum Aufklappen dazukommt, und die Karte wächst beim Laden. */}
      <span className="icon-tile hidden sm:inline-flex">
        <History className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span id={titleId} className="block text-sm font-semibold text-fg">
          Seit dem letzten Check{' '}
          <span className="whitespace-nowrap font-normal text-fg-muted">
            ({formatTimeAgo(previous.lookedUpAt)})
          </span>
        </span>
        <span className="mt-0.5 block text-xs text-fg-muted">{status}</span>
      </span>
    </>
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-labelledby={titleId}
      className={cn('card', className)}
    >
      {expandable ? (
        // Überschrift mit Button darin: das Akkordeon-Muster — die ganze
        // Zeile ist Klickfläche, und Screenreader hören Kopf und Zustand.
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((value) => !value)}
            className="group flex w-full items-center gap-3 rounded-panel text-left"
          >
            {head}
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-fg-muted transition-colors group-hover:text-fg">
              <span className="hidden sm:inline">{open ? 'Ausblenden' : 'Anzeigen'}</span>
              <ChevronDown
                className={cn('size-4 transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </span>
          </button>
        </h2>
      ) : (
        <h2 className="flex items-center gap-3">{head}</h2>
      )}

      {expandable && open && (
        <motion.ul
          id={listId}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-4 divide-y divide-line-subtle border-t border-line-subtle"
        >
          {changes.map((change, index) => (
            <ChangeRow key={`${change.kind}-${index}`} change={change} />
          ))}
        </motion.ul>
      )}
    </motion.section>
  );
}

const TONE_BADGE: Record<ChangeTone, string> = {
  neutral: '',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

/** Wort und Form je Änderung — nie nur Farbe (siehe docs/DESIGN.md). */
function marker(change: CheckChange): { word: string; Icon: LucideIcon } {
  switch (change.kind) {
    case 'score':
      return change.to > change.from
        ? { word: 'gestiegen', Icon: TrendingUp }
        : { word: 'gefallen', Icon: TrendingDown };
    case 'ssl-renewed':
      return { word: 'erneuert', Icon: RefreshCw };
    case 'ssl-replaced':
      return { word: 'getauscht', Icon: ArrowLeftRight };
    case 'ssl-invalid':
      return { word: 'ungültig', Icon: X };
    case 'ssl-valid':
      return { word: 'gültig', Icon: Check };
    case 'dnssec':
      return change.enabled
        ? { word: 'aktiviert', Icon: Check }
        : { word: 'deaktiviert', Icon: X };
    case 'dmarc':
      return change.present ? { word: 'neu', Icon: Plus } : { word: 'entfallen', Icon: Minus };
    case 'dmarc-policy':
      return { word: 'geändert', Icon: ArrowLeftRight };
    case 'records':
      return change.change === 'added'
        ? { word: 'neu', Icon: Plus }
        : { word: 'entfallen', Icon: Minus };
  }
}

function describe(change: CheckChange): ReactNode {
  switch (change.kind) {
    case 'score':
      return (
        <>
          Health Score{' '}
          <span className="tabular-nums">
            {change.from} → {change.to}
          </span>
        </>
      );
    case 'ssl-renewed':
      return `Zertifikat gilt jetzt bis ${formatDate(change.validTo)}`;
    case 'ssl-replaced':
      return `Zertifikat getauscht, gilt nur noch bis ${formatDate(change.validTo)}`;
    case 'ssl-invalid':
      return 'Zertifikat ungültig oder abgelaufen';
    case 'ssl-valid':
      return `Zertifikat jetzt gültig bis ${formatDate(change.validTo)}`;
    case 'dnssec':
      return change.enabled ? 'DNSSEC ist jetzt aktiv' : 'DNSSEC ist nicht mehr aktiv';
    case 'dmarc':
      if (!change.present) return 'DMARC-Record entfernt';
      return change.policy ? (
        <>
          DMARC-Record gesetzt, Policy <Mono>{change.policy}</Mono>
        </>
      ) : (
        'DMARC-Record gesetzt'
      );
    case 'dmarc-policy':
      return (
        <>
          DMARC-Policy <Mono>{change.from}</Mono> → <Mono>{change.to}</Mono>
        </>
      );
    case 'records':
      return (
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span>
            {change.type}-{change.values.length === 1 ? 'Record' : 'Records'}
          </span>
          {/* wrap-anywhere statt break-all: ein Name rückt als Ganzes in
              die nächste Zeile und wird nur zerteilt, wenn er allein nicht
              passt (lange IPv6-Adressen). */}
          {change.values.map((value) => (
            <Mono key={value} className="min-w-0 wrap-anywhere text-fg-muted">
              {recordLabel(change.type, value)}
            </Mono>
          ))}
        </span>
      );
  }
}

function ChangeRow({ change }: { change: CheckChange }) {
  const { word, Icon } = marker(change);
  return (
    <li className="flex flex-col items-start gap-1.5 py-3 last:pb-0 sm:flex-row sm:gap-3">
      {/* Ab sm feste Breite: die Beschreibungen beginnen untereinander, egal
          wie lang das Wort im Badge ist. Mobil steht das Badge darüber —
          neben einer festen Spalte blieben für Namen keine 200 px. */}
      <span className="flex shrink-0 sm:w-28">
        <span className={cn('badge', TONE_BADGE[changeTone(change)])}>
          <Icon className="size-3" aria-hidden />
          {word}
        </span>
      </span>
      <span className="min-w-0 text-sm text-fg">{describe(change)}</span>
    </li>
  );
}

/**
 * Ein Null-MX (`MX 0 .`, #77) hat ein leeres Ziel; vergleichbar gemacht bleibt
 * von ihm nur die Präferenz „0“. So stünde er unkenntlich in der Liste —
 * deshalb in Zonendatei-Schreibweise und benannt.
 */
function recordLabel(type: TrackedRecordType, value: string): string {
  return type === 'MX' && value === '0' ? '0 . (Null-MX)' : value;
}

function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[13px]', className)}>{children}</span>;
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat('de-DE', { numeric: 'auto' });

/** „vor 5 Minuten“, „gestern“, „vor 3 Tagen“ — für den Kopf der Karte. */
function formatTimeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'Zeitpunkt unbekannt';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return RELATIVE_TIME.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return RELATIVE_TIME.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return RELATIVE_TIME.format(-days, 'day');
  if (days < 365) return RELATIVE_TIME.format(-Math.floor(days / 30), 'month');
  return RELATIVE_TIME.format(-Math.floor(days / 365), 'year');
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'dem letzten Check';
  return date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { dateStyle: 'medium' });
}
