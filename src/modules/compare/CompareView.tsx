import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CircleHelp,
  Equal,
  EqualApproximately,
  EqualNot,
  Info,
  ListTree,
  Lock,
  Mail,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useProgressiveLookup, type ProgressiveLookup } from '@/hooks/useProgressiveLookup';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { CardHeader } from '@/components/ui/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@mittwald/flow-react-components';
import { normalizeCompareInput } from '@/lib/comparePath';
import { cn } from '@/lib/cn';
import { verdictFor } from '@/lib/scoring';
import { errorText, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import {
  CERT_ROWS,
  DNSSEC_ROWS,
  DNS_ROWS,
  MAIL_ROWS,
  certFacts,
  compareFacts,
  compareScores,
  diffRecords,
  dnssecFacts,
  mailFacts,
  nameserverFact,
  rowLabel,
  scoreTone,
  sectionCells,
  summarize,
  type DiffStatus,
  type FactCell,
  type FactRow,
  type FactTone,
  type RecordRow,
  type RecordValue,
  type SideCells,
} from './compareDomains';

interface CompareViewProps {
  /** Domain A aus dem Pfad, leer wenn keine eingetragen ist. */
  left: string;
  right: string;
  /** Neue Eingabe: App.tsx schreibt den Permalink, die Props kommen zurück. */
  onCompare: (left: string, right: string) => void;
  /** Vollständigen Report (oder die IP-Ansicht) einer Seite öffnen. */
  onOpenReport: (domain: string) => void;
}

/* ─── Zustand je Seite ─────────────────────────────────────────────────── */

type Side =
  | { kind: 'empty' }
  | { kind: 'ip'; input: string }
  | { kind: 'loading'; input: string }
  | { kind: 'error'; input: string; message: string }
  | { kind: 'ready'; input: string; domain: string; lookup: ProgressiveLookup };

type ActiveSide = Extract<Side, { kind: 'loading' | 'ready' }>;

/**
 * Ein eigener Lookup je Seite — derselbe Hook wie im Report, damit beide
 * Seiten progressiv laden und jede für sich scheitern darf. Der Hook
 * verwirft Antworten überholter Anfragen selbst; ein schneller Wechsel der
 * Domain lässt also keine alten Daten durchrutschen.
 *
 * `attempt` zählt hoch, wenn dieselben Domains noch einmal abgeschickt
 * werden — der Pfad ändert sich dann nicht, geladen werden soll trotzdem,
 * etwa nach einem Timeout auf einer Seite.
 */
function useSide(input: string, attempt: number): Side {
  const lookup = useProgressiveLookup();
  const { run, reset } = lookup;

  useEffect(() => {
    // IPs gar nicht erst abfragen: Records, Mail-Schutz und Zertifikat einer
    // IP gibt es nicht, der Server würde die Eingabe nur ablehnen.
    if (input && !isInspectableIp(input)) run(input);
    else reset();
  }, [input, attempt, run, reset]);

  if (!input) return { kind: 'empty' };
  if (isInspectableIp(input)) return { kind: 'ip', input };
  if (lookup.recordsStatus === 'error') {
    // Übersetzt nach dem Code des Servers (#86). Beim Rendern aufgerufen —
    // CompareView abonniert die Sprache und rendert bei einem Wechsel neu.
    return { kind: 'error', input, message: errorText(lookup.recordsError, 'Lookup fehlgeschlagen') };
  }
  if (lookup.recordsStatus === 'done' && lookup.records && lookup.domain) {
    return { kind: 'ready', input, domain: lookup.domain, lookup };
  }
  return { kind: 'loading', input };
}

const isActive = (side: Side): side is ActiveSide => side.kind === 'loading' || side.kind === 'ready';
const nameOf = (side: ActiveSide) => (side.kind === 'ready' ? side.domain : side.input);
const lookupOf = (side: ActiveSide) => (side.kind === 'ready' ? side.lookup : null);

/* ─── Ansicht ──────────────────────────────────────────────────────────── */

export function CompareView({ left, right, onCompare, onOpenReport }: CompareViewProps) {
  const { t, tRich } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const a = useSide(left, attempt);
  const b = useSide(right, attempt);

  const handleSubmit = (nextLeft: string, nextRight: string) => {
    if (nextLeft === left && nextRight === right) setAttempt((n) => n + 1);
    else onCompare(nextLeft, nextRight);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-6xl"
    >
      <p className="eyebrow flex items-center gap-1.5">
        <ArrowLeftRight className="size-3.5" />
        {t('Vergleich')}
      </p>
      <h1 className="page-title mt-2">{t('Zwei Domains vergleichen')}</h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-fg-muted">
        {tRich(
          'Zum Beispiel alter gegen neuen Hoster während eines Umzugs oder {apex} gegen {www}. Abweichungen sind markiert.',
          {
            apex: <span className="font-mono text-[15px]">domain.de</span>,
            www: <span className="font-mono text-[15px]">www.domain.de</span>,
          }
        )}
      </p>

      <CompareForm left={left} right={right} onSubmit={handleSubmit} />

      {a.kind === 'empty' && b.kind === 'empty' ? (
        <EmptyState
          className="mt-8"
          icon={<ArrowLeftRight className="size-5" />}
          title={t('Zwei Domains eintragen')}
        >
          {t('Verglichen werden Health Score, Records je Typ, Mail-Schutz, Zertifikat und DNSSEC.')}
        </EmptyState>
      ) : (
        <>
          {/* Unsichtbare h2: die Seiten-Karten tragen h3 — wie die Leer- und
              Fehlerzustände, die an ihrer Stelle stehen können. */}
          <section aria-labelledby="compare-sides" className="mt-8">
            <h2 id="compare-sides" className="sr-only">
              {t('Domains im Vergleich')}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SideSummary label="Domain A" side={a} other={b} onOpenReport={onOpenReport} />
              <SideSummary label="Domain B" side={b} other={a} onOpenReport={onOpenReport} />
            </div>
          </section>

          {isActive(a) && isActive(b) && <Comparison a={a} b={b} />}
        </>
      )}
    </motion.div>
  );
}

/* ─── Eingabe ──────────────────────────────────────────────────────────── */

// Wie in der SearchBar: auf Touch-Geräten zöge ein Autofokus die
// Bildschirmtastatur auf und verdeckte die halbe Seite.
function prefersAutoFocus(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function CompareForm({
  left,
  right,
  onSubmit,
}: {
  left: string;
  right: string;
  onSubmit: (left: string, right: string) => void;
}) {
  const { t } = useI18n();
  const [a, setA] = useState(left);
  const [b, setB] = useState(right);
  const rightRef = useRef<HTMLInputElement>(null);

  // Neue Props (Permalink, Zurück-Button) setzen die Felder zurück. Bewusst
  // während des Renders statt per `key`: ein neu gemountetes Formular nähme
  // dem Knopf „Vergleichen“ den Fokus, Tastatur- und Screenreader-Nutzer
  // stünden nach dem Absenden wieder am Seitenanfang.
  const [shown, setShown] = useState({ left, right });
  if (shown.left !== left || shown.right !== right) {
    setShown({ left, right });
    setA(left);
    setB(right);
  }

  // Aus dem Report kommt man mit Domain A — dann direkt in Feld B tippen.
  useEffect(() => {
    if (left && !right && prefersAutoFocus()) rightRef.current?.focus({ preventScroll: true });
  }, [left, right]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const nextLeft = normalizeCompareInput(a);
    const nextRight = normalizeCompareInput(b);
    if (!nextLeft && !nextRight) return;
    // Was verglichen wird, steht so im Feld — auch wenn der Pfad gleich bleibt.
    setA(nextLeft);
    setB(nextRight);
    onSubmit(nextLeft, nextRight);
  };

  const swap = () => {
    setA(b);
    setB(a);
  };

  return (
    <form onSubmit={handleSubmit} className="card mt-6">
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
        <DomainField label="Domain A" value={a} onChange={setA} placeholder="example.com" />
        <button
          type="button"
          onClick={swap}
          aria-label={t('Domains tauschen')}
          className="btn btn-ghost btn-icon h-11 justify-self-center"
        >
          {/* Mobil stehen die Felder untereinander — dort tauscht der Pfeil vertikal. */}
          <ArrowLeftRight className="size-4 rotate-90 md:rotate-0" />
        </button>
        <DomainField
          label="Domain B"
          value={b}
          onChange={setB}
          placeholder="www.example.com"
          inputRef={rightRef}
        />
        <button
          type="submit"
          disabled={!a.trim() && !b.trim()}
          className="btn btn-primary h-11"
        >
          {t('Vergleichen')}
        </button>
      </div>
    </form>
  );
}

function DomainField({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-fg-subtle">{label}</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="input mt-1.5 font-mono"
      />
    </label>
  );
}

/* ─── Kopf je Seite: Domain und Score ──────────────────────────────────── */

const SCORE_TEXT: Record<Exclude<FactTone, 'neutral'>, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
const SCORE_BADGE: Record<Exclude<FactTone, 'neutral'>, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

function SideSummary({
  label,
  side,
  other,
  onOpenReport,
}: {
  label: string;
  side: Side;
  other: Side;
  onOpenReport: (domain: string) => void;
}) {
  const { t, tRich } = useI18n();
  if (side.kind === 'empty') {
    const otherName = other.kind === 'empty' ? null : other.kind === 'ready' ? other.domain : other.input;
    return (
      <EmptyState icon={<ArrowLeftRight className="size-5" />} title={t('{label} eintragen', { label })}>
        {otherName
          ? tRich('Trag oben eine zweite Domain ein, um sie mit {domain} zu vergleichen.', {
              domain: <span className="wrap-anywhere font-mono text-[13px] text-fg">{otherName}</span>,
            })
          : t('Trag oben eine Domain ein.')}
      </EmptyState>
    );
  }

  if (side.kind === 'ip') {
    return (
      <EmptyState
        icon={<Info className="size-5" />}
        title={t('Nur Domains vergleichbar')}
        action={
          <button type="button" onClick={() => onOpenReport(side.input)} className="btn btn-secondary btn-sm">
            {t('IP-Adresse ansehen')}
          </button>
        }
      >
        {tRich(
          '{ip} ist eine IP-Adresse. Records, Mail-Schutz und Zertifikat gehören zu Domains — für IPs gibt es die Einzelansicht mit Reverse DNS.',
          { ip: <span className="wrap-anywhere font-mono text-[13px] text-fg">{side.input}</span> }
        )}
      </EmptyState>
    );
  }

  if (side.kind === 'error') {
    return (
      <EmptyState
        tone="danger"
        icon={<AlertTriangle className="size-5" />}
        title={<span className="wrap-anywhere font-mono">{side.input}</span>}
      >
        {side.message}
      </EmptyState>
    );
  }

  const name = nameOf(side);
  const lookup = lookupOf(side);
  return (
    <div className="card flex min-w-0 flex-col">
      <p className="eyebrow">{label}</p>
      <h3 className="mt-1.5 break-all font-mono text-xl font-semibold tracking-tight text-fg sm:text-2xl">
        {name}
      </h3>

      {lookup?.allSettled ? <ScoreLine lookup={lookup} /> : <ScoreLineSkeleton />}

      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={() => onOpenReport(name)}
          disabled={!lookup}
          className="btn btn-ghost btn-sm group -ml-3"
        >
          {t('Vollständigen Report öffnen')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function ScoreLine({ lookup }: { lookup: ProgressiveLookup }) {
  const { t } = useI18n();
  const { score, counts } = lookup.healthScore;
  const tone = scoreTone(score);
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-baseline gap-1.5">
          <span className={cn('text-5xl font-semibold tabular-nums tracking-tight', SCORE_TEXT[tone])}>
            {score}
          </span>
          <span className="text-base text-fg-subtle">/ 100</span>
        </span>
        {/* Das Urteil aus dem Score, nicht der deutsche String des Reports (#86). */}
        <span className={cn('badge', SCORE_BADGE[tone])}>{t(verdictFor(score))}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <Stat label="ok" count={counts.success} dot="bg-success" />
        <Stat label="Warnungen" count={counts.warning} dot="bg-warning" />
        <Stat label="kritisch" count={counts.critical} dot="bg-danger" />
      </div>
    </div>
  );
}

function ScoreLineSkeleton() {
  const { t } = useI18n();
  return (
    <div className="mt-4" aria-label={t('Score wird berechnet')}>
      <Skeleton className="h-12 w-28 rounded-panel" />
      <div className="mt-3 flex gap-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-3 w-14" />
        ))}
      </div>
    </div>
  );
}

/** `label` ist ein Schlüssel („3 Warnungen“ mit Mehrzahl); „ok“ heißt in beiden Sprachen gleich. */
function Stat({ label, count, dot }: { label: DeKey | 'ok'; count: number; dot: string }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1.5 text-fg-muted">
      <span className={cn('size-2 rounded-full', dot)} />
      <span className="font-semibold tabular-nums text-fg">{count}</span>
      {label === 'ok' ? label : t(label, { count })}
    </span>
  );
}

