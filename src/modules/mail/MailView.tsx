import type { ReactNode } from 'react';
import {
  AlertBadge,
  AlertText,
  Badge,
  ColumnLayout,
  Combine,
  Content,
  Heading,
  IconClose,
  IconMinus,
  InlineCode,
  Label,
  LabeledValue,
  Link,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import type { LookupFailure, MailBimi, MailSecurity, MailTlsRpt } from '@/types/dns';
import { dmarcPct, noMailProtection, spfMechanisms } from '@/lib/nullMx';
import { bimiDmarcGapPhrase, isHttpsUrl } from '@/lib/bimiTlsRpt';
import {
  dmarcFlawEffectPhrase,
  dmarcPolicyFlawLabelPhrase,
  effectiveDmarcPolicy,
  hasDmarcReportUri,
} from '@/lib/dmarc';
import { phraseText, spfIssueText, t, useI18n, type DeKey } from '@/i18n';
import { CopyableValue } from '@/components/ui/CopyableValue';
import { InfoButton } from '@/components/ui/InfoButton';
import { explainMailTerm } from '@/lib/explanations';
import { UncheckedBadge, UncheckedLine } from '@/components/ui/Unchecked';
import styles from './MailView.module.css';

interface MailViewProps {
  mail: MailSecurity;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

/**
 * Mail-Schutz als Tab-Inhalt: je Verfahren eine Section, Flow trennt sie mit
 * einer Linie. Die Reihenfolge folgt der Wichtigkeit — erst, was Fälschungen
 * verhindert (SPF, DMARC, DKIM), dann der Transportweg, zuletzt die
 * Empfehlungen.
 */
export function MailView({ mail }: MailViewProps) {
  // Ein Null-MX ist ein MX-Record, aber kein Empfang — wie im reportBuilder.
  const receivesMail = mail.hasMx && !mail.nullMx;

  return (
    <>
      {mail.nullMx && <NoMailSection mail={mail} />}
      <SpfSection spf={mail.spf} hasMx={receivesMail} />
      <DmarcSection dmarc={mail.dmarc} hasMx={receivesMail} />
      <DkimSection dkim={mail.dkim} noMail={mail.nullMx} />
      <MtaStsSection mtaSts={mail.mtaSts} noMail={mail.nullMx} />
      {/* Ältere Antworten kennen BIMI und TLS-RPT nicht — dann keine Section statt „fehlt“. */}
      {mail.bimi && <BimiSection bimi={mail.bimi} dmarc={mail.dmarc} noMail={mail.nullMx} />}
      {mail.tlsRpt && <TlsRptSection tlsRpt={mail.tlsRpt} noMail={mail.nullMx} />}
    </>
  );
}

/*
 * Die Bewertungen folgen den Mail-Findings (reportBuilder): ein fehlender
 * SPF-/DMARC-Record ist mit MX eine Warnung, ohne MX nur ein Hinweis; DKIM und
 * MTA-STS fehlen höchstens als Hinweis — und bei einer Domain ohne Mail
 * (Null-MX) gar nicht. BIMI und TLS-RPT sind nur Empfehlungen: grün, wenn sie
 * wirken, sonst neutral. Scheiterte die Abfrage (`lookupFailed`), ist nichts
 * bewertet: „nicht prüfbar“ statt „fehlt“ (#101).
 */

/* ─── Keine Mails (Null-MX) ──────────────────────────────────────────── */

/**
 * Steht über den übrigen Sections, weil es die Aussage ist, die alle anderen
 * einordnet: Diese Domain will keine Mails. Darunter, ob SPF und DMARC das
 * für den Versand absichern (Regel: shared/nullMx.ts).
 */
function NoMailSection({ mail }: { mail: MailSecurity }) {
  const { t, tRich } = useI18n();
  const protection = noMailProtection(mail);

  return (
    <Section>
      <Heading level={2}>{t('Keine Mails (Null-MX)')}</Heading>
      <Text>
        <small>{t('Die Domain nimmt bewusst keine Mails an')}</small>
      </Text>
      <Text elementType="p">
        {tRich(
          'Der Null-MX {record} (RFC 7505) sagt jedem Absender: Hier kommt keine Mail an. DKIM und MTA-STS braucht die Domain deshalb nicht.',
          { record: <InlineCode>MX 0 .</InlineCode> }
        )}{' '}
        {protection.complete
          ? t('SPF und DMARC sorgen dafür, dass Empfänger Mails in ihrem Namen abweisen.')
          : t('Damit Empfänger auch Mails in ihrem Namen abweisen, gehören SPF -all und DMARC p=reject dazu.')}
      </Text>
      <ColumnLayout>
        <Stat label="Null-MX" value={t('gesetzt')} tone="success" />
        <Stat
          label="SPF"
          value={noMailSpfLabel(mail.spf, protection.spfAllowsNoSender)}
          tone={protection.spfAllowsNoSender ? 'success' : 'neutral'}
        />
        <Stat
          label="DMARC"
          value={noMailDmarcLabel(mail.dmarc, protection.dmarcReject)}
          tone={protection.dmarcReject ? 'success' : 'neutral'}
        />
      </ColumnLayout>
    </Section>
  );
}

/**
 * Was am SPF fehlt, in einem Wort: Steht nur `all` drin, sagt dessen
 * Qualifier alles (`~all`: Fälschungen nur verdächtig statt abgelehnt); jeder
 * weitere Mechanismus erlaubt Absender.
 */
function noMailSpfLabel(spf: MailSecurity['spf'], allowsNoSender: boolean): string {
  if (allowsNoSender) return '-all';
  if (spf.lookupFailed) return t('nicht prüfbar');
  if (!spf.present || !spf.record) return t('fehlt');
  const mechanisms = spfMechanisms(spf.record) ?? [];
  return mechanisms.length === 1 && /^[+~?]?all$/.test(mechanisms[0])
    ? mechanisms[0]
    : t('erlaubt Absender');
}

/**
 * `reject` gilt erst ohne `pct` unter 100 — sonst steht der Anteil dabei.
 * Ohne gültiges `p=` zählt, was Empfänger daraus machen (shared/dmarc.ts),
 * und der Mangel steht dabei.
 */
function noMailDmarcLabel(dmarc: MailSecurity['dmarc'], reject: boolean): string {
  if (reject) return 'reject';
  if (dmarc.lookupFailed) return t('nicht prüfbar');
  if (!dmarc.present) return t('fehlt');
  const { policy, flaw } = effectiveDmarcPolicy(dmarc);
  if (flaw) {
    const label = phraseText(dmarcPolicyFlawLabelPhrase(flaw));
    return policy ? t('wie none, {flaw}', { flaw: label }) : t('unwirksam, {flaw}', { flaw: label });
  }
  if (!policy) return t('fehlt');
  if (policy === 'reject') return `reject, pct=${dmarcPct(dmarc.record)}`;
  return policy;
}

/* ─── SPF ─────────────────────────────────────────────────────────────── */

function SpfSection({ spf, hasMx }: { spf: MailSecurity['spf']; hasMx: boolean }) {
  const { t } = useI18n();

  return (
    <MailSection title="SPF" subtitle={t('Wer darf in deinem Namen senden?')} unchecked={spf.lookupFailed}>
      {!spf.present ? (
        <StatusLine text={t('Kein SPF-Record gefunden')} tone={hasMx ? 'warning' : 'neutral'} />
      ) : (
        <>
          <RecordValue record={spf.record ?? ''} />
          <ColumnLayout>
            <Stat label="Lookups" value={`${spf.lookupCount ?? 0} / 10`} />
            <Stat
              label="Status"
              value={spf.valid ? t('gültig') : t('problematisch')}
              tone={spf.valid ? 'success' : 'danger'}
            />
          </ColumnLayout>
          {spf.issues.map((issue, i) => (
            <AlertText key={i} status="warning">
              {spfIssueText(issue, spf.issueDetails?.[i])}
            </AlertText>
          ))}
        </>
      )}
    </MailSection>
  );
}

/* ─── DMARC ──────────────────────────────────────────────────────────── */

/**
 * Bewertet wie der reportBuilder nach der wirksamen Policy (shared/dmarc.ts):
 * Ein Record ohne gültiges `p=` oder mit ungültigem `sp=` wirkt mit
 * Report-Adresse in `rua=` wie `p=none`, ohne wie gar keiner — ebenso
 * mehrere Records (RFC 7489 §6.6.3). Den Mangel zeigt ein Badge in der
 * Überschrift — der Record allein sähe sonst nach „DMARC ist da“ aus.
 */
function DmarcSection({ dmarc, hasMx }: { dmarc: MailSecurity['dmarc']; hasMx: boolean }) {
  const { t } = useI18n();
  const { policy, flaw } = effectiveDmarcPolicy(dmarc);
  const multiple = flaw?.kind === 'multiple';

  // Ein Record, den Empfänger ignorieren, zählt wie keiner.
  const tone: Tone =
    policy === null ? (hasMx ? 'warning' : 'neutral') : policy === 'none' ? 'warning' : 'success';

  const policyTone: Tone =
    policy === 'reject' || policy === 'quarantine' ? 'success' : policy === 'none' ? 'warning' : tone;

  // Der Mangel trägt die Bewertung der Section: mit MX eine Warnung, ohne MX
  // nur ein Hinweis — wie ein fehlender Record.
  const flawLabel = flaw && phraseText(dmarcPolicyFlawLabelPhrase(flaw));
  const flawBadge =
    flawLabel &&
    (tone === 'warning' ? (
      <AlertBadge status="warning">{flawLabel}</AlertBadge>
    ) : (
      <Badge color="neutral">{flawLabel}</Badge>
    ));

  return (
    <MailSection
      title="DMARC"
      subtitle={t('Was passiert mit Spoofing-Versuchen?')}
      status={flawBadge}
      unchecked={dmarc.lookupFailed}
    >
      {!dmarc.present ? (
        <StatusLine
          text={t('Kein DMARC-Record auf _dmarc.<domain>')}
          tone={hasMx ? 'warning' : 'neutral'}
        />
      ) : (
        <>
          <Records records={dmarc.records ?? [dmarc.record ?? '']} />
          <ColumnLayout>
            <Stat
              label="Policy"
              value={policy === null ? t('keine') : flaw ? t('wie {policy}', { policy }) : policy}
              tone={policyTone}
            />
            {/* Bei mehreren Records gilt keiner — auch keine Report-Adresse. */}
            {dmarc.rua &&
              !multiple &&
              (hasDmarcReportUri(dmarc.record) ? (
                <Stat label="Reports" value={t('rua gesetzt')} tone="success" />
              ) : (
                <Stat label="Reports" value={t('rua ungültig')} />
              ))}
          </ColumnLayout>
          {flaw && <Issue text={phraseText(dmarcFlawEffectPhrase(policy, flaw))} />}
        </>
      )}
    </MailSection>
  );
}

/* ─── DKIM ───────────────────────────────────────────────────────────── */

function DkimSection({ dkim, noMail }: { dkim: MailSecurity['dkim']; noMail: boolean }) {
  const { t } = useI18n();
  const found = dkim.selectors.length > 0;

  return (
    <MailSection
      title="DKIM"
      subtitle={t('Welche Selectors signieren ausgehende Mails?')}
      // Ein gefundener Selector reicht für „aktiv“, auch wenn andere scheiterten.
      // Ohne Mail (Null-MX) ist DKIM nicht nötig — dann zählt keine Probe.
      unchecked={!found && !noMail && dkim.lookupFailed}
    >
      {!found && noMail ? (
        <StatusLine
          text={t('Nicht nötig: Eine Domain ohne Mails (Null-MX) hat nichts zu signieren.')}
          tone="not-needed"
        />
      ) : !found ? (
        <StatusLine
          text={t('Keine gängigen DKIM-Selectors gefunden (default, google, selector1, k1, …)')}
          tone="neutral"
        />
      ) : (
        dkim.selectors.map((s) => (
          <LabeledValue key={s.selector}>
            <Label>
              <AlertText status="success">{`${s.selector}._domainkey`}</AlertText>
            </Label>
            {/* Der Schlüssel ist lang und für die Bewertung unwichtig: eine
                Zeile, gekürzt — vollständig über den Kopieren-Button. */}
            {s.record && <RecordValue record={s.record} truncate />}
          </LabeledValue>
        ))
      )}
    </MailSection>
  );
}

/* ─── MTA-STS ────────────────────────────────────────────────────────── */

function MtaStsSection({ mtaSts, noMail }: { mtaSts: MailSecurity['mtaSts']; noMail: boolean }) {
  const { t } = useI18n();
  return (
    <MailSection
      title="MTA-STS"
      subtitle={t('Erzwingt TLS für eingehende Mail')}
      unchecked={!noMail && mtaSts.lookupFailed}
    >
      {mtaSts.present ? (
        <AlertText status="success">{t('aktiviert')}</AlertText>
      ) : (
        <StatusLine text={noMail ? t('nicht nötig') : t('nicht eingerichtet')} tone={noMail ? 'not-needed' : 'neutral'} />
      )}
      {!mtaSts.present && (
        <Text elementType="p">
          {noMail
            ? t('MTA-STS schützt den Weg eingehender Mails. Diese Domain nimmt per Null-MX keine an — es gibt nichts zu schützen.')
            : t('MTA-STS verhindert Downgrade-Angriffe, bei denen sich Angreifer zwischen Sender und Empfänger setzen und TLS abschalten.')}
        </Text>
      )}
    </MailSection>
  );
}

/* ─── BIMI ───────────────────────────────────────────────────────────── */

/**
 * Das Logo erscheint nur als Link, nie als Bild: Ein `<img>` lüde beim
 * Öffnen des Tabs eine Datei von einem fremden Server — das verriete dessen
 * Betreiber, wer gerade nachschaut, und bräuchte eine Ausnahme in der CSP.
 */
function BimiSection({
  bimi,
  dmarc,
  noMail,
}: {
  bimi: MailBimi;
  dmarc: MailSecurity['dmarc'];
  noMail: boolean;
}) {
  const { t } = useI18n();
  // Ob BIMI wirkt, hängt an DMARC — ist dessen Abfrage gescheitert (#101),
  // bleibt das offen: „unbekannt“ statt „wirkt nicht“ oder „aktiv“.
  const dmarcUnknown = Boolean(dmarc.lookupFailed);
  const gap = dmarcUnknown ? undefined : bimiDmarcGapPhrase(dmarc);
  const dmarcGap = gap && phraseText(gap);
  const status: PolicyStatus = !bimi.present
    ? noMail
      ? 'not-needed'
      : 'missing'
    : bimi.declined
    ? 'declined'
    : bimi.invalid
    ? 'invalid'
    : dmarcUnknown
    ? 'unknown'
    : dmarcGap
    ? 'ineffective'
    : 'active';

  return (
    <MailSection
      title="BIMI"
      subtitle={t('Markenlogo neben deinen Mails')}
      status={<PolicyBadge status={status} />}
      // Ohne Mail (Null-MX) ist BIMI nicht nötig — dann zählt keine Abfrage.
      unchecked={!noMail && bimi.lookupFailed}
    >
      {status === 'not-needed' ? (
        <StatusLine
          text={t('Nicht nötig: Eine Domain ohne Mails (Null-MX) verschickt nichts, neben dem ein Logo stünde.')}
          tone="not-needed"
        />
      ) : status === 'missing' ? (
        <>
          <StatusLine text={t('Kein BIMI-Record auf default._bimi.<domain>')} tone="neutral" />
          <Text elementType="p">
            {dmarcUnknown
              ? t('Mit BIMI zeigen Postfächer dein Markenlogo neben authentifizierten Mails — vorausgesetzt, DMARC steht auf p=quarantine oder p=reject. Das ließ sich gerade nicht prüfen.')
              : dmarcGap
              ? t('BIMI setzt DMARC mit p=quarantine oder p=reject voraus, jetzt: {gap}. Erst DMARC verschärfen, dann lohnt sich BIMI.', { gap: dmarcGap })
              : t('Mit BIMI zeigen Postfächer dein Markenlogo neben authentifizierten Mails. Die DMARC-Voraussetzung ist erfüllt.')}
          </Text>
        </>
      ) : (
        <>
          <Records records={bimi.records} />
          {bimi.invalid ? (
            <Issue text={invalidText(bimi)} />
          ) : bimi.declined ? (
            <Text elementType="p">{t('l= und a= sind leer: Die Domain verzichtet ausdrücklich auf ein Logo.')}</Text>
          ) : (
            <>
              <ColumnLayout>
                {bimi.logoUrl && isHttpsUrl(bimi.logoUrl) && <LogoLink url={bimi.logoUrl} />}
                <Stat
                  label={t('Zertifikat (VMC/CMC)')}
                  value={bimi.evidenceUrl ? t('hinterlegt') : t('keins')}
                  tone={bimi.evidenceUrl ? 'success' : 'neutral'}
                />
              </ColumnLayout>
              {dmarcUnknown && (
                <Issue text={t('Ob Postfächer das Logo zeigen, hängt an DMARC — dessen Abfrage ist gescheitert.')} />
              )}
              {dmarcGap && (
                <Issue
                  text={t('Postfächer zeigen das Logo erst bei DMARC mit p=quarantine oder p=reject, jetzt: {gap}.', { gap: dmarcGap })}
                />
              )}
            </>
          )}
        </>
      )}
    </MailSection>
  );
}

/**
 * Der Dateiname als Linktext, die volle URL steht im Record darüber.
 * `isHttpsUrl` prüft der Aufrufer noch einmal, obwohl der Server nur
 * https-URLs durchlässt: Aus diesem Wert wird ein `href`, und ein
 * `javascript:` darf dort auch bei einer veränderten Antwort nie landen.
 */
function LogoLink({ url }: { url: string }) {
  const { hostname, pathname } = new URL(url);
  const file = pathname.split('/').pop() || hostname;

  return (
    <LabeledValue>
      <Label>Logo</Label>
      <Link href={url} target="_blank" rel="noopener noreferrer" className="wrap-anywhere">
        {file}
      </Link>
    </LabeledValue>
  );
}

/* ─── TLS-RPT ────────────────────────────────────────────────────────── */

function TlsRptSection({ tlsRpt, noMail }: { tlsRpt: MailTlsRpt; noMail: boolean }) {
  const { t } = useI18n();
  const status: PolicyStatus = !tlsRpt.present
    ? noMail
      ? 'not-needed'
      : 'missing'
    : tlsRpt.invalid
    ? 'invalid'
    : 'active';

  return (
    <MailSection
      title="TLS-RPT"
      subtitle={t('Berichte über gescheiterte TLS-Zustellung')}
      status={<PolicyBadge status={status} />}
      unchecked={!noMail && tlsRpt.lookupFailed}
    >
      {status === 'not-needed' ? (
        <StatusLine
          text={t('Nicht nötig: Eine Domain ohne Mails (Null-MX) bekommt keine Zustellungen, über die jemand berichten könnte.')}
          tone="not-needed"
        />
      ) : status === 'missing' ? (
        <>
          <StatusLine text={t('Kein TLS-RPT-Record auf _smtp._tls.<domain>')} tone="neutral" />
          <Text elementType="p">
            {t('Mit TLS-RPT (RFC 8460) melden Absender, wenn die verschlüsselte Zustellung an deine Mailserver scheitert — die Rückmeldung zu MTA-STS.')}
          </Text>
        </>
      ) : (
        <>
          <Records records={tlsRpt.records} />
          {tlsRpt.invalid ? (
            <Issue text={invalidText(tlsRpt)} />
          ) : (
            <LabeledValue>
              <Label>{t('Berichte an')}</Label>
              <Content>
                <Text>
                  <ul className={styles.list}>
                    {tlsRpt.rua?.map((uri, i) => (
                      <li key={i}>
                        <InlineCode className="wrap-anywhere">{uri}</InlineCode>
                      </li>
                    ))}
                  </ul>
                </Text>
              </Content>
            </LabeledValue>
          )}
        </>
      )}
    </MailSection>
  );
}

/* ─── Status von BIMI und TLS-RPT ────────────────────────────────────── */

type PolicyStatus =
  | 'active'
  | 'missing'
  | 'invalid'
  | 'ineffective'
  | 'declined'
  | 'not-needed'
  | 'unknown';

/**
 * Status in der Überschrift, immer mit Wort. Grün nur, wenn der Record wirkt.
 * Ein ungültiger oder wirkungsloser Record ist ein Hinweis (Info, keine
 * Warnfarbe — BIMI und TLS-RPT sind Empfehlungen), eine offene Bewertung
 * `unavailable` wie „nicht prüfbar“; alles andere neutral.
 */
const POLICY_BADGE: Record<PolicyStatus, { label: DeKey; status?: 'success' | 'info' | 'unavailable' }> = {
  active: { label: 'aktiv', status: 'success' },
  missing: { label: 'fehlt' },
  invalid: { label: 'ungültig', status: 'info' },
  ineffective: { label: 'wirkt nicht', status: 'info' },
  declined: { label: 'abgemeldet' },
  'not-needed': { label: 'nicht nötig' },
  unknown: { label: 'unbekannt', status: 'unavailable' },
};

function PolicyBadge({ status }: { status: PolicyStatus }) {
  const { t } = useI18n();
  const badge = POLICY_BADGE[status];
  return badge.status ? (
    <AlertBadge status={badge.status}>{t(badge.label)}</AlertBadge>
  ) : (
    <Badge color="neutral">{t(badge.label)}</Badge>
  );
}

/** Warum der Record nicht wirkt — übersetzt, wo der Server den Grund als Baustein mitschickt. */
function invalidText(record: MailBimi | MailTlsRpt): string {
  return record.invalidDetail ? phraseText(record.invalidDetail) : (record.invalid ?? '');
}

function Records({ records = [] }: { records?: string[] }) {
  return (
    <>
      {records.map((record, i) => (
        <RecordValue key={i} record={record} />
      ))}
    </>
  );
}

/**
 * Ein Record zum Nachlesen und Kopieren. Bewusst kein CodeBlock: der bringt
 * einen ganzen Code-Editor mit, hier steht nur eine Zeile Text.
 */
function RecordValue({ record, truncate }: { record: string; truncate?: boolean }) {
  return <CopyableValue value={record} truncate={truncate} />;
}

/** Warum ein Record nicht wirkt — ein Hinweis, deshalb ohne Warnfarbe. */
function Issue({ text }: { text: string }) {
  return <AlertText status="info">{text}</AlertText>;
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

/**
 * Eine Section je Verfahren: Titel mit Erklärung („?“) und Status in der
 * Überschrift, darunter die Frage, die es beantwortet.
 *
 * `unchecked`: die Abfrage scheiterte, aus diesem Grund. Dann zeigt die
 * Section statt ihres Inhalts, dass nichts bewertet ist: „nicht prüfbar“ und
 * der Grund.
 */
function MailSection({
  title,
  subtitle,
  status,
  unchecked,
  children,
}: {
  /** Ist der Titel ein Fachbegriff (SPF, BIMI …), steht dahinter ein „?“ mit seiner Erklärung. */
  title: string;
  subtitle: string;
  status?: ReactNode;
  unchecked?: LookupFailure | false;
  children: ReactNode;
}) {
  const explanation = explainMailTerm(title);
  return (
    <Section>
      <Heading level={2}>
        {title}
        {explanation && <InfoButton term={title} explanation={explanation} />}
        {unchecked ? <UncheckedBadge /> : status}
      </Heading>
      <Text>
        <small>{subtitle}</small>
      </Text>
      {unchecked ? <UncheckedLine name={title} reason={unchecked} /> : children}
    </Section>
  );
}

/**
 * Statuszeile, wenn ein Record fehlt. Kein `EmptyState`: der gehört an die
 * Stelle eines ganzen Abschnitts.
 *
 * `not-needed`: Der Record fehlt, und das ist richtig so (Domain ohne Mail).
 * Ein eigenes Icon statt des Kreuzes, weil das Kreuz „fehlt“ heißt; die Farbe
 * kann den Unterschied nicht tragen, beide Zeilen sind neutral.
 *
 * Eine gescheiterte Abfrage zeigt die Section selbst (`unchecked`, #101).
 */
function StatusLine({ text, tone }: { text: string; tone: 'warning' | 'neutral' | 'not-needed' }) {
  if (tone === 'warning') return <AlertText status="warning">{text}</AlertText>;
  return (
    <Combine>
      {tone === 'not-needed' ? <IconMinus /> : <IconClose />}
      <Text>{text}</Text>
    </Combine>
  );
}

/** Beschriftung und Wert; Statuswerte tragen neben der Farbe ein Icon (AlertText). */
function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <LabeledValue>
      <Label>{label}</Label>
      {tone === 'neutral' ? <Content>{value}</Content> : <AlertText status={tone}>{value}</AlertText>}
    </LabeledValue>
  );
}
