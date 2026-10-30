import { useDeferredValue, useMemo } from 'react';
import {
  AlertBadge,
  AlertText,
  Badge,
  Button,
  Heading,
  IconClose,
  IconDanger,
  IconWarning,
  Label,
  LoadingSpinner,
  Option,
  Section,
  Select,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Text,
  TextField,
} from '@mittwald/flow-react-components';
import type { RecordType, ResolverResult } from '@/types/dns';
import {
  countsMissingAnswers,
  MAX_EXPECTED,
  primaryPropagationType,
  PROPAGATION_RECORD_TYPES,
  requeryWithin,
  type PropagationRecordType,
  type ResolverAnswer,
} from '@/lib/propagation';
import {
  authoritativeReference,
  compareWithBasis,
  propagationBasis,
  type PropagationBasis,
} from '@shared/authoritative';
import { IpAddressLink } from '@/components/ip/IpAddressLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';
import { errorText, formatNumber, t, useI18n, type Language } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { useTypedPropagation } from './useTypedPropagation';
import { useAuthoritative } from './useAuthoritative';
import { AuthoritativeBlock } from './AuthoritativeBlock';
import { AnswerGroup, type AnswerGroupBadge } from './AnswerGroup';
import styles from './Propagation.module.css';

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
  /**
   * Der erwartete Wert (#133) — steht mit im Link, deshalb hält ihn die App.
   * Leer heißt: keiner.
   */
  expected: string;
  onExpectedChange: (value: string) => void;
}

/**
 * Inhalt des Propagation-Tabs: Typwahl und erwarteter Wert, dann der Stand
 * der autoritativen Nameserver, dann die öffentlichen Resolver — je eine
 * Section in der LayoutCard des Reports.
 */
export function PropagationView({
  domain,
  results,
  types,
  type,
  onTypeChange,
  expected,
  onExpectedChange,
}: PropagationViewProps) {
  const { t } = useI18n();
  const standard = types.includes(type);
  const typed = useTypedPropagation(results, domain, type, !standard);
  const shown = standard ? results : typed.results;

  // Die autoritativen Nameserver erst hier, also erst im offenen Tab (#133).
  const auth = useAuthoritative(results, domain, type);
  const reference = useMemo(() => (auth.result ? authoritativeReference(auth.result) : undefined), [auth.result]);
  // Tippen bleibt flüssig: Verglichen wird mit dem nachgezogenen Wert.
  const deferredExpected = useDeferredValue(expected);
  const basis = useMemo(() => propagationBasis(deferredExpected, reference), [deferredExpected, reference]);

  // „Kein Resolver liefert …“ nennt bei der Voreinstellung beide
  // Standard-Typen, wenn keiner eine Antwort hat — sonst den gezeigten.
  const emptyTypes = standard && primaryPropagationType(results, types) === undefined ? types : [type];

  return (
    <>
      <Section>
        <div className={styles.controls}>
          {/* Alle wählbaren Typen, auch ohne Antwort: Wer nach einem neuen MX
              fragt, muss ihn wählen können, bevor es ihn überall gibt. Acht
              Optionen — dafür ist in Flow das Select da. Jede Wahl legt über
              onTypeChange einen History-Eintrag an. */}
          <Select
            selectedKey={type}
            onChange={(key) => {
              if (key !== null && key !== type) onTypeChange(key as PropagationRecordType);
            }}
          >
            {/* Ein Typ ist immer gewählt — ohne `optional={false}` hängte Flow „(optional)“ an. */}
            <Label optional={false}>{t('Record-Typ')}</Label>
            {PROPAGATION_RECORD_TYPES.map((option) => (
              <Option key={option} value={option}>
                {option}
              </Option>
            ))}
          </Select>
          <ExpectedInput type={type} value={expected} onChange={onExpectedChange} />
        </div>
      </Section>

      {/* Erst der Stand der Zone, dann die Caches: Ist eine Änderung am
          Nameserver nicht angekommen, sagen die Resolver nichts Neues.
          Eigener Key-Präfix: Der Vergleich darunter hängt auch am Typ, und
          Geschwister mit gleichem Key verwechselt React. */}
      <AuthoritativeBlock
        key={`authoritative-${type}`}
        type={type}
        domain={domain}
        auth={auth}
        reference={reference}
        expected={deferredExpected}
      />

      {shown ? (
        <Comparison key={type} results={shown} type={type} emptyTypes={emptyTypes} basis={basis} />
      ) : typed.error ? (
        <Section>
          <EmptyState
            tone="danger"
            icon={<IconDanger />}
            action={
              <Button variant="soft" color="secondary" onPress={typed.retry}>
                {t('Erneut versuchen')}
              </Button>
            }
          >
            {errorText(typed.error, 'Propagation-Check fehlgeschlagen')}
          </EmptyState>
        </Section>
      ) : (
        <Section>
          {/* Angesagt über LoadingAnnouncement, die Anzeige ist aria-hidden:
              Eine Live-Region, die schon mit Text eingefügt wird, sagen nicht
              alle Screenreader an (#108). Je Typ eine Ansage. */}
          <LoadingAnnouncement key={type}>
            {t('{type}-Records werden bei allen Resolvern abgefragt…', { type })}
          </LoadingAnnouncement>
          <div aria-hidden="true" className={styles.loading}>
            <LoadingSpinner size="s" />
            <Text>{t('{type}-Records werden bei allen Resolvern abgefragt…', { type })}</Text>
          </div>
        </Section>
      )}
    </>
  );
}

