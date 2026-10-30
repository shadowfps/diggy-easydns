import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertBadge,
  Badge,
  Button,
  ColumnLayout,
  Header,
  Heading,
  Icon,
  IconDanger,
  IconInfo,
  IconSuccess,
  IconUnavailable,
  IconWarning,
  InlineCode,
  Label,
  LayoutCard,
  Section,
  Skeleton,
  SkeletonText,
  Text,
  TextField,
} from '@mittwald/flow-react-components';
import { IconArrowRight, IconArrowsLeftRight } from '@tabler/icons-react';
import { useProgressiveLookup, type ProgressiveLookup } from '@/hooks/useProgressiveLookup';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { EmptyState } from '@/components/ui/EmptyState';
import { normalizeCompareInput } from '@/lib/comparePath';
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
import styles from './CompareView.module.css';

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

/**
 * Zwei Domains nebeneinander: Seitenkopf, Eingabe, je Domain eine Karte mit
 * Score, dann eine Karte mit je einer Section pro Bereich.
 */
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
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <Text className="eyebrow">{t('Vergleich')}</Text>
        <Heading level={1}>{t('Zwei Domains vergleichen')}</Heading>
        <Text elementType="p" className={styles.lead}>
          {tRich(
            'Zum Beispiel alter gegen neuen Hoster während eines Umzugs oder {apex} gegen {www}. Abweichungen sind markiert.',
            {
              apex: <InlineCode>domain.de</InlineCode>,
              www: <InlineCode>www.domain.de</InlineCode>,
            }
          )}
        </Text>
      </div>

      <CompareForm left={left} right={right} onSubmit={handleSubmit} />

      {a.kind === 'empty' && b.kind === 'empty' ? (
        <LayoutCard>
          <EmptyState icon={<CompareIcon />} title={t('Zwei Domains eintragen')} headingLevel={2}>
            {t('Verglichen werden Health Score, Records je Typ, Mail-Schutz, Zertifikat und DNSSEC.')}
          </EmptyState>
        </LayoutCard>
      ) : (
        <>
          {/* Unsichtbare h2: die Karten der Seiten tragen h3 — wie die Leer-
              und Fehlerzustände, die an ihrer Stelle stehen können. */}
          <section aria-labelledby="compare-sides">
            <h2 id="compare-sides" className="sr-only">
              {t('Domains im Vergleich')}
            </h2>
            <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]}>
              <SideSummary label="Domain A" side={a} other={b} onOpenReport={onOpenReport} />
              <SideSummary label="Domain B" side={b} other={a} onOpenReport={onOpenReport} />
            </ColumnLayout>
          </section>

          {isActive(a) && isActive(b) && <Comparison a={a} b={b} />}
        </>
      )}
    </div>
  );
}

/** Tabler, weil Flows Bibliothek keinen Doppelpfeil kennt. */
function CompareIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <IconArrowsLeftRight />
    </Icon>
  );
}

/* ─── Eingabe ──────────────────────────────────────────────────────────── */

// Wie in der SearchBar: auf Touch-Geräten zöge ein Autofokus die
// Bildschirmtastatur auf und verdeckte die halbe Seite.
function prefersAutoFocus(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Zwei Felder und der Knopf. Ein schlichtes Formular statt Flows `Form`: es
 * gibt nichts zu validieren (eine Domain genügt), und das Absenden ist eine
 * Navigation — `Form` setzte danach Erfolgs-Feedback und eigenen Zustand, der
 * mit den Props aus dem Pfad konkurriert.
 */
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
    <LayoutCard>
      <form onSubmit={handleSubmit} className={styles.form}>
        <DomainField label="Domain A" value={a} onChange={setA} placeholder="example.com" />
        <Button
          variant="plain"
          color="secondary"
          onPress={swap}
          aria-label={t('Domains tauschen')}
          className={styles.swap}
        >
          {/* Mobil stehen die Felder untereinander — dort tauscht der Pfeil vertikal. */}
          <CompareIcon className={styles.swapIcon} />
        </Button>
        <DomainField
          label="Domain B"
          value={b}
          onChange={setB}
          placeholder="www.example.com"
          inputRef={rightRef}
        />
        <Button type="submit" isDisabled={!a.trim() && !b.trim()}>
          {t('Vergleichen')}
        </Button>
      </form>
    </LayoutCard>
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
    <TextField
      ref={inputRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete="off"
      // Flows TextField kennt kein `autoCapitalize`; mit der URL-Tastatur
      // schreiben Handys die Domain ohnehin nicht groß.
      inputMode="url"
      spellCheck="false"
      className={`mono ${styles.field}`}
    >
      {/* Ohne „(optional)“: einzeln ist jedes Feld verzichtbar, eins braucht es aber. */}
      <Label optional={false}>{label}</Label>
    </TextField>
  );
}

