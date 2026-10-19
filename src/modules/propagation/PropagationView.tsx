import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, Check, ChevronDown, Loader2, Minus } from 'lucide-react';
import type { RecordType, ResolverResult } from '@/types/dns';
import { cn } from '@/lib/cn';
import {
  comparePropagation,
  countsMissingAnswers,
  primaryPropagationType,
  PROPAGATION_RECORD_TYPES,
  requeryWithin,
  type PropagationRecordType,
  type ResolverAnswer,
} from '@/lib/propagation';
import { IpAddressLink } from '@/components/ip/IpAddressLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';
import { errorText, formatNumber, t, useI18n, type Language } from '@/i18n';
import { useTypedPropagation } from './useTypedPropagation';

interface PropagationViewProps {
  domain: string;
  /** Antworten des Reports — für die Standard-Typen (`types`). */
  results: ResolverResult[];
  /**
   * Die Standard-Typen, wichtigster zuerst (`propagationTypes`): A/AAAA bei
   * Hosts, TXT/CNAME bei DNS-Einträgen. Nur sie lädt der Report mit; jeden
   * anderen Typ fragt die Ansicht erst ab, wenn er gewählt wird (#131).
   */
  types: RecordType[];
  /** Der gezeigte Typ — gewählt oder die Voreinstellung (App, für den Link). */
  type: PropagationRecordType;
  onTypeChange: (type: PropagationRecordType) => void;
}

/**
 * Ab dieser Länge wird ein Wert gekürzt. Ein DKIM-Schlüssel (RSA 2048)
 * hat rund 410 Zeichen — fünf davon untereinander wären eine Textwand, in der
 * niemand mehr sieht, ob sie gleich sind.
 */
const LONG_VALUE = 120;
/**
 * Anfang und Ende der Kurzform. Bei DKIM-Schlüsseln ist der Anfang für alle
 * RSA-2048-Schlüssel gleich (`v=DKIM1; k=rsa; p=MIIBIjANBgkq…`); unterscheiden
 * lassen sie sich am Ende — daher bleibt auch das stehen.
 */
const HEAD = 64;
const TAIL = 24;

export function PropagationView({ domain, results, types, type, onTypeChange }: PropagationViewProps) {
  const { t } = useI18n();
  const standard = types.includes(type);
  const typed = useTypedPropagation(results, domain, type, !standard);
  const shown = standard ? results : typed.results;

  // „Kein Resolver liefert …“ nennt bei der Voreinstellung beide
  // Standard-Typen, wenn keiner eine Antwort hat — sonst den gezeigten.
  const emptyTypes = standard && primaryPropagationType(results, types) === undefined ? types : [type];

  return (
    <div className="space-y-4">
      {/* Alle wählbaren Typen, auch ohne Antwort: Wer nach einem neuen MX
          fragt, muss ihn wählen können, bevor es ihn überall gibt. Native
          Buttons — Tab und Enter/Leertaste reichen zur Bedienung. */}
      <div role="group" aria-label={t('Record-Typ')} className="flex flex-wrap items-center gap-1.5">
        {PROPAGATION_RECORD_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === type}
            onClick={() => onTypeChange(option)}
            className="chip"
          >
            {option}
          </button>
        ))}
      </div>

      {shown ? (
        <Comparison key={type} results={shown} type={type} emptyTypes={emptyTypes} />
      ) : typed.error ? (
        <EmptyState
          tone="danger"
          icon={<AlertTriangle className="size-5" />}
          action={
            <button type="button" onClick={typed.retry} className="btn btn-secondary btn-sm">
              {t('Erneut versuchen')}
            </button>
          }
        >
          {errorText(typed.error, 'Propagation-Check fehlgeschlagen')}
        </EmptyState>
      ) : (
        <div className="card">
          {/* Angesagt über LoadingAnnouncement, die Anzeige ist aria-hidden:
              Eine Live-Region, die schon mit Text eingefügt wird, sagen nicht
              alle Screenreader an (#108). Je Typ eine Ansage. */}
          <LoadingAnnouncement key={type}>
            {t('{type}-Records werden bei allen Resolvern abgefragt…', { type })}
          </LoadingAnnouncement>
          <p aria-hidden="true" className="flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            {t('{type}-Records werden bei allen Resolvern abgefragt…', { type })}
          </p>
        </div>
      )}
    </div>
  );
}

