import { Fragment, type ReactNode } from 'react';
import {
  AlertBadge,
  AlertText,
  Badge,
  Button,
  Heading,
  IconWarning,
  LoadingSpinner,
  Section,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Text,
} from '@mittwald/flow-react-components';
import type { AuthoritativeFailure, RecordType } from '@/types/dns';
import { countsMissingAnswers } from '@/lib/propagation';
import {
  authoritativeDisagrees,
  matchesExpected,
  type AuthoritativeAnswer,
  type AuthoritativeReference,
} from '@shared/authoritative';
import { IpAddressLink } from '@/components/ip/IpAddressLink';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';
import { UncheckedBadge } from '@/components/ui/Unchecked';
import type { DeKey } from '@/i18n/de';
import { errorText, useI18n } from '@/i18n';
import type { Authoritative } from './useAuthoritative';
import { AnswerGroup } from './AnswerGroup';
import styles from './Propagation.module.css';

/** Warum ein Nameserver nicht prüfbar war — kurz, die Zeile ist schmal. */
const FAILURE_TEXT: Record<AuthoritativeFailure, DeKey> = {
  timeout: 'keine Antwort',
  network: 'nicht erreichbar',
  refused: 'lehnt ab (REFUSED)',
  servfail: 'Fehler (SERVFAIL)',
  not_authoritative: 'nicht zuständig',
  invalid_response: 'Antwort unlesbar',
  blocked: 'keine öffentliche Adresse',
  no_address: 'keine Adresse',
  rate_limited: 'gerade zu oft gefragt',
  no_ipv6: 'diggy ohne IPv6',
};

/** Fehler, die auf den Weg dorthin zeigen statt auf den Nameserver. */
const UNREACHABLE = new Set<AuthoritativeFailure>(['timeout', 'network', 'no_ipv6']);

/** Hinweise unter der Tabelle tragen Flows Status: Icon und Farbe. */
type NoteStatus = 'success' | 'warning' | 'info' | 'unavailable';

/**
 * Referenz-Section über den Resolvern (#133): was die autoritativen
 * Nameserver der Zone selbst antworten — je Adresse Wert, Seriennummer und
 * Antwortzeit. Ist ein Nameserver nicht prüfbar, steht der Grund in seiner
 * Zeile; die Section bleibt, die Resolver darunter auch.
 */