/* ─── Kopf je Seite: Domain und Score ──────────────────────────────────── */

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
      <LayoutCard>
        <EmptyState icon={<CompareIcon />} title={t('{label} eintragen', { label })}>
          {otherName
            ? tRich('Trag oben eine zweite Domain ein, um sie mit {domain} zu vergleichen.', {
                domain: <InlineCode className="wrap-anywhere">{otherName}</InlineCode>,
              })
            : t('Trag oben eine Domain ein.')}
        </EmptyState>
      </LayoutCard>
    );
  }

  if (side.kind === 'ip') {
    return (
      <LayoutCard>
        <EmptyState
          icon={<IconInfo />}
          title={t('Nur Domains vergleichbar')}
          action={
            <Button variant="soft" color="secondary" onPress={() => onOpenReport(side.input)}>
              {t('IP-Adresse ansehen')}
            </Button>
          }
        >
          {tRich(
            '{ip} ist eine IP-Adresse. Records, Mail-Schutz und Zertifikat gehören zu Domains — für IPs gibt es die Einzelansicht mit Reverse DNS.',
            { ip: <InlineCode className="wrap-anywhere">{side.input}</InlineCode> }
          )}
        </EmptyState>
      </LayoutCard>
    );
  }

  if (side.kind === 'error') {
    return (
      <LayoutCard>
        <EmptyState
          tone="danger"
          icon={<IconDanger />}
          title={<span className="mono wrap-anywhere">{side.input}</span>}
        >
          {side.message}
        </EmptyState>
      </LayoutCard>
    );
  }

  const name = nameOf(side);
  const lookup = lookupOf(side);
  return (
    <LayoutCard className={styles.side}>
      <Section>
        <Text className="eyebrow">{label}</Text>
        <Heading level={3} className={`mono ${styles.sideName}`}>
          {name}
        </Heading>

        {lookup?.allSettled ? <ScoreLine lookup={lookup} /> : <ScoreLineSkeleton />}

        <div className={styles.sideAction}>
          <Button
            variant="soft"
            color="secondary"
            size="s"
            onPress={() => onOpenReport(name)}
            isDisabled={!lookup}
          >
            <Text>{t('Vollständigen Report öffnen')}</Text>
            <Icon>
              <IconArrowRight />
            </Icon>
          </Button>
        </div>
      </Section>
    </LayoutCard>
  );
}

const STATUS_OF: Record<Exclude<FactTone, 'neutral'>, 'success' | 'warning' | 'danger'> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

function ScoreLine({ lookup }: { lookup: ProgressiveLookup }) {
  const { t } = useI18n();
  const { score, counts } = lookup.healthScore;
  const tone = scoreTone(score);
  return (
    <div className={styles.scoreLine}>
      <div className={styles.scoreRow}>
        <span className={styles.score}>
          <span className={styles.scoreValue}>{score}</span>
          <Text>/ 100</Text>
        </span>
        {/* Das Urteil aus dem Score, nicht der deutsche String des Reports (#86). */}
        <AlertBadge status={STATUS_OF[tone]}>{t(verdictFor(score))}</AlertBadge>
      </div>
      <div className={styles.stats}>
        <Stat label="ok" count={counts.success} icon={<IconSuccess color="success" size="s" />} />
        <Stat label="Warnungen" count={counts.warning} icon={<IconWarning color="warning" size="s" />} />
        <Stat label="kritisch" count={counts.critical} icon={<IconDanger color="danger" size="s" />} />
      </div>
    </div>
  );
}