/* ─── Gegenüberstellung ────────────────────────────────────────────────── */

interface Names {
  left: string;
  right: string;
}

function recordCells(lookup: ProgressiveLookup | null) {
  return lookup?.records ?? null;
}

function mailCells(lookup: ProgressiveLookup | null): SideCells {
  return lookup ? sectionCells(MAIL_ROWS, lookup.sections.mail, mailFacts) : {};
}

function certCells(lookup: ProgressiveLookup | null): SideCells {
  if (!lookup) return {};
  const { ssl } = lookup.sections;
  // `skipped` heißt: DNS-Eintrag mit Unterstrich, dort gibt es keinen Host.
  return sectionCells(CERT_ROWS, ssl, (data) =>
    certFacts(data, ssl.status !== 'skipped', ssl.lookupFailed)
  );
}

function dnsCells(lookup: ProgressiveLookup | null): SideCells {
  if (!lookup?.records) return {};
  return {
    provider: { state: 'done', fact: nameserverFact(lookup.records) },
    ...sectionCells(DNSSEC_ROWS, lookup.sections.dnssec, dnssecFacts),
  };
}

function Comparison({ a, b }: { a: ActiveSide; b: ActiveSide }) {
  const { t } = useI18n();
  const la = lookupOf(a);
  const lb = lookupOf(b);
  const names: Names = { left: nameOf(a), right: nameOf(b) };

  const recordRows = diffRecords(recordCells(la), recordCells(lb));
  const mailRows = compareFacts(MAIL_ROWS, mailCells(la), mailCells(lb));
  const certRows = compareFacts(CERT_ROWS, certCells(la), certCells(lb));
  const dnsRows = compareFacts(DNS_ROWS, dnsCells(la), dnsCells(lb));

  const summary = summarize(
    [...recordRows, ...mailRows, ...certRows, ...dnsRows].map((row) => row.status)
  );
  const scores =
    la?.allSettled && lb?.allSettled
      ? compareScores(la.healthScore.score, lb.healthScore.score)
      : null;

  const parts: string[] = [];
  if (summary.pending) {
    parts.push(t('Wird noch geladen …'));
  } else if (summary.differences === 0) {
    parts.push(t('Keine Unterschiede'));
  } else {
    parts.push(
      t('{count} Unterschiede in {total} Punkten', { count: summary.differences, total: summary.compared })
    );
  }
  if (scores) {
    parts.push(
      scores.leader
        ? t('{domain} liegt {count} Punkte vorn', {
            domain: scores.leader === 'left' ? names.left : names.right,
            count: scores.delta,
          })
        : t('Score gleichauf')
    );
  }

  return (
    <section aria-labelledby="compare-heading" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="compare-heading" className="text-lg font-semibold tracking-tight text-fg">
          {t('Gegenüberstellung')}
        </h2>
        {/* Nach dem Absenden bleibt der Fokus im Formular — das Ergebnis
            wird deshalb angesagt, sobald es feststeht. */}
        <p aria-live="polite" className="text-sm text-fg-muted">
          {parts.join(' · ')}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <CompareCard
          icon={<ListTree className="size-4" />}
          title={t('Records je Typ')}
          names={names}
          statuses={recordRows.map((row) => row.status)}
        >
          {recordRows.map((row) => (
            <RecordCompareRow key={row.type} row={row} names={names} />
          ))}
        </CompareCard>

        <CompareCard
          icon={<Mail className="size-4" />}
          title={t('Mail-Schutz')}
          names={names}
          statuses={mailRows.map((row) => row.status)}
        >
          {mailRows.map((row) => (
            <FactCompareRow key={row.id} row={row} names={names} />
          ))}
        </CompareCard>

        <CompareCard
          icon={<Lock className="size-4" />}
          title={t('Zertifikat')}
          names={names}
          statuses={certRows.map((row) => row.status)}
        >
          {certRows.map((row) => (
            <FactCompareRow key={row.id} row={row} names={names} />
          ))}
        </CompareCard>

        <CompareCard
          icon={<ShieldCheck className="size-4" />}
          title={t('Nameserver & DNSSEC')}
          names={names}
          statuses={dnsRows.map((row) => row.status)}
        >
          {dnsRows.map((row) => (
            <FactCompareRow key={row.id} row={row} names={names} />
          ))}
        </CompareCard>
      </div>
    </section>
  );
}

