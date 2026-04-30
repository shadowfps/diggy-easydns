import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type { LookupReport } from '@/types/dns';
import { cn } from '@/lib/cn';

interface QuickFactsProps {
  report: LookupReport;
}

export function QuickFacts({ report }: QuickFactsProps) {
  const aRecord = report.records.find((r) => r.type === 'A');
  const mxRecord = report.records.find((r) => r.type === 'MX');
  const nsRecord = report.records.find((r) => r.type === 'NS');

  const items = [
    { label: 'A', value: aRecord?.value ?? '—', mono: true },
    { label: 'NS', value: nsRecord?.value ?? '—', mono: true },
    { label: 'MX', value: mxRecord?.value ?? '—', mono: true, muted: !mxRecord },
    {
      label: 'SSL',
      value: report.ssl
        ? `${report.ssl.daysUntilExpiry} Tage`
        : 'kein Cert',
      ok: report.ssl?.valid && (report.ssl?.daysUntilExpiry ?? 0) > 14,
      bad: !report.ssl?.valid || (report.ssl?.daysUntilExpiry ?? 999) < 14,
    },
    {
      label: 'DNSSEC',
      value: report.dnssec.enabled && report.dnssec.valid ? 'aktiv' : 'inaktiv',
      ok: report.dnssec.enabled && report.dnssec.valid,
      bad: !report.dnssec.enabled,
    },
    {
      label: 'DMARC',
      value: report.mail.dmarc.present ? 'gesetzt' : 'fehlt',
      ok: report.mail.dmarc.present,
      bad: !report.mail.dmarc.present,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="surface rounded-2xl p-6"
    >
      <div className="text-sm text-ink-900/60 dark:text-ink-50/60 mb-4">
        Schnellübersicht
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 min-w-0">
            <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 w-14 shrink-0 font-medium">
              {item.label}
            </span>
            <span
              className={cn(
                'truncate',
                item.mono && 'font-mono text-xs',
                item.muted && 'text-ink-900/30 dark:text-ink-50/30',
                item.ok && 'text-emerald-600 dark:text-emerald-400 flex items-center gap-1',
                item.bad && 'text-red-600 dark:text-red-400 flex items-center gap-1'
              )}
            >
              {item.ok && <Check className="w-3.5 h-3.5 shrink-0" />}
              {item.bad && <X className="w-3.5 h-3.5 shrink-0" />}
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