function ScoreLineSkeleton() {
  const { t } = useI18n();
  return (
    <div className={styles.scoreLine} aria-busy="true" aria-label={t('Score wird berechnet')}>
      <Skeleton width="7rem" height="3rem" />
      <Text>
        <SkeletonText width="12em" />
      </Text>
    </div>
  );
}

/** `label` ist ein Schlüssel („3 Warnungen“ mit Mehrzahl); „ok“ heißt in beiden Sprachen gleich. */
function Stat({ label, count, icon }: { label: DeKey | 'ok'; count: number; icon: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className={styles.stat}>
      {icon}
      <Text>
        <small>
          <strong>{count}</strong> {label === 'ok' ? label : t(label, { count })}
        </small>
      </Text>
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
    <LayoutCard>
      <Section>
        <Heading level={2}>{t('Gegenüberstellung')}</Heading>
        {/* Nach dem Absenden bleibt der Fokus im Formular — das Ergebnis
            wird deshalb angesagt, sobald es feststeht. */}
        <Text elementType="p" aria-live="polite">
          {parts.join(' · ')}
        </Text>
      </Section>

      <CompareSection
        title={t('Records je Typ')}
        names={names}
        statuses={recordRows.map((row) => row.status)}
      >
        {recordRows.map((row) => (
          <RecordCompareRow key={row.type} row={row} names={names} />
        ))}
      </CompareSection>

      <CompareSection title={t('Mail-Schutz')} names={names} statuses={mailRows.map((row) => row.status)}>
        {mailRows.map((row) => (
          <FactCompareRow key={row.id} row={row} names={names} />
        ))}
      </CompareSection>

      <CompareSection title={t('Zertifikat')} names={names} statuses={certRows.map((row) => row.status)}>
        {certRows.map((row) => (
          <FactCompareRow key={row.id} row={row} names={names} />
        ))}
      </CompareSection>

      <CompareSection
        title={t('Nameserver & DNSSEC')}
        names={names}
        statuses={dnsRows.map((row) => row.status)}
      >
        {dnsRows.map((row) => (
          <FactCompareRow key={row.id} row={row} names={names} />
        ))}
      </CompareSection>
    </LayoutCard>
  );
}

/**
 * Ein Bereich: Überschrift mit Zusammenfassung, darunter die Zeilen.
 *
 * Ab einer gewissen Breite drei Spalten — Bezeichnung, Domain A, Domain B —,
 * darunter steht die Bezeichnung über den Werten. So bleibt auch ein langer
 * TXT-Record auf dem Handy lesbar, statt die Seite seitlich zu sprengen. Die
 * Spalten folgen der Breite der Karte (Container Query im CSS-Modul): Flows
 * ColumnLayout kann die Domain-Beschriftung je Zelle nicht mit umschalten.
 */
function CompareSection({
  title,
  names,
  statuses,
  children,
}: {
  title: string;
  names: Names;
  statuses: DiffStatus[];
  children: ReactNode;
}) {
  const { t } = useI18n();
  const summary = summarize(statuses);
  const status = summary.pending ? (
    <SkeletonText width="7em" />
  ) : summary.differences > 0 ? (
    <AlertBadge status="warning">{t('{count} Unterschiede', { count: summary.differences })}</AlertBadge>
  ) : summary.compared > 0 ? (
    <Badge color="neutral">{t('keine Unterschiede')}</Badge>
  ) : null;

  return (
    <Section>
      <Header>
        <Heading level={3}>
          {title}
          {status}
        </Heading>
      </Header>
      <div className={styles.rows}>
        {/* Spaltenköpfe nur nebeneinander; untereinander trägt jede Zelle
            ihre Domain selbst. Für Screenreader immer an der Zelle. */}
        <div aria-hidden="true" className={`${styles.row} ${styles.columnHeads}`}>
          <span />
          <Text className="mono">
            <small>{names.left}</small>
          </Text>
          <Text className="mono">
            <small>{names.right}</small>
          </Text>
        </div>
        {children}
      </div>
    </Section>
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
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        {label}
        <DiffBadge status={status} />
      </div>
      <div className={styles.cells} data-compact={compact ? '' : undefined}>
        <Cell caption={names.left}>{left}</Cell>
        <Cell caption={names.right}>{right}</Cell>
      </div>
    </div>
  );
}

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className={styles.cell}>
      <Text className={`mono ${styles.caption}`}>
        <small>{caption}</small>
      </Text>
      {children}
    </div>
  );
}