/**
 * Drei Spalten ab md: Bezeichnung, Domain A, Domain B. Darunter steht die
 * Bezeichnung über den Werten — so bleibt auch ein langer TXT-Record auf dem
 * Handy lesbar, statt die Seite seitlich zu sprengen.
 */
const ROW_GRID = 'md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]';

function CompareCard({
  icon,
  title,
  names,
  statuses,
  children,
}: {
  icon: ReactNode;
  title: string;
  names: Names;
  statuses: DiffStatus[];
  children: ReactNode;
}) {
  const { t } = useI18n();
  const summary = summarize(statuses);
  const aside = summary.pending ? (
    <Skeleton className="h-5 w-24" />
  ) : summary.differences > 0 ? (
    <span className="badge badge-warning">{t('{count} Unterschiede', { count: summary.differences })}</span>
  ) : summary.compared > 0 ? (
    <span className="badge">{t('keine Unterschiede')}</span>
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="card-flush"
    >
      <div className="px-5 py-4 sm:px-6">
        <CardHeader icon={icon} title={title} aside={aside} />
      </div>
      {/* Spaltenköpfe nur nebeneinander; untereinander trägt jede Zelle
          ihre Domain selbst. Für Screenreader immer an der Zelle (sr-only). */}
      <div
        aria-hidden
        className={cn('hidden gap-x-6 border-t border-line-subtle px-6 py-2.5 md:grid', ROW_GRID)}
      >
        <span />
        <span className="truncate font-mono text-xs text-fg-subtle">{names.left}</span>
        <span className="truncate font-mono text-xs text-fg-subtle">{names.right}</span>
      </div>
      <div className="divide-y divide-line-subtle border-t border-line-subtle">{children}</div>
    </motion.div>
  );
}