/** Beispiel im leeren Feld, je Typ in der Form, in der die Antworten stehen. */
const EXPECTED_EXAMPLE: Record<PropagationRecordType, string> = {
  A: '192.0.2.1',
  AAAA: '2001:db8::1',
  CNAME: 'host.example.net',
  MX: '10 mx.example.net',
  NS: 'ns1.example.net',
  TXT: 'v=spf1 include:example.net -all',
  CAA: '0 issue "letsencrypt.org"',
  SOA: '2026101901',
};

/**
 * Feld „erwarteter Wert“ (#133): Wer gerade etwas geändert hat, trägt den
 * neuen Wert ein und sieht, wer ihn schon liefert. Geprüft wird im Browser,
 * ohne neue Abfrage.
 */
function ExpectedInput({
  type,
  value,
  onChange,
}: {
  type: PropagationRecordType;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.expected}>
      <TextField
        value={value}
        onChange={onChange}
        placeholder={EXPECTED_EXAMPLE[type]}
        maxLength={MAX_EXPECTED}
        autoComplete="off"
        spellCheck="false"
      >
        <Label>{t('Erwarteter Wert')}</Label>
      </TextField>
      {value && (
        <Button
          variant="plain"
          color="secondary"
          aria-label={t('Erwarteten Wert löschen')}
          onPress={() => onChange('')}
        >
          <IconClose />
        </Button>
      )}
    </div>
  );
}

/** Wogegen verglichen wird — Untertitel des Resolver-Abschnitts. */
const BASIS_TEXT: Record<PropagationBasis['kind'], DeKey> = {
  majority: 'Verglichen mit der Mehrheit der Resolver',
  authoritative: 'Verglichen mit den autoritativen Nameservern',
  expected: 'Verglichen mit dem erwarteten Wert — er muss in der Antwort stehen',
};

/** Badge der Antwort, die zur Basis passt. */
const MATCH_BADGE: Record<PropagationBasis['kind'], AnswerGroupBadge> = {
  majority: 'consensus',
  authoritative: 'authoritative',
  expected: 'expected',
};

