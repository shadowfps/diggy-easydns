import { Fragment, type ReactNode } from 'react';
import { AlertTriangle, Check, CircleHelp, Info, Loader2, Server } from 'lucide-react';
import type { AuthoritativeFailure, RecordType } from '@/types/dns';
import { countsMissingAnswers } from '@/lib/propagation';
import {
  authoritativeDisagrees,
  matchesExpected,
  type AuthoritativeAnswer,
  type AuthoritativeReference,
} from '@shared/authoritative';
import { cn } from '@/lib/cn';
import { CardHeader } from '@/components/ui/CardHeader';
import { IpAddressLink } from '@/components/ip/IpAddressLink';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';
import { UncheckedBadge } from '@/components/ui/Unchecked';
import type { DeKey } from '@/i18n/de';
import { errorText, useI18n } from '@/i18n';
import type { Authoritative } from './useAuthoritative';
import { AnswerGroup } from './AnswerGroup';

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
};

/** Fehler, die auf den Weg dorthin zeigen statt auf den Nameserver. */
const UNREACHABLE = new Set<AuthoritativeFailure>(['timeout', 'network']);

/**
 * Referenz-Block über den Resolvern (#133): was die autoritativen
 * Nameserver der Zone selbst antworten — je Adresse Wert, Seriennummer und
 * Antwortzeit. Ist ein Nameserver nicht prüfbar, steht der Grund in seiner
 * Zeile; der Block bleibt, die Resolver-Liste darunter auch.
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

  const header = (aside?: ReactNode) => (
    <CardHeader
      icon={<Server className="size-4" />}
      title={t('Autoritative Nameserver')}
      subtitle={
        result?.zone
          ? t('Zone {zone} · direkt gefragt über Port 53', { zone: result.zone })
          : t('Direkt gefragt über Port 53')
      }
      aside={aside}
    />
  );

  if (!result || !reference) {
    return (
      <section className="card" aria-label={t('Autoritative Nameserver')}>
        {header()}
        {error ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Note icon={<CircleHelp className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}>
              {errorText(error, 'Abfrage der autoritativen Nameserver fehlgeschlagen')}
            </Note>
            <button type="button" onClick={retry} className="btn btn-secondary btn-sm">
              {t('Erneut versuchen')}
            </button>
          </div>
        ) : (
          <>
            {/* Angesagt über LoadingAnnouncement, die Anzeige ist aria-hidden (#108). */}
            <LoadingAnnouncement>{t('Autoritative Nameserver werden gefragt…')}</LoadingAnnouncement>
            <p aria-hidden="true" className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="size-4 shrink-0 animate-spin" />
              {t('Autoritative Nameserver werden gefragt…')}
            </p>
          </>
        )}
      </section>
    );
  }

  if (result.error) {
    return (
      <section className="card" aria-label={t('Autoritative Nameserver')}>
        {header(<UncheckedBadge />)}
        <div className="mt-4">
          <Note icon={<CircleHelp className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}>
            {result.error === 'no_zone'
              ? t('Für diesen Namen ließ sich keine Zone finden — auf dem Weg nach oben gibt es keinen NS-Record.')
              : t('Die Nameserver der Zone ließen sich gerade nicht ermitteln.')}{' '}
            {t('Verglichen wird deshalb mit der Mehrheit der Resolver.')}
          </Note>
        </div>
      </section>
    );
  }

  const { state, answers } = reference;
  const disagree = authoritativeDisagrees(state, type);
  const entry = countsMissingAnswers(type);
  const hasExpected = expected.trim() !== '';
  const answered = answers.filter((a) => !a.server.error);

  /** Ob eine Antwort als abweichend gilt: gegen den erwarteten Wert, sonst gegen die übrigen Nameserver. */
  const flagged = (a: AuthoritativeAnswer) =>
    !a.server.error && (hasExpected ? !matchesExpected(type, a.comparables, expected) : disagree && a.valueDeviates);

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
  const missingExpected = new Set(answered.filter(flagged).map((a) => a.server.host)).size;

  return (
    <section className="card" aria-label={t('Autoritative Nameserver')}>
      {header(<StateBadge state={state} disagree={disagree} />)}

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
        {nameserverRows(answers).map((row) => (
          <NameserverRow
            key={row.map((a) => `${a.server.host}|${a.server.ip ?? ''}`).join(',')}
            answers={row}
            type={type}
            label={labelFor(row[0].key)}
            flagged={flagged(row[0])}
          />
        ))}
      </div>

      {groups.length > 0 && (
        <div className="mt-5 space-y-4">
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
        </div>
      )}

      <div className="panel mt-5 space-y-1.5 py-3">
        <StateNote state={state} type={type} domain={domain} reference={reference} disagree={disagree} />
        {hasExpected && answered.length > 0 && (
          <Note
            icon={
              missingExpected > 0 ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
              )
            }
          >
            {missingExpected > 0
              ? t('Noch ohne den erwarteten Wert: {count} von {total} Nameservern — dort ist die Änderung nicht angekommen.', {
                  count: missingExpected,
                  total: answeredHosts.size,
                })
              : t('Die Nameserver liefern den erwarteten Wert.')}
          </Note>
        )}
        {result.omitted !== undefined && result.omitted > 0 && (
          <Note icon={<Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}>
            {t('Nicht gefragt: {count} von {total} Nameservern, höchstens acht je Abfrage.', {
              count: result.omitted,
              total: new Set(answers.map((a) => a.server.host)).size + result.omitted,
            })}
          </Note>
        )}
      </div>
    </section>
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

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-sm text-fg-muted">
      {icon}
      <span>{children}</span>
    </p>
  );
}

