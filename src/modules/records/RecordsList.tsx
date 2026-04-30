import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import type { DnsRecord, RecordType } from '@/types/dns';
import { cn } from '@/lib/cn';

interface RecordsListProps {
  records: DnsRecord[];
}

export function RecordsList({ records }: RecordsListProps) {
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
        {filtered.map((record, i) => (
          <motion.div
            key={`${record.type}-${i}-${record.value}`}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
            className={cn(
              'grid grid-cols-[60px_1fr_auto] gap-3 px-4 py-3 items-center',
              i !== filtered.length - 1 && 'border-b border-ink-100 dark:border-ink-900/80'
            )}
          >
            <span className="text-xs font-mono font-medium text-accent-600 dark:text-accent-400">
              {record.type}
            </span>
            <span className="font-mono text-xs text-ink-900/80 dark:text-ink-50/80 truncate">
              {record.priority !== undefined && (
                <span className="text-ink-900/40 dark:text-ink-50/40 mr-2">
                  {record.priority}
                </span>
              )}
              {record.value}
            </span>
            <span className="text-[11px] text-ink-900/40 dark:text-ink-50/40 font-mono tabular-nums">
              {record.ttl}s
            </span>
          </motion.div>
        ))}
      </div>
    </div>
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
          ? 'bg-accent-500 text-white'
          : 'bg-ink-100 dark:bg-ink-900 text-ink-900/70 dark:text-ink-50/70 hover:bg-ink-100/80 dark:hover:bg-ink-900/80'
      )}
    >
      {children}
    </button>
  );
}
