import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Mail, Check, X, AlertTriangle, FileSignature, Send } from 'lucide-react';
import type { MailSecurity } from '@/types/dns';
import { cn } from '@/lib/cn';
import { lookupFailureLabel } from '@/lib/lookupFailure';
import { CardHeader, type Tone } from '@/components/ui/CardHeader';
import { UncheckedBadge, UncheckedLine } from '@/components/ui/Unchecked';

interface MailViewProps {
  mail: MailSecurity;
}

export function MailView({ mail }: MailViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SpfCard spf={mail.spf} hasMx={mail.hasMx} />
      <DmarcCard dmarc={mail.dmarc} hasMx={mail.hasMx} />
      <DkimCard dkim={mail.dkim} />
      <MtaStsCard mtaSts={mail.mtaSts} />
    </div>
  );
}

/*
 * Die Töne der Kartenköpfe folgen den Mail-Findings (reportBuilder): ein
 * fehlender SPF-/DMARC-Record ist mit MX eine Warnung, ohne MX nur ein
 * Hinweis; DKIM und MTA-STS fehlen höchstens als Hinweis. Scheiterte die
 * Abfrage (`lookupFailed`), ist nichts bewertet: neutral und „nicht prüfbar“
 * statt „fehlt“ (#101).
 */

/* ─── SPF ─────────────────────────────────────────────────────────────── */

function SpfCard({ spf, hasMx }: { spf: MailSecurity['spf']; hasMx: boolean }) {
  if (spf.lookupFailed) {
    return (
      <UncheckedCard
        icon={<Send className="size-4" />}
        title="SPF"
        subtitle="Wer darf in deinem Namen senden?"
        delay={0}
      >
        Die TXT-Abfrage der Domain scheiterte ({lookupFailureLabel(spf.lookupFailed)}). Ob ein
        SPF-Record existiert, bleibt offen — später erneut prüfen.
      </UncheckedCard>
    );
  }

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
  if (dmarc.lookupFailed) {
    return (
      <UncheckedCard
        icon={<Mail className="size-4" />}
        title="DMARC"
        subtitle="Was passiert mit Spoofing-Versuchen?"
        delay={0.05}
      >
        Die Abfrage von _dmarc.&lt;domain&gt; scheiterte ({lookupFailureLabel(dmarc.lookupFailed)}).
        Ob ein DMARC-Record existiert, bleibt offen — später erneut prüfen.
      </UncheckedCard>
    );
  }

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

function DkimCard({ dkim }: { dkim: MailSecurity['dkim'] }) {
  const found = dkim.selectors.length > 0;

  if (!found && dkim.lookupFailed) {
    return (
      <UncheckedCard
        icon={<FileSignature className="size-4" />}
        title="DKIM"
        subtitle="Welche Selectors signieren ausgehende Mails?"
        delay={0.1}
      >
        Nicht alle gängigen Selectors ließen sich abfragen (
        {lookupFailureLabel(dkim.lookupFailed)}). Ob DKIM eingerichtet ist, bleibt offen — später
        erneut prüfen.
      </UncheckedCard>
    );
  }

  return (
    <Card
      icon={<FileSignature className="size-4" />}
      title="DKIM"
      subtitle="Welche Selectors signieren ausgehende Mails?"
      tone={found ? 'success' : 'neutral'}
      delay={0.1}
    >
      {!found ? (
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

function MtaStsCard({ mtaSts }: { mtaSts: MailSecurity['mtaSts'] }) {
  if (mtaSts.lookupFailed) {
    return (
      <UncheckedCard
        icon={<Mail className="size-4" />}
        title="MTA-STS"
        subtitle="Erzwingt TLS für eingehende Mail"
        delay={0.15}
      >
        Die Abfrage von _mta-sts.&lt;domain&gt; scheiterte (
        {lookupFailureLabel(mtaSts.lookupFailed)}). Ob MTA-STS eingerichtet ist, bleibt offen —
        später erneut prüfen.
      </UncheckedCard>
    );
  }

  return (
    <Card
      icon={<Mail className="size-4" />}
      title="MTA-STS"
      subtitle="Erzwingt TLS für eingehende Mail"
      tone={mtaSts.present ? 'success' : 'neutral'}
      delay={0.15}
    >
      <div className="flex items-center gap-2 text-sm">
        {mtaSts.present ? (
          <>
            <Check className="size-4 shrink-0 text-success" />
            <span className="font-medium text-success">aktiviert</span>
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
          MTA-STS verhindert Downgrade-Angriffe, bei denen sich Angreifer zwischen Sender und
          Empfänger setzen und TLS abschalten.
        </p>
      )}
    </Card>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

function Card({
  icon,
  title,
  subtitle,
  tone,
  aside,
  delay,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: Tone;
  aside?: ReactNode;
  delay: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="card"
    >
      <CardHeader icon={icon} title={title} subtitle={subtitle} tone={tone} aside={aside} />
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

/** Karte, deren Abfrage scheiterte: neutral, Badge „nicht prüfbar“, darunter der Grund. */
function UncheckedCard({
  icon,
  title,
  subtitle,
  delay,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <Card
      icon={icon}
      title={title}
      subtitle={subtitle}
      tone="neutral"
      aside={<UncheckedBadge />}
      delay={delay}
    >
      <UncheckedLine>{children}</UncheckedLine>
    </Card>
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
 */
function StatusLine({ text, tone }: { text: string; tone: 'warning' | 'neutral' }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 text-sm',
        tone === 'warning' ? 'font-medium text-warning' : 'text-fg-muted'
      )}
    >
      {tone === 'warning' ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
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
