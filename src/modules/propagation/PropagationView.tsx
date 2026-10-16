import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { AlertTriangle, AlertCircle, Check, ChevronDown, Minus } from 'lucide-react';
import type { RecordType, ResolverResult } from '@/types/dns';
import { cn } from '@/lib/cn';
import {
  comparePropagation,
  countsMissingAnswers,
  type ResolverAnswer,
} from '@/lib/propagation';
import { IpAddressLink } from '@/components/ip/IpAddressLink';

interface PropagationViewProps {
  results: ResolverResult[];
  /**
   * Die abgefragten Typen, wichtigster zuerst (`propagationTypes`): A/AAAA bei
   * Hosts, TXT/CNAME bei DNS-Einträgen. Ein Host, der per CNAME auf ein CDN
   * zeigt, liefert den CNAME in jeder Antwort mit — als eigener Umschalter
   * soll er dort trotzdem nicht auftauchen.
   */
  types: RecordType[];
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

export function PropagationView({ results, types }: PropagationViewProps) {
  // Verfügbare Typen aus den Daten extrahieren — nicht alles raten.
  const availableTypes = useMemo(() => {
    const set = new Set<RecordType>();
    for (const r of results) for (const rec of r.records) set.add(rec.type);
    return types.filter((t) => set.has(t));
  }, [results, types]);

  const [activeType, setActiveType] = useState<RecordType>(availableTypes[0] ?? types[0]);

  const comparison = useMemo(
    () => comparePropagation(results, activeType),
    [results, activeType]
  );
  // `compared` statt aller Resolver: Wer einen Fehler hat, zählt nicht mit —
  // so nennen Hinweis und Befund dieselben Zahlen.
  const { answers, consensusKey, compared, deviating } = comparison;
  // TXT und CNAME sind die Typen der DNS-Einträge. Dort geht es darum, ob
  // eine Änderung angekommen ist — nicht um GeoDNS. Das ändert die Hinweise.
  const entry = countsMissingAnswers(activeType);

  // Die Antworten eines DNS-Eintrags sind zu lang für die Zeile: ein
  // DKIM-Schlüssel hat rund 410 Zeichen, ein CNAME zum Anbieter oft 60 — auf
  // dem Handy blieb neben ihm vom Resolver-Namen nur „Clou…“. Jede
  // verschiedene Antwort steht deshalb einmal unter der Liste, die Zeilen
  // verweisen mit einem Buchstaben darauf. Die Mehrheitsantwort heißt „A“.
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

  const answeredWithoutError = answers.some((a) => !a.result.error);

  return (
    <div className="space-y-4">
      {availableTypes.length > 1 && (
        <div className="flex items-center gap-1.5">
          {availableTypes.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={activeType === t}
              onClick={() => setActiveType(t)}
              className="chip"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {answers.map((answer, i) => (
            <ResolverRow
              key={answer.result.resolver.id}
              answer={answer}
              type={activeType}
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
            <span>
              {deviating} von {compared} Resolvern weichen ab —{' '}
              {entry
                ? 'eine Änderung ist noch nicht überall angekommen. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).'
                : 'möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.'}
            </span>
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
              {entry
                ? `Alle Resolver liefern denselben ${activeType}-Record — sauber propagiert.`
                : 'Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.'}
            </span>
          </motion.div>
        )}

        {consensusKey === undefined && answeredWithoutError && (
          <div className="panel mt-5 flex items-start gap-2.5 py-3 text-sm text-fg-muted">
            <Minus className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
            <span>Kein Resolver liefert einen {typeList(types)} unter diesem Namen.</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** „TXT- oder CNAME-Record“, „A- oder AAAA-Record“. */
function typeList(types: RecordType[]): string {
  if (types.length < 2) return `${types[0]}-Record`;
  return `${types.slice(0, -1).join('-, ')}- oder ${types[types.length - 1]}-Record`;
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
  const { result, values, status } = answer;

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center justify-between gap-4 text-sm"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-base">{result.resolver.flag}</span>
        <span className="truncate text-fg-muted">
          {result.resolver.name}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
          {result.responseTimeMs}ms
        </span>
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
  const isMismatch = status === 'mismatch';
  return (
    <span
      className={cn(
        'flex min-w-0 max-w-[60%] items-center justify-end gap-1.5 text-right font-mono text-[13px]',
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
        <span className="truncate">{result.error ?? '— kein Eintrag'}</span>
      ) : (
        <span className="flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-1">
          {values.map((value) =>
            // Nur Adressen haben IP-Details. TXT und CNAME stehen ohnehin
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
  const label = letter ? `Antwort ${letter}` : 'kein Eintrag';
  if (status === 'mismatch') {
    return (
      <span className="badge badge-warning">
        <AlertTriangle className="size-3" />
        {label} · weicht ab
      </span>
    );
  }
  if (!letter) return <span className="text-[13px] text-fg-subtle">— kein Eintrag</span>;
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
  return (
    <section aria-label={`Antwort ${letter}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-fg">Antwort {letter}</span>
        <span className="text-xs text-fg-subtle">{resolvers.join(', ')}</span>
        {status === 'consensus' && <span className="badge">Mehrheit</span>}
        {status === 'deviating' && (
          <span className="badge badge-warning">
            <AlertTriangle className="size-3" />
            weicht ab
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
          {expanded ? 'Gekürzt zeigen' : `Ganzen Wert zeigen (${value.length} Zeichen)`}
        </button>
      )}
    </div>
  );
}
