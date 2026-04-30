import { motion } from 'framer-motion';
import { Mail, Check, X, AlertTriangle, FileSignature, Send } from 'lucide-react';
import type { MailSecurity } from '@/types/dns';
import { cn } from '@/lib/cn';

interface MailViewProps {
  mail: MailSecurity;
}

export function MailView({ mail }: MailViewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SpfCard spf={mail.spf} />
      <DmarcCard dmarc={mail.dmarc} />
      <DkimCard dkim={mail.dkim} />
      <MtaStsCard mtaSts={mail.mtaSts} />
    </div>
  );
}

/* ─── SPF ─────────────────────────────────────────────────────────────── */

function SpfCard({ spf }: { spf: MailSecurity['spf'] }) {
  return (
    <Card
      icon={<Send className="w-4 h-4" />}
      title="SPF"
      subtitle="Wer darf in deinem Namen senden?"
      delay={0}
    >
      {!spf.present ? (
        <EmptyState text="Kein SPF-Record gefunden" tone="warn" />
      ) : (
        <div className="space-y-3">
          <CodeBlock>{spf.record}</CodeBlock>
          <div className="flex items-center gap-4 text-xs">
            <Stat label="Lookups" value={`${spf.lookupCount ?? 0} / 10`} />
            <Stat
              label="Status"
              value={spf.valid ? 'gültig' : 'problematisch'}
              tone={spf.valid ? 'ok' : 'bad'}
            />
          </div>
          {spf.issues.length > 0 && (
            <ul className="text-xs space-y-1 mt-2">
              {spf.issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-1.5 text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
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

function DmarcCard({ dmarc }: { dmarc: MailSecurity['dmarc'] }) {
  const policyTone =
    dmarc.policy === 'reject'
      ? 'ok'
      : dmarc.policy === 'quarantine'
      ? 'ok'
      : dmarc.policy === 'none'
      ? 'warn'
      : 'muted';

  return (
    <Card
      icon={<Mail className="w-4 h-4" />}
      title="DMARC"
      subtitle="Was passiert mit Spoofing-Versuchen?"
      delay={0.05}
    >
      {!dmarc.present ? (
        <EmptyState text="Kein DMARC-Record auf _dmarc.<domain>" tone="warn" />
      ) : (
        <div className="space-y-3">
          <CodeBlock>{dmarc.record}</CodeBlock>
          <div className="flex items-center gap-4 text-xs">
            <Stat label="Policy" value={dmarc.policy ?? '—'} tone={policyTone} />
            {dmarc.rua && <Stat label="Reports" value="rua gesetzt" tone="ok" />}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── DKIM ───────────────────────────────────────────────────────────── */

function DkimCard({ dkim }: { dkim: MailSecurity['dkim'] }) {
  return (
    <Card
      icon={<FileSignature className="w-4 h-4" />}
      title="DKIM"
      subtitle="Welche Selectors signieren ausgehende Mails?"
      delay={0.1}
    >
      {dkim.selectors.length === 0 ? (
        <EmptyState
          text="Keine gängigen DKIM-Selectors gefunden (default, google, selector1, k1, …)"
          tone="info"
        />
      ) : (
        <div className="space-y-2">
          {dkim.selectors.map((s) => (
            <div key={s.selector} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-mono text-xs text-ink-900/80 dark:text-ink-50/80">
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
  return (
    <Card
      icon={<Mail className="w-4 h-4" />}
      title="MTA-STS"
      subtitle="Erzwingt TLS für eingehende Mail"
      delay={0.15}
    >
      <div className="flex items-center gap-2 text-sm">
        {mtaSts.present ? (
          <>
            <Check className="w-4 h-4 text-emerald-500" />
            <span className="text-emerald-600 dark:text-emerald-400">aktiviert</span>
          </>
        ) : (
          <>
            <X className="w-4 h-4 text-ink-900/40 dark:text-ink-50/40" />
            <span className="text-ink-900/60 dark:text-ink-50/60">nicht eingerichtet</span>
          </>
        )}
      </div>
      {!mtaSts.present && (
        <p className="mt-3 text-xs text-ink-900/50 dark:text-ink-50/50 leading-relaxed">
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
  delay,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="surface rounded-xl p-5"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-ink-900/60 dark:text-ink-50/60">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-ink-900/50 dark:text-ink-50/50 mb-4">{subtitle}</p>
      {children}
    </motion.div>
  );
}

function CodeBlock({ children, truncate }: { children: React.ReactNode; truncate?: boolean }) {
  return (
    <pre
      className={cn(
        'text-[11px] font-mono bg-ink-100 dark:bg-ink-950 border border-ink-100 dark:border-ink-900/80 rounded-lg p-3 overflow-x-auto text-ink-900/80 dark:text-ink-50/80',
        truncate && 'whitespace-nowrap text-ellipsis overflow-hidden'
      )}
    >
      {children}
    </pre>
  );
}

function EmptyState({ text, tone }: { text: string; tone: 'warn' | 'info' }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 text-sm',
        tone === 'warn' && 'text-orange-600 dark:text-orange-400',
        tone === 'info' && 'text-ink-900/60 dark:text-ink-50/60'
      )}
    >
      {tone === 'warn' ? (
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      ) : (
        <X className="w-4 h-4 mt-0.5 shrink-0" />
      )}
      <span>{text}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'muted',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'bad' | 'warn' | 'muted';
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-900/40 dark:text-ink-50/40 uppercase tracking-wider">{label}</span>
      <span
        className={cn(
          'font-medium',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400',
          tone === 'warn' && 'text-orange-600 dark:text-orange-400',
          tone === 'muted' && 'text-ink-900/70 dark:text-ink-50/70'
        )}
      >
        {value}
      </span>
    </div>
  );
}