function StateBadge({ state, disagree }: { state: AuthoritativeReference['state']; disagree: boolean }) {
  const { t } = useI18n();
  if (state === 'unavailable') return <UncheckedBadge />;
  if (state === 'agreed' || state === 'providers') {
    return (
      <span className="badge badge-success">
        <Check className="size-3" />
        {t('einig')}
      </span>
    );
  }
  if (disagree) {
    return (
      <span className="badge badge-warning">
        <AlertTriangle className="size-3" />
        {t('uneinig')}
      </span>
    );
  }
  if (state === 'cname') return <span className="badge">CNAME</span>;
  return (
    <span className="badge">
      <Info className="size-3" />
      {t('verschieden')}
    </span>
  );
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
  const success = <Check className="mt-0.5 size-4 shrink-0 text-success" />;
  const neutral = <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" />;
  const warning = <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />;

  switch (state) {
    case 'agreed':
      return (
        <>
          <Note icon={success}>
            {reference.values.length > 0
              ? t('Die Nameserver sind sich einig — die Resolver werden mit ihrer Antwort verglichen.')
              : t('Die Nameserver sind sich einig: Unter diesem Namen gibt es keinen {type}-Record.', { type })}
          </Note>
          {/* Verschiedene Seriennummern bei mehreren Anbietern sind keine
              Störung — sagen, warum die Zeilen verschiedene zeigen. */}
          {reference.primaries > 1 && (
            <Note icon={neutral}>
              {t('Die Zone liegt bei {count} Anbietern, jeder mit eigener Seriennummer — kein Fehler.', {
                count: reference.primaries,
              })}
            </Note>
          )}
        </>
      );
    case 'providers':
      return (
        <Note icon={success}>
          {t('Die Nameserver gehören zu {count} Anbietern, jeder mit eigener Seriennummer — aktuell ist ein Resolver, der eine davon liefert.', {
            count: reference.keys?.length ?? 0,
          })}
        </Note>
      );
    case 'serial':
      return (
        <Note icon={warning}>
          {t('Die Nameserver sind uneinig: Ihre Seriennummern weichen ab — eine Änderung ist noch nicht auf allen angekommen.')}{' '}
          {majority}
        </Note>
      );
    case 'values':
      return (
        <Note icon={disagree ? warning : neutral}>
          {disagree
            ? t('Die Nameserver sind uneinig: Sie liefern unterschiedliche Werte.')
            : t('Die Nameserver liefern unterschiedliche Adressen — bei Lastverteilung oder GeoDNS üblich.')}{' '}
          {majority}
        </Note>
      );
    case 'cname':
      return (
        <Note icon={neutral}>
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
        <Note icon={<CircleHelp className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}>
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
    <div className="flex items-start justify-between gap-4 text-sm">
      {/* Links nimmt den Platz, den die Antwort lässt: Namen und IPv6-Adressen
          sind lang, eine Adresse rechts ist es nicht. */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[13px] text-fg-muted">
          <HostName host={server.host} />
        </p>
        {answers.map(({ server: { ip, responseTimeMs, error } }) =>
          ip ? (
            <p key={ip} className="flex flex-wrap gap-x-1 text-xs tabular-nums text-fg-subtle">
              <span className="min-w-0 font-mono wrap-anywhere">{ip}</span>
              {!error && <span className="whitespace-nowrap">· {responseTimeMs}ms</span>}
            </p>
          ) : null
        )}
        {server.serial &&
          (serialDeviates ? (
            <span className="badge badge-warning mt-1">
              <AlertTriangle className="size-3" />
              SOA {server.serial}
            </span>
          ) : (
            <p className="text-xs tabular-nums text-fg-subtle">SOA {server.serial}</p>
          ))}
      </div>

      {server.error ? (
        <span className="flex shrink-0 items-center gap-1.5 text-right text-[13px] text-fg-subtle">
          <CircleHelp className="size-3.5 shrink-0" />
          {t(FAILURE_TEXT[server.error])}
        </span>
      ) : cname ? (
        <span className="min-w-0 max-w-[55%] text-right font-mono text-[13px] text-fg-muted">
          → <HostName host={cname} />
        </span>
      ) : countsMissingAnswers(type) ? (
        <EntryBadge label={label} flagged={flagged} />
      ) : (
        <span
          className={cn(
            'flex max-w-[55%] shrink-0 items-start justify-end gap-1.5 text-right font-mono text-[13px]',
            flagged ? 'font-medium text-warning' : values.length === 0 ? 'text-fg-subtle' : 'text-fg'
          )}
        >
          {flagged && <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
          {values.length === 0 ? (
            <span className="truncate">{t('— kein Eintrag')}</span>
          ) : (
            // Untereinander: Zwei Adressen nebeneinander ließen dem Namen links
            // kaum Platz.
            <span className="flex min-w-0 flex-col items-end gap-y-1 wrap-anywhere">
              {values.map((value) => (
                <IpAddressLink key={value} ip={value} className="text-[13px] text-inherit" />
              ))}
            </span>
          )}
        </span>
      )}
    </div>
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
  if (flagged) {
    return (
      <span className="badge badge-warning">
        <AlertTriangle className="size-3" />
        {t('{label} · weicht ab', { label: text })}
      </span>
    );
  }
  if (!label) return <span className="text-[13px] text-fg-subtle">{t('— kein Eintrag')}</span>;
  return <span className="badge">{text}</span>;
}