/** Vergleich der Resolver für einen Typ: Zeilen, Antworten, Hinweis. */
function Comparison({
  results,
  type,
  emptyTypes,
}: {
  results: ResolverResult[];
  type: RecordType;
  emptyTypes: RecordType[];
}) {
  const { t, language } = useI18n();

  const comparison = useMemo(() => comparePropagation(results, type), [results, type]);
  // `compared` statt aller Resolver: Wer einen Fehler hat, zählt nicht mit —
  // so nennen Hinweis und Befund dieselben Zahlen.
  const { answers, consensusKey, compared, deviating } = comparison;
  // Außer bei Adressen geht es darum, ob eine Änderung angekommen ist — nicht
  // um GeoDNS. Das ändert die Hinweise.
  const entry = countsMissingAnswers(type);
  const requery = requeryWithin(comparison);

  // Außer bei Adressen sind die Antworten zu lang für die Zeile: ein
  // DKIM-Schlüssel hat rund 410 Zeichen, ein CNAME zum Anbieter oft 60, ein
  // NS-Set acht Hostnamen — auf dem Handy blieb neben ihnen vom Resolver-Namen
  // nur „Clou…“. Jede verschiedene Antwort steht deshalb einmal unter der
  // Liste, die Zeilen verweisen mit einem Buchstaben darauf. Die
  // Mehrheitsantwort heißt „A“.
  const groups = useMemo(() => {
    if (!entry) return [];
    const withValues = answers.filter((a) => a.key !== '' && a.status !== 'error');
    const keys = [...new Set(withValues.map((a) => a.key))].sort(
      (a, b) => Number(b === consensusKey) - Number(a === consensusKey)
    );
    return keys.map((key, i) => {
      const members = withValues.filter((a) => a.key === key);
      return {
        key,
        letter: String.fromCharCode(65 + i),
        values: members[0].values,
        resolvers: members.map((a) => a.result.resolver.name),
        isConsensus: key === consensusKey,
      };
    });
  }, [entry, answers, consensusKey]);
  const letterFor = (key: string) => groups.find((g) => g.key === key)?.letter;
  const consensusSize = answers.find((a) => a.key === consensusKey)?.values.length ?? 0;

  const answeredWithoutError = answers.some((a) => !a.result.error);

  return (
    <div className="card">
      {type === 'SOA' && (
        <p className="mb-4 text-xs text-fg-subtle">
          {t('Verglichen wird die Seriennummer, der dritte Wert im SOA.')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        {answers.map((answer, i) => (
          <ResolverRow
            key={answer.result.resolver.id}
            answer={answer}
            type={type}
            letter={letterFor(answer.key)}
            delay={i * 0.04}
          />
        ))}
      </div>

      {groups.length > 0 && (
        <div className="mt-5 space-y-4">
          {groups.map((group) => (
            <AnswerGroup
              key={group.key}
              letter={group.letter}
              values={group.values}
              resolvers={group.resolvers}
              // „Mehrheit“ und „weicht ab“ nur, wenn es etwas zu
              // unterscheiden gibt. Sind alle gleich, sagt das der Hinweis.
              status={deviating === 0 ? undefined : group.isConsensus ? 'consensus' : 'deviating'}
            />
          ))}
        </div>
      )}

      {/* Hinweis in einem Panel statt hinter einer Trennlinie. Der Ton folgt
          dem Befund: Abweichung ist eine Warnung (gelb), Konsens ein OK. */}
      {deviating > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="panel mt-5 flex items-start gap-2.5 py-3 text-sm text-fg-muted"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p>
              {entry
                ? t(
                    '{count} von {total} Resolvern weichen ab — eine Änderung ist noch nicht überall angekommen. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).',
                    { count: deviating, total: compared }
                  )
                : t(
                    '{count} von {total} Resolvern weichen ab — möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.',
                    { count: deviating, total: compared }
                  )}
            </p>
            {/* Nur mit TTL von jedem abweichenden Resolver — sonst ließe sich
                „spätestens“ nicht sagen (requeryWithin). Gezählt ab der
                Abfrage, nicht ab jetzt: Die Ansicht bleibt stehen, solange
                der Report offen ist. */}
            {requery !== undefined && (
              <p>
                {t(
                  'Laut TTL fragen die abweichenden Resolver spätestens {duration} nach dieser Abfrage wieder bei den Nameservern nach.',
                  { duration: formatDuration(requery) }
                )}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {deviating === 0 && consensusKey !== undefined && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="panel mt-5 flex items-start gap-2.5 py-3 text-sm text-fg-muted"
        >
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
          <span>
            {/* Ein NS-, MX- oder CAA-Satz hat meist mehrere Records. */}
            {!entry
              ? t('Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.')
              : consensusSize > 1
                ? t('Alle Resolver liefern dieselben {type}-Records — sauber propagiert.', { type })
                : t('Alle Resolver liefern denselben {type}-Record — sauber propagiert.', { type })}
          </span>
        </motion.div>
      )}

      {consensusKey === undefined && answeredWithoutError && (
        <div className="panel mt-5 flex items-start gap-2.5 py-3 text-sm text-fg-muted">
          <Minus className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <span>
            {t('Kein Resolver liefert einen {types} unter diesem Namen.', {
              types: typeList(emptyTypes, language),
            })}
          </span>
        </div>
      )}

      {/* Was der Vergleich zeigen kann (#132). Neun Anbieter sind kein
          Blick um die Welt: Anycast schickt jede Anfrage ins nächste
          Rechenzentrum. Kein Status, deshalb leise am Ende. */}
      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
        {t(
          'diggy fragt aus Deutschland. Die Anbieter antworten jeweils aus ihrem nächstgelegenen Rechenzentrum (Anycast): Du siehst die Caches verschiedener Anbieter an einem Ort, keine weltweite Verteilung. Die Flagge zeigt den Sitz des Anbieters.'
        )}
      </p>
    </div>
  );
}

/**
 * Zeitspanne für „spätestens … nach dieser Abfrage“, aufgerundet: lieber eine
 * Minute zu spät als zu früh. Die Einheiten heißen in beiden Sprachen gleich.
 */
function formatDuration(seconds: number): string {
  if (seconds < 90) return `${formatNumber(seconds)} s`;
  if (seconds < 90 * 60) return `${formatNumber(Math.ceil(seconds / 60))} min`;
  return `${formatNumber(Math.ceil(seconds / 3600))} h`;
}

/** „TXT- oder CNAME-Record“, „A- oder AAAA-Record“ — englisch „TXT or CNAME record“. */
function typeList(types: RecordType[], language: Language): string {
  const last = types[types.length - 1];
  if (types.length < 2) return t('{type}-Record', { type: last });
  const rest = types.slice(0, -1).join(language === 'de' ? '-, ' : ', ');
  return t('{types}- oder {last}-Record', { types: rest, last });
}

function ResolverRow({
  answer,
  type,
  letter,
  delay,
}: {
  answer: ResolverAnswer;
  type: RecordType;
  /** Bei DNS-Einträgen: Buchstabe der Antwort in der Liste darunter. */
  letter: string | undefined;
  delay: number;
}) {
  const { result, values, status, ttl } = answer;

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center justify-between gap-4 text-sm"
    >
      {/* Antwortzeit und TTL unter dem Namen: In einer Zeile mit dem Namen
          blieben auf dem Handy und bei zwei Spalten (md bis xl) nur
          „Cloudfl…“ und eine abgeschnittene IP übrig. */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-base">{result.resolver.flag}</span>
        <div className="min-w-0">
          <p className="truncate text-fg-muted">{result.resolver.name}</p>
          <p className="text-xs tabular-nums text-fg-subtle">
            {result.responseTimeMs}ms
            {/* Verbleibende TTL wie in der Records-Liste. Unbekannt (etwa
                ein „gibt es nicht“ ohne SOA): weggelassen statt geraten. */}
            {ttl !== null && ` · TTL ${ttl}s`}
          </p>
        </div>
      </div>
      {countsMissingAnswers(type) && !result.error ? (
        <AnswerBadge letter={letter} status={status} />
      ) : (
        <InlineValues result={result} values={values} status={status} type={type} />
      )}
    </motion.div>
  );
}

/**
 * Status nie nur über Farbe: Fehler (Kreis) und Abweichung (Dreieck) tragen
 * ein Icon. Werte im Konsens bleiben neutral — dass sie übereinstimmen, sagt
 * der Hinweis unter der Liste.
 */
function InlineValues({
  result,
  values,
  status,
  type,
}: {
  result: ResolverResult;
  values: string[];
  status: ResolverAnswer['status'];
  type: RecordType;
}) {
  const { t } = useI18n();
  const isMismatch = status === 'mismatch';
  return (
    <span
      className={cn(
        'flex min-w-0 max-w-[70%] items-center justify-end gap-1.5 text-right font-mono text-[13px]',
        result.error
          ? 'font-medium text-danger'
          : values.length === 0 && !isMismatch
          ? 'text-fg-subtle'
          : isMismatch
          ? 'font-medium text-warning'
          : 'text-fg'
      )}
    >
      {result.error && <AlertCircle className="size-3.5 shrink-0" />}
      {!result.error && isMismatch && <AlertTriangle className="size-3.5 shrink-0" />}
      {result.error || values.length === 0 ? (
        <span className="truncate">{result.error ?? t('— kein Eintrag')}</span>
      ) : (
        <span className="flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-1">
          {values.map((value) =>
            // Nur Adressen haben IP-Details. Alle anderen Typen stehen
            // unter der Liste (AnswerGroup) und kommen hier nur mit Fehler an.
            type === 'A' || type === 'AAAA' ? (
              <IpAddressLink key={value} ip={value} className="text-[13px] text-inherit" />
            ) : (
              <span key={value} className="min-w-0 wrap-anywhere">
                {value}
              </span>
            )
          )}
        </span>
      )}
    </span>
  );
}

/** Verweis einer Resolver-Zeile auf ihre Antwort — oder „kein Eintrag“. */
function AnswerBadge({
  letter,
  status,
}: {
  letter: string | undefined;
  status: ResolverAnswer['status'];
}) {
  const { t } = useI18n();
  const label = letter ? t('Antwort {letter}', { letter }) : t('kein Eintrag');
  if (status === 'mismatch') {
    return (
      <span className="badge badge-warning">
        <AlertTriangle className="size-3" />
        {t('{label} · weicht ab', { label })}
      </span>
    );
  }
  if (!letter) return <span className="text-[13px] text-fg-subtle">{t('— kein Eintrag')}</span>;
  return <span className="badge">{label}</span>;
}

function AnswerGroup({
  letter,
  values,
  resolvers,
  status,
}: {
  letter: string;
  values: string[];
  resolvers: string[];
  status: 'consensus' | 'deviating' | undefined;
}) {
  const { t } = useI18n();
  return (
    <section aria-label={t('Antwort {letter}', { letter })}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-fg">{t('Antwort {letter}', { letter })}</span>
        <span className="text-xs text-fg-subtle">{resolvers.join(', ')}</span>
        {status === 'consensus' && <span className="badge">{t('Mehrheit')}</span>}
        {status === 'deviating' && (
          <span className="badge badge-warning">
            <AlertTriangle className="size-3" />
            {t('weicht ab')}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-2">
        {values.map((value) => (
          <AnswerValue key={value} value={value} />
        ))}
      </div>
    </section>
  );
}

/**
 * Ein Wert einer Antwort, lange Werte gekürzt auf Anfang…Ende.
 *
 * Ganz ausklappbar statt nur per Tooltip: Wer nach einem DKIM-Wechsel prüft,
 * vergleicht den Schlüssel mit dem aus dem Anbieter-Panel — auch auf dem
 * Handy und per Tastatur.
 */
function AnswerValue({ value }: { value: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = value.length > LONG_VALUE;

  return (
    <div className="panel py-3">
      <p className="font-mono text-[13px] text-fg wrap-anywhere">
        {long && !expanded ? (
          <>
            {value.slice(0, HEAD)}
            <span className="text-fg-subtle">…</span>
            {value.slice(-TAIL)}
          </>
        ) : (
          value
        )}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="btn btn-ghost btn-sm mt-2 -ml-3"
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
          />
          {expanded
            ? t('Gekürzt zeigen')
            : t('Ganzen Wert zeigen ({count} Zeichen)', { count: value.length })}
        </button>
      )}
    </div>
  );
}
