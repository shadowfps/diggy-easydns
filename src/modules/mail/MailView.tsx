import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Mail,
  MailX,
  Check,
  X,
  AlertTriangle,
  CircleMinus,
  FileSignature,
  Send,
} from 'lucide-react';
import type { LookupFailure, MailSecurity } from '@/types/dns';
import { cn } from '@/lib/cn';
import { dmarcPct, noMailProtection, spfMechanisms } from '@/lib/nullMx';
import { CardHeader, type Tone } from '@/components/ui/CardHeader';
import { UncheckedBadge, UncheckedLine } from '@/components/ui/Unchecked';

interface MailViewProps {
  mail: MailSecurity;
}

export function MailView({ mail }: MailViewProps) {
  // Ein Null-MX ist ein MX-Record, aber kein Empfang — wie im reportBuilder.
  const receivesMail = mail.hasMx && !mail.nullMx;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {mail.nullMx && <NoMailCard mail={mail} />}
      <SpfCard spf={mail.spf} hasMx={receivesMail} />
      <DmarcCard dmarc={mail.dmarc} hasMx={receivesMail} />
      <DkimCard dkim={mail.dkim} noMail={mail.nullMx} />
      <MtaStsCard mtaSts={mail.mtaSts} noMail={mail.nullMx} />
    </div>
  );
}

/*
 * Die Töne der Kartenköpfe folgen den Mail-Findings (reportBuilder): ein
 * fehlender SPF-/DMARC-Record ist mit MX eine Warnung, ohne MX nur ein
 * Hinweis; DKIM und MTA-STS fehlen höchstens als Hinweis — und bei einer
 * Domain ohne Mail (Null-MX) gar nicht. Scheiterte die Abfrage
 * (`lookupFailed`), ist nichts bewertet: neutral und „nicht prüfbar“ statt
 * „fehlt“ (#101).
 */

/* ─── Keine Mails (Null-MX) ──────────────────────────────────────────── */

/**
 * Steht über den vier Karten, weil es die Aussage ist, die alle anderen
 * einordnet: Diese Domain will keine Mails. Darunter, ob SPF und DMARC das
 * für den Versand absichern (Regel: shared/nullMx.ts).
 */