/** Vergleich der Resolver für einen Typ: Tabelle, Antworten, Hinweis. */
function Comparison({
  results,
  type,
  emptyTypes,
  basis,
}: {
  results: ResolverResult[];
  type: RecordType;
  emptyTypes: RecordType[];
  basis: PropagationBasis;
}) {
  const { t, language } = useI18n();

  const comparison = useMemo(() => compareWithBasis(results, type, basis), [results, type, basis]);
  // `compared` statt aller Resolver: Wer einen Fehler hat, zählt nicht mit —
  // so nennen Hinweis und Befund dieselben Zahlen.
  const { answers, consensusKey, compared, deviating, soaPrimaries } = comparison;
  // Außer bei Adressen geht es darum, ob eine Änderung angekommen ist — nicht
  // um GeoDNS. Das ändert die Hinweise.
  const entry = countsMissingAnswers(type);
  const requery = requeryWithin(comparison);

  // Außer bei Adressen sind die Antworten zu lang für die Zeile: ein
  // DKIM-Schlüssel hat rund 410 Zeichen, ein CNAME zum Anbieter oft 60, ein
  // NS-Set acht Hostnamen — auf dem Handy blieb neben ihnen vom Resolver-Namen
  // nur „Clou…“. Jede verschiedene Antwort steht deshalb einmal unter der
  // Tabelle, die Zeilen verweisen mit einem Buchstaben darauf. Die Antwort,
  // die zur Basis passt (Mehrheit, autoritativ, erwartet), heißt „A“.
  const groups = useMemo(() => {
    if (!entry) return [];
    const withValues = answers.filter((a) => a.key !== '' && a.status !== 'error');
    const matches = (key: string) => withValues.some((a) => a.key === key && a.status === 'match');
    const keys = [...new Set(withValues.map((a) => a.key))].sort(
      (a, b) => Number(matches(b)) - Number(matches(a))
    );
    return keys.map((key, i) => {
      const members = withValues.filter((a) => a.key === key);
      return {
        key,
        letter: String.fromCharCode(65 + i),
        values: members[0].values,
        resolvers: members.map((a) => a.result.resolver.name),
        matches: matches(key),
      };
    });
  }, [entry, answers]);
  const letterFor = (key: string) => groups.find((g) => g.key === key)?.letter;
  const consensusSize = answers.find((a) => a.key === consensusKey)?.values.length ?? 0;

  const answeredWithoutError = answers.some((a) => !a.result.error);

  return (
    <Section aria-label={t('Öffentliche Resolver')}>
      <Heading level={2}>{t('Öffentliche Resolver')}</Heading>
      <Text>{t(BASIS_TEXT[basis.kind])}</Text>

      {type === 'SOA' && (
        <Text>
          <small>
            {t('Verglichen wird die Seriennummer, der dritte Wert im SOA.')}
            {/* Mehrere Anbieter: verschiedene Seriennummern sind dann kein Befund. */}
            {soaPrimaries !== undefined &&
              ` ${t('Die Zone liegt bei {count} Anbietern mit eigener Seriennummer — verglichen wird je Anbieter (Primary im SOA).', {
                count: soaPrimaries,
              })}`}
          </small>
        </Text>
      )}

      <Table aria-label="Resolver" verticalAlign="middle">
        <TableHeader>
          <TableColumn>Resolver</TableColumn>
          <TableColumn horizontalAlign="end">{t('Antwort')}</TableColumn>
        </TableHeader>
        <TableBody>
          {answers.map((answer) => (
            <ResolverRow key={answer.result.resolver.id} answer={answer} type={type} letter={letterFor(answer.key)} />
          ))}
        </TableBody>
      </Table>

      {groups.map((group) => (
        <AnswerGroup
          key={group.key}
          letter={group.letter}
          values={group.values}
          members={group.resolvers}
          // „Mehrheit“ und „weicht ab“ nur, wenn es etwas zu
          // unterscheiden gibt. Sind alle gleich, sagt das der Hinweis.
          badge={deviating === 0 ? undefined : group.matches ? MATCH_BADGE[basis.kind] : 'deviating'}
        />
      ))}

      {/* Der Ton folgt dem Befund: Abweichung ist eine Warnung (gelb), Konsens ein OK. */}
      {deviating > 0 && <AlertText status="warning">{deviationText(basis.kind, entry, deviating, compared)}</AlertText>}
      {/* Nur mit TTL von jedem abweichenden Resolver — sonst ließe sich
          „spätestens“ nicht sagen (requeryWithin). Gezählt ab der Abfrage,
          nicht ab jetzt: Die Ansicht bleibt stehen, solange der Report offen ist. */}
      {deviating > 0 && requery !== undefined && (
        <Text>
          {t(
            'Laut TTL fragen die abweichenden Resolver spätestens {duration} nach dieser Abfrage wieder bei den Nameservern nach.',
            { duration: formatDuration(requery) }
          )}
        </Text>
      )}

      {deviating === 0 && consensusKey !== undefined && (
        <AlertText status="success">
          {/* Ein NS-, MX- oder CAA-Satz hat meist mehrere Records. */}
          {basis.kind === 'authoritative'
            ? t('Alle Resolver liefern die Antwort der autoritativen Nameserver — sauber propagiert.')
            : basis.kind === 'expected'
              ? t('Alle Resolver liefern den erwarteten Wert.')
              : soaPrimaries !== undefined
                ? t('Alle Resolver liefern die Seriennummer ihres Anbieters — sauber propagiert.')
                : !entry
                  ? t('Alle Resolver liefern dasselbe Ergebnis — DNS sauber propagiert.')
                  : consensusSize > 1
                    ? t('Alle Resolver liefern dieselben {type}-Records — sauber propagiert.', { type })
                    : t('Alle Resolver liefern denselben {type}-Record — sauber propagiert.', { type })}
        </AlertText>
      )}

      {deviating === 0 && consensusKey === undefined && answeredWithoutError && (
        <AlertText status="info">
          {t('Kein Resolver liefert einen {types} unter diesem Namen.', {
            types: typeList(emptyTypes, language),
          })}
        </AlertText>
      )}

      {/* Was der Vergleich zeigen kann (#132). Neun Anbieter sind kein
          Blick um die Welt: Anycast schickt jede Anfrage ins nächste
          Rechenzentrum. Kein Status, deshalb leise am Ende. */}
      <Text>
        <small>
          {t(
            'diggy fragt aus Deutschland. Die Anbieter antworten jeweils aus ihrem nächstgelegenen Rechenzentrum (Anycast): Du siehst die Caches verschiedener Anbieter an einem Ort, keine weltweite Verteilung. Die Flagge zeigt den Sitz des Anbieters.'
          )}
        </small>
      </Text>
    </Section>
  );
}