export function AuthoritativeBlock({
  type,
  domain,
  auth,
  reference,
  expected,
}: {
  type: RecordType;
  domain: string;
  auth: Authoritative;
  /** Auswertung von `auth.result` — `undefined`, solange nichts da ist. */
  reference: AuthoritativeReference | undefined;
  expected: string;
}) {
  const { t } = useI18n();
  const { result, error, retry } = auth;

  // Überschrift samt Status, darunter wo gefragt wurde. Der Status steht in
  // der Überschrift, wie es Flow für Badges an Sections vorsieht.
  const header = (status?: ReactNode) => (
    <>
      <Heading level={2}>
        {t('Autoritative Nameserver')}
        {status}
      </Heading>
      <Text>
        {result?.zone
          ? t('Zone {zone} · direkt gefragt über Port 53', { zone: result.zone })
          : t('Direkt gefragt über Port 53')}
      </Text>
    </>
  );

  if (!result || !reference) {
    return (
      <Section aria-label={t('Autoritative Nameserver')}>
        {header()}
        {error ? (
          <>
            <Note status="unavailable">{errorText(error, 'Abfrage der autoritativen Nameserver fehlgeschlagen')}</Note>
            <div>
              <Button size="s" variant="soft" color="secondary" onPress={retry}>
                {t('Erneut versuchen')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Angesagt über LoadingAnnouncement, die Anzeige ist aria-hidden (#108). */}
            <LoadingAnnouncement>{t('Autoritative Nameserver werden gefragt…')}</LoadingAnnouncement>
            <div aria-hidden="true" className={styles.loading}>
              <LoadingSpinner size="s" />
              <Text>{t('Autoritative Nameserver werden gefragt…')}</Text>
            </div>
          </>
        )}
      </Section>
    );
  }

  if (result.error) {
    return (
      <Section aria-label={t('Autoritative Nameserver')}>
        {header(<UncheckedBadge />)}
        <Note status="unavailable">
          {result.error === 'no_zone'
            ? t('Für diesen Namen ließ sich keine Zone finden — auf dem Weg nach oben gibt es keinen NS-Record.')
            : t('Die Nameserver der Zone ließen sich gerade nicht ermitteln.')}{' '}
          {t('Verglichen wird deshalb mit der Mehrheit der Resolver.')}
        </Note>
      </Section>
    );
  }

  const { state, answers } = reference;
  const disagree = authoritativeDisagrees(state, type);
  const entry = countsMissingAnswers(type);
  const hasExpected = expected.trim() !== '';
  const answered = answers.filter((a) => !a.server.error);

  // Am erwarteten Wert gemessen werden nur Nameserver mit eigener Antwort:
  // Ist der Name ein CNAME aus der Zone hinaus, liefern den Wert andere —
  // „dort ist die Änderung nicht angekommen“ wäre falsch.
  const judged = answered.filter((a) => !a.cname);

  /** Ob eine Antwort als abweichend gilt: gegen den erwarteten Wert, sonst gegen die übrigen Nameserver. */
  const flagged = (a: AuthoritativeAnswer) =>
    !a.server.error &&
    (hasExpected ? !a.cname && !matchesExpected(type, a.comparables, expected) : disagree && a.valueDeviates);

  // Verschiedene Antworten einmal unter der Liste, wie bei den Resolvern —
  // mit Ziffern, damit „Antwort A“ dort und „Antwort 1“ hier nicht
  // verwechselt werden.
  const answeredHosts = new Set(answered.map((a) => a.server.host));
  const keys = entry ? [...new Set(answered.filter((a) => a.key !== '' && !a.cname).map((a) => a.key))] : [];
  const groups = keys.map((key, i) => {
    const hosts = [...new Set(answered.filter((a) => a.key === key).map((a) => a.server.host))];
    return {
      key,
      label: String(i + 1),
      values: answered.find((a) => a.key === key)!.values,
      // Acht Hostnamen wären eine Zeile Text, die nichts sagt.
      members:
        hosts.length > 1 && hosts.length === answeredHosts.size
          ? [t('alle {count} Nameserver', { count: hosts.length })]
          : hosts,
      flagged: flagged(answered.find((a) => a.key === key)!),
    };
  });
  const labelFor = (key: string) => groups.find((g) => g.key === key)?.label;
  // Gezählt werden Nameserver, nicht Adressen: Wer zwei Namen einträgt, denkt
  // in zwei Servern, auch wenn jeder vier Adressen hat.
  const missingExpected = new Set(judged.filter(flagged).map((a) => a.server.host)).size;

  return (
    <Section aria-label={t('Autoritative Nameserver')}>
      {header(<StateBadge state={state} disagree={disagree} />)}

      <Table aria-label="Nameserver" verticalAlign="top">
        <TableHeader>
          <TableColumn>Nameserver</TableColumn>
          <TableColumn horizontalAlign="end">{t('Antwort')}</TableColumn>
        </TableHeader>
        <TableBody>
          {nameserverRows(answers).map((row) => (
            <NameserverRow
              key={row.map((a) => `${a.server.host}|${a.server.ip ?? ''}`).join(',')}
              answers={row}
              type={type}
              label={labelFor(row[0].key)}
              flagged={flagged(row[0])}
            />
          ))}
        </TableBody>
      </Table>

      {groups.map((group) => (
        <AnswerGroup
          key={group.key}
          letter={group.label}
          values={group.values}
          members={group.members}
          badge={
            // Wie bei den Resolvern nur, wenn es etwas zu unterscheiden
            // gibt — sonst sagt es der Hinweis darunter.
            hasExpected
              ? missingExpected === 0
                ? undefined
                : group.flagged
                  ? 'deviating'
                  : 'expected'
              : disagree && groups.length > 1 && group.flagged
                ? 'deviating'
                : undefined
          }
        />
      ))}

      <StateNote state={state} type={type} domain={domain} reference={reference} disagree={disagree} />
      {hasExpected && judged.length > 0 && (
        <Note status={missingExpected > 0 ? 'warning' : 'success'}>
          {missingExpected > 0
              ? t('Noch ohne den erwarteten Wert: {count} von {total} Nameservern — dort ist die Änderung nicht angekommen.', {
                  count: missingExpected,
                  total: new Set(judged.map((a) => a.server.host)).size,
                })
              : t('Die Nameserver liefern den erwarteten Wert.')}
        </Note>
      )}
      {result.omitted !== undefined && result.omitted > 0 && (
        <Note status="info">
          {t('Nicht gefragt: {count} von {total} Nameservern, höchstens acht je Abfrage.', {
            count: result.omitted,
            total: new Set(answers.map((a) => a.server.host)).size + result.omitted,
          })}
        </Note>
      )}
      {/* Eine Aussage über diggy, nicht über die Domain — deshalb neutral. */}
      {result.ipv6Skipped && <Note status="info">{t('Gefragt nur über IPv4: Der diggy-Server hat kein IPv6.')}</Note>}
    </Section>
  );
}

/**
 * Zeilen der Liste: je Nameserver eine, mit allen seinen Adressen — solange
 * sie dasselbe antworten. Sonst bekommt jede Adresse ihre eigene Zeile, damit
 * man sieht, welche abweicht. example.com hat zwei Nameserver mit je vier
 * Adressen; acht gleiche Zeilen sagten nichts, was zwei nicht sagen.
 */
function nameserverRows(answers: AuthoritativeAnswer[]): AuthoritativeAnswer[][] {
  const byHost = new Map<string, AuthoritativeAnswer[]>();
  for (const answer of answers) {
    byHost.set(answer.server.host, [...(byHost.get(answer.server.host) ?? []), answer]);
  }
  return [...byHost.values()].flatMap((list) => {
    const [first] = list;
    const same = list.every(
      (a) => a.key === first.key && a.server.serial === first.server.serial && a.server.error === first.server.error
    );
    return same ? [list] : list.map((a) => [a]);
  });
}

/** Ein Hinweis unter der Tabelle — Flows AlertText trägt Icon und Farbe des Status. */
function Note({ status, children }: { status: NoteStatus; children: ReactNode }) {
  return <AlertText status={status}>{children}</AlertText>;
}

function StateBadge({ state, disagree }: { state: AuthoritativeReference['state']; disagree: boolean }) {
  const { t } = useI18n();
  if (state === 'unavailable') return <UncheckedBadge />;
  if (state === 'agreed' || state === 'providers') return <AlertBadge status="success">{t('einig')}</AlertBadge>;
  if (disagree) return <AlertBadge status="warning">{t('uneinig')}</AlertBadge>;
  if (state === 'cname') return <Badge color="neutral">CNAME</Badge>;
  return <Badge color="neutral">{t('verschieden')}</Badge>;
}

/** Der Satz zum Stand der Nameserver — und was das für den Vergleich darunter heißt. */
function StateNote({
  state,
  type,
  domain,
  reference,
  disagree,
}: {
  state: AuthoritativeReference['state'];
  type: RecordType;
  domain: string;
  reference: AuthoritativeReference;
  disagree: boolean;
}) {
  const { t } = useI18n();
  const majority = t('Verglichen wird deshalb mit der Mehrheit der Resolver.');

  switch (state) {
    case 'agreed':
      return (
        <>
          <Note status="success">
            {reference.values.length > 0
              ? t('Die Nameserver sind sich einig — die Resolver werden mit ihrer Antwort verglichen.')
              : t('Die Nameserver sind sich einig: Unter diesem Namen gibt es keinen {type}-Record.', { type })}
          </Note>
          {/* Verschiedene Seriennummern bei mehreren Anbietern sind keine
              Störung — sagen, warum die Zeilen verschiedene zeigen. */}
          {reference.primaries > 1 && (
            <Note status="info">
              {t('Die Zone liegt bei {count} Anbietern, jeder mit eigener Seriennummer — kein Fehler.', {
                count: reference.primaries,
              })}
            </Note>
          )}
        </>
      );
    case 'providers':
      return (
        <Note status="success">
          {t('Die Nameserver gehören zu {count} Anbietern, jeder mit eigener Seriennummer — aktuell ist ein Resolver, der eine davon liefert.', {
            count: reference.keys?.length ?? 0,
          })}
        </Note>
      );
    case 'serial':
      return (
        <Note status="warning">
          {t('Die Nameserver sind uneinig: Ihre Seriennummern weichen ab — eine Änderung ist noch nicht auf allen angekommen.')}{' '}
          {majority}
        </Note>
      );
    case 'values':
      return (
        <Note status={disagree ? 'warning' : 'info'}>
          {disagree
            ? t('Die Nameserver sind uneinig: Sie liefern unterschiedliche Werte.')
            : t('Die Nameserver liefern unterschiedliche Adressen — bei Lastverteilung oder GeoDNS üblich.')}{' '}
          {majority}
        </Note>
      );
    case 'cname':
      return (
        <Note status="info">
          {t('{name} ist ein CNAME auf {target} — den {type}-Record liefern dessen Nameserver.', {
            name: domain,
            target: reference.cname ?? '',
            type,
          })}{' '}
          {majority}
        </Note>
      );
    default: {
      const unreachable = reference.answers.every((a) => a.server.error && UNREACHABLE.has(a.server.error));
      return (
        <Note status="unavailable">
          {unreachable
            ? t('Kein Nameserver hat geantwortet — vom diggy-Server aus ist DNS über Port 53 womöglich gesperrt.')
            : t('Kein Nameserver hat brauchbar geantwortet.')}{' '}
          {majority}
        </Note>
      );
    }
  }
}

/**
 * Ein Nameserver: Name, darunter je gefragte Adresse eine Zeile mit
 * Antwortzeit, dann die Seriennummer. Rechts die Antwort — bei Adressen die
 * Werte selbst, sonst der Verweis auf die Liste darunter.
 */
function NameserverRow({
  answers,
  type,
  label,
  flagged,
}: {
  /** Adressen desselben Nameservers mit derselben Antwort (`nameserverRows`). */
  answers: AuthoritativeAnswer[];
  type: RecordType;
  /** Bei Eintrags-Typen: Ziffer der Antwort in der Liste darunter. */
  label: string | undefined;
  flagged: boolean;
}) {
  const { t } = useI18n();
  const [{ server, values, cname, serialDeviates }] = answers;

  return (
    <TableRow>
      {/* Links nimmt den Platz, den die Antwort lässt: Namen und
          IPv6-Adressen sind lang, eine Adresse rechts ist es nicht. */}
      <TableCell>
        <div className={styles.whoText}>
          <Text className="mono">
            <HostName host={server.host} />
          </Text>
          {answers.map(({ server: { ip, responseTimeMs, error } }) =>
            ip ? (
              <Text key={ip} className={styles.meta}>
                <small>
                  <span className="mono wrap-anywhere">{ip}</span>
                  {!error && <> · {responseTimeMs}ms</>}
                </small>
              </Text>
            ) : null
          )}
          {server.serial &&
            (serialDeviates ? (
              // Abweichende Seriennummer mit Wort und Icon — nie nur gelb.
              <div>
                <AlertBadge status="warning">SOA {server.serial}</AlertBadge>
              </div>
            ) : (
              <Text className={styles.meta}>
                <small>SOA {server.serial}</small>
              </Text>
            ))}
        </div>
      </TableCell>

      <TableCell horizontalAlign="end">
        {server.error ? (
          <AlertText status="unavailable">{t(FAILURE_TEXT[server.error])}</AlertText>
        ) : cname ? (
          <Text className="mono">
            → <HostName host={cname} />
          </Text>
        ) : countsMissingAnswers(type) ? (
          <EntryBadge label={label} flagged={flagged} />
        ) : values.length === 0 ? (
          flagged ? (
            <AlertText status="warning">{t('— kein Eintrag')}</AlertText>
          ) : (
            <Text className={styles.muted}>{t('— kein Eintrag')}</Text>
          )
        ) : (
          // Untereinander: Zwei Adressen nebeneinander ließen dem Namen links
          // kaum Platz.
          <div className={styles.inline}>
            {flagged && <IconWarning color="warning" aria-label={t('weicht ab')} />}
            <div className={styles.answer}>
              {values.map((value) => (
                <IpAddressLink key={value} ip={value} />
              ))}
            </div>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Hostname, der nur an Punkten umbricht — `elliott.ns.cloudflare.com` auf
 * dem Handy lieber als `elliott.ns.cloudflare.` / `com` als mitten im Wort.
 * `<wbr>` statt eines unsichtbaren Zeichens: Kopiert wird der Name, wie er ist.
 */
function HostName({ host }: { host: string }) {
  const parts = host.split('.');
  return (
    <span className="wrap-anywhere">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <>
              .<wbr />
            </>
          )}
        </Fragment>
      ))}
    </span>
  );
}

function EntryBadge({ label, flagged }: { label: string | undefined; flagged: boolean }) {
  const { t } = useI18n();
  const text = label ? t('Antwort {letter}', { letter: label }) : t('kein Eintrag');
  if (flagged) return <AlertBadge status="warning">{t('{label} · weicht ab', { label: text })}</AlertBadge>;
  if (!label) return <Text className={styles.muted}>{t('— kein Eintrag')}</Text>;
  return <Badge color="neutral">{text}</Badge>;
}
