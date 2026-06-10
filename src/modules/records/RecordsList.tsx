import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import type { DnsRecord, RecordType } from '@/types/dns';
import { cn } from '@/lib/cn';
import { IpAddressLink, IpOwnerLabel, isInspectableIp } from '@/components/ip/IpAddressLink';

interface RecordsListProps {
  records: DnsRecord[];
  onUseDomain?: (domain: string) => void;
}

export function RecordsList({ records, onUseDomain }: RecordsListProps) {
  const [filter, setFilter] = useState<RecordType | 'ALL'>('ALL');

  const types = useMemo(() => {
    const counts = new Map<RecordType, number>();
    records.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [records]);

  const filtered = filter === 'ALL' ? records : records.filter((r) => r.type === filter);

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <FilterPill active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          Alle <span className="opacity-60">· {records.length}</span>
        </FilterPill>
        {types.map(([type, count]) => (
          <FilterPill
            key={type}
            active={filter === type}
            onClick={() => setFilter(type)}
          >
            {type} <span className="opacity-60">· {count}</span>
          </FilterPill>
        ))}
      </div>

      <div className="surface rounded-xl overflow-hidden">
        {filtered.map((record, i) => {
          const hasIpDetails =
            (record.type === 'A' || record.type === 'AAAA') && isInspectableIp(record.value);

          return (
            <motion.div
              key={`${record.type}-${i}-${record.value}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              className={cn(
                'grid grid-cols-[60px_minmax(0,1fr)_auto] gap-3 px-4 py-3 items-center',
                i !== filtered.length - 1 && 'border-b border-ink-100 dark:border-ink-900/80'
              )}
            >
              <span className="text-xs font-mono font-medium text-ink-700 dark:text-ink-300">
                {record.type}
              </span>
              <span className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-ink-900/80 dark:text-ink-50/80">
                {record.priority !== undefined && (
                  <span className="text-ink-900/40 dark:text-ink-50/40 mr-2 shrink-0">
                    {record.priority}
                  </span>
                )}
                {hasIpDetails ? (
                  <>
                    <IpAddressLink ip={record.value} className="text-ink-900/80 dark:text-ink-50/80" />
                    <IpOwnerLabel ip={record.value} />
                  </>
                ) : record.type === 'NS' && onUseDomain ? (
                  <NameserverButton value={record.value} onClick={() => onUseDomain(record.value)} />
                ) : (
                  <span className="truncate">{record.value}</span>
                )}
              </span>
              <span className="text-[11px] text-ink-900/40 dark:text-ink-50/40 font-mono tabular-nums">
                {record.ttl}s
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function NameserverButton({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 truncate rounded-md text-left font-mono text-xs text-ink-900/80 transition-colors hover:text-ink-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-ink-50/80 dark:hover:text-white dark:focus-visible:outline-ink-50"
      title={`${value} in die Suche übernehmen`}
    >
      {value}
    </button>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-all',
        active
          ? 'bg-ink-950 text-white dark:bg-ink-50 dark:text-ink-950'
          : 'bg-ink-100 dark:bg-ink-900 text-ink-900/70 dark:text-ink-50/70 hover:bg-ink-200/70 dark:hover:bg-ink-800/80'
      )}
    >
      {children}
    </button>
  );
}