function CompareRow({
  label,
  status,
  names,
  left,
  right,
  compact = false,
}: {
  label: ReactNode;
  status: DiffStatus;
  names: Names;
  left: ReactNode;
  right: ReactNode;
  /** Kurze Werte stehen mobil nebeneinander, lange (Records) untereinander. */
  compact?: boolean;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 px-5 py-4 sm:px-6 md:gap-x-6', ROW_GRID)}>
      <div className="flex min-w-0 items-center justify-between gap-3 md:flex-col md:items-start md:justify-start md:gap-1.5">
        {label}
        <DiffBadge status={status} />
      </div>
      <div className={cn('grid min-w-0 gap-3 md:contents', compact ? 'grid-cols-2' : 'grid-cols-1')}>
        <Cell caption={names.left}>{left}</Cell>
        <Cell caption={names.right}>{right}</Cell>
      </div>
    </div>
  );
}

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 truncate font-mono text-xs text-fg-subtle md:sr-only">{caption}</p>
      {children}
    </div>
  );
}

/** Wort und Form, nicht nur Farbe: „gleich“, „gleichwertig“, „Unterschied“. */
function DiffBadge({ status }: { status: DiffStatus }) {
  const { t } = useI18n();
  switch (status) {
    case 'different':
      return (
        <span className="badge badge-warning">
          <EqualNot className="size-3" aria-hidden />
          {t('Unterschied')}
        </span>
      );
    case 'equivalent':
      return (
        <span className="badge" title={t('Gleich eingestuft, im Detail verschieden')}>
          <EqualApproximately className="size-3" aria-hidden />
          {t('gleichwertig')}
        </span>
      );
    case 'same':
      return (
        <span className="badge">
          <Equal className="size-3" aria-hidden />
          {t('gleich')}
        </span>
      );
    case 'pending':
      return <Skeleton className="h-5 w-16" />;
    default:
      // Eine Seite ist gescheitert — die Zelle sagt das, ein Urteil gibt es nicht.
      return null;
  }
}