function NoMailCard({ mail }: { mail: MailSecurity }) {
  const protection = noMailProtection(mail);

  return (
    <Card
      icon={<MailX className="size-4" />}
      title="Keine Mails (Null-MX)"
      subtitle="Die Domain nimmt bewusst keine Mails an"
      tone={protection.complete ? 'success' : 'neutral'}
      delay={0}
      className="md:col-span-2"
    >
      <p className="text-sm leading-relaxed text-fg-muted">
        Der Null-MX <code className="font-mono text-[13px] text-fg">MX 0 .</code> (RFC 7505)
        sagt jedem Absender: Hier kommt keine Mail an. DKIM und MTA-STS braucht die Domain
        deshalb nicht.{' '}
        {protection.complete
          ? 'SPF und DMARC sorgen dafür, dass Empfänger Mails in ihrem Namen abweisen.'
          : 'Damit Empfänger auch Mails in ihrem Namen abweisen, gehören SPF -all und DMARC p=reject dazu.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Stat label="Null-MX" value="gesetzt" tone="success" />
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
      </div>
    </Card>
  );
}

/**
 * Was am SPF fehlt, in einem Wort: Steht nur `all` drin, sagt dessen
 * Qualifier alles (`~all`: Fälschungen nur verdächtig statt abgelehnt); jeder
 * weitere Mechanismus erlaubt Absender.
 */
function noMailSpfLabel(spf: MailSecurity['spf'], allowsNoSender: boolean): string {
  if (allowsNoSender) return '-all';
  if (!spf.present || !spf.record) return 'fehlt';
  const mechanisms = spfMechanisms(spf.record) ?? [];
  return mechanisms.length === 1 && /^[+~?]?all$/.test(mechanisms[0])
    ? mechanisms[0]
    : 'erlaubt Absender';
}

/** `reject` gilt erst ohne `pct` unter 100 — sonst steht der Anteil dabei. */
function noMailDmarcLabel(dmarc: MailSecurity['dmarc'], reject: boolean): string {
  if (reject) return 'reject';
  if (!dmarc.present || !dmarc.policy) return 'fehlt';
  if (dmarc.policy === 'reject') return `reject, pct=${dmarcPct(dmarc.record)}`;
  return dmarc.policy;
}

/* ─── SPF ─────────────────────────────────────────────────────────────── */

function SpfCard({ spf, hasMx }: { spf: MailSecurity['spf']; hasMx: boolean }) {
  const tone: Tone = !spf.present
    ? hasMx
      ? 'warning'
      : 'neutral'
    : !spf.valid
    ? 'danger'
    : spf.issues.length > 0
    ? 'warning'
    : 'success';

  return (
    <Card
      icon={<Send className="size-4" />}
      title="SPF"
      subtitle="Wer darf in deinem Namen senden?"
      tone={tone}
      delay={0}
      unchecked={spf.lookupFailed}
    >
      {!spf.present ? (
        <StatusLine text="Kein SPF-Record gefunden" tone={hasMx ? 'warning' : 'neutral'} />
      ) : (
        <div className="space-y-3">
          <CodeBlock>{spf.record}</CodeBlock>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Stat label="Lookups" value={`${spf.lookupCount ?? 0} / 10`} />
            <Stat
              label="Status"
              value={spf.valid ? 'gültig' : 'problematisch'}
              tone={spf.valid ? 'success' : 'danger'}
            />
          </div>
          {spf.issues.length > 0 && (
            <ul className="space-y-1.5">
              {spf.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-fg-muted">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── DMARC ──────────────────────────────────────────────────────────── */

function DmarcCard({ dmarc, hasMx }: { dmarc: MailSecurity['dmarc']; hasMx: boolean }) {
  const policyTone: Tone =
    dmarc.policy === 'reject'
      ? 'success'
      : dmarc.policy === 'quarantine'
      ? 'success'
      : dmarc.policy === 'none'
      ? 'warning'
      : 'neutral';

  const tone: Tone = !dmarc.present
    ? hasMx
      ? 'warning'
      : 'neutral'
    : dmarc.policy === 'none'
    ? 'warning'
    : 'success';

  return (
    <Card
      icon={<Mail className="size-4" />}
      title="DMARC"
      subtitle="Was passiert mit Spoofing-Versuchen?"
      tone={tone}
      delay={0.05}
      unchecked={dmarc.lookupFailed}
    >
      {!dmarc.present ? (
        <StatusLine
          text="Kein DMARC-Record auf _dmarc.<domain>"
          tone={hasMx ? 'warning' : 'neutral'}
        />
      ) : (
        <div className="space-y-3">
          <CodeBlock>{dmarc.record}</CodeBlock>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Stat label="Policy" value={dmarc.policy ?? '—'} tone={policyTone} />
            {dmarc.rua && <Stat label="Reports" value="rua gesetzt" tone="success" />}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── DKIM ───────────────────────────────────────────────────────────── */

function DkimCard({ dkim, noMail }: { dkim: MailSecurity['dkim']; noMail: boolean }) {
  const found = dkim.selectors.length > 0;

  return (
    <Card
      icon={<FileSignature className="size-4" />}
      title="DKIM"
      subtitle="Welche Selectors signieren ausgehende Mails?"
      tone={found ? 'success' : 'neutral'}
      delay={0.1}
      // Ein gefundener Selector reicht für „aktiv“, auch wenn andere scheiterten.
      unchecked={!found && dkim.lookupFailed}
    >
      {!found && noMail ? (
        <StatusLine
          text="Nicht nötig: Eine Domain ohne Mails (Null-MX) hat nichts zu signieren."
          tone="not-needed"
        />
      ) : !found ? (
        <StatusLine
          text="Keine gängigen DKIM-Selectors gefunden (default, google, selector1, k1, …)"
          tone="neutral"
        />
      ) : (
        <div className="space-y-3">
          {dkim.selectors.map((s) => (
            <div key={s.selector} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Check className="size-3.5 shrink-0 text-success" />
                <span className="font-mono text-[13px] text-fg">
                  {s.selector}._domainkey
                </span>
              </div>
              {s.record && (
                <CodeBlock truncate>{s.record}</CodeBlock>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ─── MTA-STS ────────────────────────────────────────────────────────── */

function MtaStsCard({ mtaSts, noMail }: { mtaSts: MailSecurity['mtaSts']; noMail: boolean }) {
  return (
    <Card
      icon={<Mail className="size-4" />}
      title="MTA-STS"
      subtitle="Erzwingt TLS für eingehende Mail"
      tone={mtaSts.present ? 'success' : 'neutral'}
      delay={0.15}
      unchecked={mtaSts.lookupFailed}
    >
      <div className="flex items-center gap-2 text-sm">
        {mtaSts.present ? (
          <>
            <Check className="size-4 shrink-0 text-success" />
            <span className="font-medium text-success">aktiviert</span>
          </>
        ) : noMail ? (
          <>
            <CircleMinus className="size-4 shrink-0 text-fg-subtle" />
            <span className="text-fg-muted">nicht nötig</span>
          </>
        ) : (
          <>
            <X className="size-4 shrink-0 text-fg-subtle" />
            <span className="text-fg-muted">nicht eingerichtet</span>
          </>
        )}
      </div>
      {!mtaSts.present && (
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {noMail
            ? 'MTA-STS schützt den Weg eingehender Mails. Diese Domain nimmt per Null-MX keine an — es gibt nichts zu schützen.'
            : 'MTA-STS verhindert Downgrade-Angriffe, bei denen sich Angreifer zwischen Sender und Empfänger setzen und TLS abschalten.'}
        </p>
      )}
    </Card>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

/**
 * `unchecked`: die Abfrage scheiterte, aus diesem Grund. Dann zeigt die Karte
 * statt ihres Inhalts, dass nichts bewertet ist: neutral, Badge „nicht
 * prüfbar“ und der Grund.
 */
function Card({
  icon,
  title,
  subtitle,
  tone,
  delay,
  unchecked,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: Tone;
  delay: number;
  unchecked?: LookupFailure | false;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={cn('card', className)}
    >
      <CardHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        tone={unchecked ? 'neutral' : tone}
        aside={unchecked && <UncheckedBadge />}
      />
      <div className="mt-4">
        {unchecked ? <UncheckedLine name={title} reason={unchecked} /> : children}
      </div>
    </motion.div>
  );
}

function CodeBlock({ children, truncate }: { children: ReactNode; truncate?: boolean }) {
  return (
    <pre
      className={cn(
        'panel overflow-x-auto py-3 font-mono text-xs text-fg',
        truncate && 'whitespace-nowrap text-ellipsis overflow-hidden'
      )}
    >
      {children}
    </pre>
  );
}

/**
 * Statuszeile in der Karte, wenn ein Record fehlt. Kein `EmptyState`: der ist
 * selbst eine Karte und gehört an die Stelle eines ganzen Abschnitts.
 *
 * `not-needed`: Der Record fehlt, und das ist richtig so (Domain ohne Mail).
 * Ein eigenes Icon statt des Kreuzes, weil das Kreuz „fehlt“ heißt; die Farbe
 * kann den Unterschied nicht tragen, beide Zeilen sind neutral.
 */
function StatusLine({ text, tone }: { text: string; tone: 'warning' | 'neutral' | 'not-needed' }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 text-sm',
        tone === 'warning' ? 'font-medium text-warning' : 'text-fg-muted'
      )}
    >
      {tone === 'warning' ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      ) : tone === 'not-needed' ? (
        <CircleMinus className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
      )}
      <span>{text}</span>
    </div>
  );
}

const STAT_ICON: Record<Tone, ReactNode> = {
  neutral: null,
  success: <Check className="size-3.5 shrink-0" />,
  warning: <AlertTriangle className="size-3.5 shrink-0" />,
  danger: <X className="size-3.5 shrink-0" />,
};

const STAT_TEXT: Record<Tone, string> = {
  neutral: 'text-fg',
  success: 'font-medium text-success',
  warning: 'font-medium text-warning',
  danger: 'font-medium text-danger',
};

/** Label/Wert-Paar; Statuswerte tragen neben der Farbe ein Icon. */
function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-subtle">{label}</span>
      <span className={cn('flex items-center gap-1 text-sm', STAT_TEXT[tone])}>
        {STAT_ICON[tone]}
        {value}
      </span>
    </div>
  );
}
