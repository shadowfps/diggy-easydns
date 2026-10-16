import { motion } from 'motion/react';
import { useState, useMemo } from 'react';
import { MailX } from 'lucide-react';
import type { DnsRecord, RecordType } from '@/types/dns';
import { IpAddressLink, IpOwnerLabel } from '@/components/ip/IpAddressLink';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { InfoButton } from '@/components/ui/InfoButton';
import { NULL_MX_EXPLANATION, explainRecordType } from '@/lib/explanations';
import { isNullMx } from '@/lib/nullMx';
import { staggerDelay, useReducedMotion } from '@/hooks/useReducedMotion';
import { useI18n } from '@/i18n';

interface RecordsListProps {
  records: DnsRecord[];
  onUseDomain?: (domain: string) => void;
}

export function RecordsList({ records, onUseDomain }: RecordsListProps) {
  const [filter, setFilter] = useState<RecordType | 'ALL'>('ALL');
  const reduced = useReducedMotion();
  const { t } = useI18n();

  const types = useMemo(() => {
    const counts = new Map<RecordType, number>();
    records.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [records]);

  // Null-MX nur, wenn er der einzige MX ist (Regel: shared/nullMx.ts) —
  // steht ein echter daneben, stellen Absender dorthin zu. Deshalb über alle
  // Records, nicht nur die gefilterten.
  const nullMx = useMemo(() => isNullMx(records.filter((r) => r.type === 'MX')), [records]);

  const filtered = filter === 'ALL' ? records : records.filter((r) => r.type === filter);

  // Das „?“ zur Erklärung steht nur in der ersten Zeile je Typ. An jeder
  // Zeile wären es bei vielen TXT- oder NS-Records ein Dutzend gleiche
  // Fragezeichen untereinander — und ebenso viele Tab-Stopps.
  const explainedRows = new Set<number>();
  const seenTypes = new Set<RecordType>();
  filtered.forEach((record, i) => {
    if (seenTypes.has(record.type)) return;
    seenTypes.add(record.type);
    explainedRows.add(i);
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          {t('Alle')} <span className="tabular-nums opacity-60">· {records.length}</span>
        </FilterChip>
        {types.map(([type, count]) => (
          <FilterChip
            key={type}
            active={filter === type}
            onClick={() => setFilter(type)}
          >
            {type} <span className="tabular-nums opacity-60">· {count}</span>
          </FilterChip>
        ))}
      </div>

      {/* `overflow-visible`: die Erklärung hängt als Popover an der Typ-Spalte
          und reicht bei kurzen Listen über den Kartenrand. Mit dem
          `overflow-hidden` aus card-flush wäre sie dort abgeschnitten; die
          Zeilen haben keinen Hintergrund, die Rundung braucht es hier nicht. */}
      <div className="card-flush divide-y divide-line-subtle overflow-visible">
        {filtered.map((record, i) => {
          const hasIpDetails =
            (record.type === 'A' || record.type === 'AAAA') && isInspectableIp(record.value);
          const explanation = explainedRows.has(i) ? explainRecordType(record.type) : undefined;

          return (
            <motion.div
              key={`${record.type}-${i}-${record.value}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: staggerDelay(i, 0.03, reduced) }}
              className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6"
            >
              <span className="flex items-center gap-1 font-mono text-xs font-semibold text-fg-muted">
                {record.type}
                {explanation && <InfoButton term={record.type} explanation={explanation} />}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[13px] text-fg">
                {record.priority !== undefined && (
                  <span className="mr-2 shrink-0 tabular-nums text-fg-subtle">
                    {record.priority}
                  </span>
                )}
                {hasIpDetails ? (
                  <>
                    <IpAddressLink ip={record.value} className="text-[13px] text-fg" />
                    <IpOwnerLabel ip={record.value} className="text-xs text-fg-subtle" />
                  </>
                ) : record.type === 'NS' && onUseDomain ? (
                  <NameserverButton value={record.value} onClick={() => onUseDomain(record.value)} />
                ) : record.type === 'MX' ? (
                  <MxTarget value={record.value} nullMx={nullMx} />
                ) : (
                  // TXT ganz zeigen statt abschneiden: DKIM-Schlüssel, SPF und
                  // Verifizierungs-Tokens will man lesen und kopieren können.
                  // `wrap-anywhere` bricht lange Base64-Ketten, bevorzugt aber
                  // Leerzeichen — anders als `break-all` (#64).
                  <span className={record.type === 'TXT' ? 'wrap-anywhere' : 'truncate'}>
                    {record.value}
                  </span>
                )}
              </span>
              <Ttl ttl={record.ttl} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * TTL in Sekunden — oder „—“, wenn der Server sie nicht ermitteln konnte
 * (`null`, #76). Eine `0s` wäre dort falsch: 0 ist eine echte TTL und hieße
 * „nicht cachen“. Der Strich ist für Screenreader ausgeblendet und durch
 * „TTL unbekannt“ ersetzt, sonst würde nur „Gedankenstrich“ vorgelesen.
 */
function Ttl({ ttl }: { ttl: number | null }) {
  const { t } = useI18n();
  if (ttl === null) {
    return (
      <span className="text-xs text-fg-subtle" title={t('TTL unbekannt')}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('TTL unbekannt')}</span>
      </span>
    );
  }

  return <span className="text-xs tabular-nums text-fg-subtle">{ttl}s</span>;
}

/**
 * Ziel eines MX. Die Wurzel kommt vom Resolver als leerer Name, in der
 * Zonendatei heißt sie „.“ — gezeigt wird sie wie im Vergleich als Punkt,
 * sonst stünde vom Null-MX nur die Priorität da (#120). Nur die Anzeige:
 * der Record selbst (und damit der JSON-Export) bleibt, wie er kam.
 *
 * Das Badge steht nur beim echten Null-MX. Ein leeres Ziel neben weiteren
 * MX ist nach RFC 7505 ungültig; die Domain empfängt dann über die anderen.
 */
function MxTarget({ value, nullMx }: { value: string; nullMx: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <span className="truncate">{value || '.'}</span>
      {nullMx && (
        <span className="inline-flex items-center gap-1">
          {/* `font-sans`: die Spalte ist Mono, das Badge ist Text. */}
          <span className="badge font-sans">
            <MailX className="size-3" aria-hidden />
            {t('Null-MX — keine Mails')}
          </span>
          <InfoButton term={t('Null-MX')} explanation={NULL_MX_EXPLANATION} />
        </span>
      )}
    </>
  );
}

function NameserverButton({ value, onClick }: { value: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 truncate text-left font-mono text-[13px] text-fg underline-offset-4 hover:underline"
      title={t('{value} in die Suche übernehmen', { value })}
    >
      {value}
    </button>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="chip">
      {children}
    </button>
  );
}