/** Hinweis bei Abweichung — je nachdem, wogegen verglichen wurde. */
function deviationText(basis: PropagationBasis['kind'], entry: boolean, count: number, total: number): string {
  const values = { count, total };
  if (basis === 'expected') return t('Noch ohne den erwarteten Wert: {count} von {total} Resolvern.', values);
  if (basis === 'authoritative') {
    return entry
      ? t(
          'Noch nicht auf dem Stand der autoritativen Nameserver: {count} von {total} Resolvern. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).',
          values
        )
      : t(
          'Andere Antwort als die autoritativen Nameserver: {count} von {total} Resolvern — noch nicht propagiert, oder GeoDNS / Anycast.',
          values
        );
  }
  return entry
    ? t(
        '{count} von {total} Resolvern weichen ab — eine Änderung ist noch nicht überall angekommen. Resolver geben den alten Stand weiter, bis ihr Cache abläuft (TTL).',
        values
      )
    : t(
        '{count} von {total} Resolvern weichen ab — möglicherweise noch nicht propagiert, oder absichtlich GeoDNS / Anycast.',
        values
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

/**
 * Eine Zeile der Tabelle: links Resolver, darunter Antwortzeit und TTL —
 * in einer Zeile mit dem Namen blieben auf dem Handy nur „Cloudfl…“ und eine
 * abgeschnittene IP übrig. Rechts die Antwort.
 */
function ResolverRow({
  answer,
  type,
  letter,
}: {
  answer: ResolverAnswer;
  type: RecordType;
  /** Bei DNS-Einträgen: Buchstabe der Antwort in der Liste darunter. */
  letter: string | undefined;
}) {
  const { result, values, status, ttl } = answer;

  return (
    <TableRow>
      <TableCell>
        <div className={styles.who}>
          <span>{result.resolver.flag}</span>
          <div className={styles.whoText}>
            <Text>{result.resolver.name}</Text>
            <Text className={styles.meta}>
              <small>
                {result.responseTimeMs}ms
                {/* Verbleibende TTL wie in der Records-Liste. Unbekannt (etwa
                    ein „gibt es nicht“ ohne SOA): weggelassen statt geraten. */}
                {ttl !== null && ` · TTL ${ttl}s`}
              </small>
            </Text>
          </div>
        </div>
      </TableCell>
      <TableCell horizontalAlign="end">
        {countsMissingAnswers(type) && !result.error ? (
          <AnswerBadge letter={letter} status={status} />
        ) : (
          <InlineValues result={result} values={values} status={status} type={type} />
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Status nie nur über Farbe: Fehler und Abweichung tragen Flows Status-Icon
 * samt Namen. Werte im Konsens bleiben neutral — dass sie übereinstimmen,
 * sagt der Hinweis unter der Tabelle.
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

  if (result.error) return <AlertText status="danger">{result.error}</AlertText>;
  if (values.length === 0) {
    return isMismatch ? (
      <AlertText status="warning">{t('— kein Eintrag')}</AlertText>
    ) : (
      <Text className={styles.muted}>{t('— kein Eintrag')}</Text>
    );
  }

  const list = (
    <div className={styles.answer}>
      {values.map((value) =>
        // Nur Adressen haben IP-Details. Alle anderen Typen stehen unter der
        // Tabelle (AnswerGroup) und kommen hier nur mit Fehler an.
        type === 'A' || type === 'AAAA' ? (
          <IpAddressLink key={value} ip={value} />
        ) : (
          <span key={value} className="mono wrap-anywhere">
            {value}
          </span>
        )
      )}
    </div>
  );

  if (!isMismatch) return list;
  return (
    <div className={styles.inline}>
      <IconWarning color="warning" aria-label={t('weicht ab')} />
      {list}
    </div>
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
    return <AlertBadge status="warning">{t('{label} · weicht ab', { label })}</AlertBadge>;
  }
  if (!letter) return <Text className={styles.muted}>{t('— kein Eintrag')}</Text>;
  return <Badge color="neutral">{label}</Badge>;
}