/** Wort und Form, nicht nur Farbe: „gleich“, „gleichwertig“, „Unterschied“. */
function DiffBadge({ status }: { status: DiffStatus }) {
  const { t } = useI18n();
  switch (status) {
    case 'different':
      return <AlertBadge status="warning">{t('Unterschied')}</AlertBadge>;
    case 'equivalent':
      return (
        // Flows Badge reicht `title` nicht durch — der Hinweis hängt am Rahmen.
        <span title={t('Gleich eingestuft, im Detail verschieden')}>
          <Badge color="neutral">{t('gleichwertig')}</Badge>
        </span>
      );
    case 'same':
      return <Badge color="neutral">{t('gleich')}</Badge>;
    case 'pending':
      return <SkeletonText width="4em" />;
    default:
      // Eine Seite ist gescheitert — die Zelle sagt das, ein Urteil gibt es nicht.
      return null;
  }
}

function CellSkeleton() {
  return (
    <div aria-busy="true">
      <Text>
        <SkeletonText width="75%" />
      </Text>
      <Text>
        <SkeletonText width="50%" />
      </Text>
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
      label={
        <Text className="mono">
          <strong>{row.type}</strong>
        </Text>
      }
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
  if (values.length === 0) {
    return (
      <Text className={styles.muted}>
        <small>{t('keine')}</small>
      </Text>
    );
  }
  return (
    <ul className={styles.values}>
      {values.map((v) => (
        <li key={v.value} className={styles.value}>
          <span className={`mono wrap-anywhere ${v.match === 'both' ? styles.muted : ''}`}>{v.value}</span>
          {markOnly && v.match === 'only' && <AlertBadge status="warning">{t('nur hier')}</AlertBadge>}
        </li>
      ))}
    </ul>
  );
}

/* Fakten */

function FactCompareRow({ row, names }: { row: FactRow; names: Names }) {
  return (
    <CompareRow
      label={<Text>{rowLabel(row.label)}</Text>}
      status={row.status}
      names={names}
      left={<FactValue cell={row.left} />}
      right={<FactValue cell={row.right} />}
      compact
    />
  );
}

/** Form und Farbe des Tons — „nicht prüfbar“ mit eigenem Zeichen wie im Report. */
function ToneIcon({ tone, unchecked }: { tone: FactTone; unchecked?: boolean }) {
  if (unchecked) return <IconUnavailable color="unavailable" size="s" />;
  if (tone === 'success') return <IconSuccess color="success" size="s" />;
  if (tone === 'warning') return <IconWarning color="warning" size="s" />;
  if (tone === 'danger') return <IconDanger color="danger" size="s" />;
  return null;
}

function FactValue({ cell }: { cell: FactCell }) {
  const { t } = useI18n();
  if (cell.state === 'loading') return <CellSkeleton />;
  if (cell.state === 'error') {
    return (
      <span className={styles.fact} title={cell.message}>
        <IconDanger color="danger" size="s" />
        <Text>{t('Check fehlgeschlagen')}</Text>
      </span>
    );
  }
  const { fact } = cell;
  return (
    <div className={styles.factBlock}>
      <span className={styles.fact}>
        <ToneIcon tone={fact.tone} unchecked={fact.unchecked} />
        <Text className={fact.mono ? 'mono wrap-anywhere' : 'wrap-anywhere'}>{fact.value}</Text>
      </span>
      {fact.detail && (
        <Text className={`mono wrap-anywhere ${styles.muted}`}>
          <small>{fact.detail}</small>
        </Text>
      )}
    </div>
  );
}