function CellSkeleton() {
  return (
    <div className="space-y-2 pt-1">
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3.5 w-1/2" />
    </div>
  );
}

/* Records */

function RecordCompareRow({ row, names }: { row: RecordRow; names: Names }) {
  // „nur hier“ hilft nur, wo sich die Seiten teilweise decken. Teilen sie gar
  // nichts, stünde es an jedem Wert — bei zwei fremden TXT-Listen dutzendfach —
  // und sagte nichts, was das „Unterschied“ der Zeile nicht schon sagt.
  const markOnly = Boolean(row.left?.some((v) => v.match === 'both'));
  return (
    <CompareRow
      label={<span className="font-mono text-xs font-semibold text-fg-muted">{row.type}</span>}
      status={row.status}
      names={names}
      left={<RecordValues values={row.left} markOnly={markOnly} />}
      right={<RecordValues values={row.right} markOnly={markOnly} />}
    />
  );
}

function RecordValues({ values, markOnly }: { values: RecordValue[] | null; markOnly: boolean }) {
  const { t } = useI18n();
  if (!values) return <CellSkeleton />;
  if (values.length === 0) return <span className="text-sm text-fg-subtle">{t('keine')}</span>;
  return (
    <ul className="space-y-1.5">
      {values.map((v) => (
        <li key={v.value} className="flex min-w-0 items-start gap-2">
          <span
            className={cn(
              'min-w-0 font-mono text-[13px] wrap-anywhere',
              v.match === 'both' ? 'text-fg-muted' : 'text-fg'
            )}
          >
            {v.value}
          </span>
          {markOnly && v.match === 'only' && (
            <span className="badge badge-warning mt-px">{t('nur hier')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* Fakten */

const TONE_ICON: Record<FactTone, LucideIcon | null> = {
  success: Check,
  warning: AlertTriangle,
  danger: AlertCircle,
  neutral: null,
};
const TONE_TEXT: Record<FactTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-fg-subtle',
};

function FactCompareRow({ row, names }: { row: FactRow; names: Names }) {
  return (
    <CompareRow
      label={<span className="text-sm text-fg-muted">{rowLabel(row.label)}</span>}
      status={row.status}
      names={names}
      left={<FactValue cell={row.left} />}
      right={<FactValue cell={row.right} />}
      compact
    />
  );
}

function FactValue({ cell }: { cell: FactCell }) {
  const { t } = useI18n();
  if (cell.state === 'loading') return <CellSkeleton />;
  if (cell.state === 'error') {
    return (
      <span className="flex items-start gap-1.5 text-sm text-fg-muted" title={cell.message}>
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
        {t('Check fehlgeschlagen')}
      </span>
    );
  }
  const { fact } = cell;
  // „nicht prüfbar“ mit Fragezeichen wie im Report — die Form trägt den Status.
  const Icon = fact.unchecked ? CircleHelp : TONE_ICON[fact.tone];
  return (
    <div className="min-w-0">
      <span
        className={cn(
          'flex min-w-0 items-start gap-1.5 text-sm text-fg',
          fact.mono && 'font-mono text-[13px]'
        )}
      >
        {Icon && <Icon className={cn('mt-0.5 size-3.5 shrink-0', TONE_TEXT[fact.tone])} aria-hidden />}
        <span className="min-w-0 wrap-anywhere">{fact.value}</span>
      </span>
      {fact.detail && (
        <p className="mt-1 font-mono text-xs text-fg-subtle wrap-anywhere">{fact.detail}</p>
      )}
    </div>
  );
}
