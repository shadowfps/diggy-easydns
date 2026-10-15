import { motion } from 'motion/react';
import { useState, useMemo } from 'react';
import type { DnsRecord, RecordType } from '@/types/dns';
import { IpAddressLink, IpOwnerLabel } from '@/components/ip/IpAddressLink';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { staggerDelay, useReducedMotion } from '@/hooks/useReducedMotion';

interface RecordsListProps {
  records: DnsRecord[];
  onUseDomain?: (domain: string) => void;
}

export function RecordsList({ records, onUseDomain }: RecordsListProps) {
  const [filter, setFilter] = useState<RecordType | 'ALL'>('ALL');
  const reduced = useReducedMotion();

  const types = useMemo(() => {
    const counts = new Map<RecordType, number>();
    records.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [records]);

  const filtered = filter === 'ALL' ? records : records.filter((r) => r.type === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          Alle <span className="tabular-nums opacity-60">· {records.length}</span>
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

      <div className="card-flush divide-y divide-line-subtle">
        {filtered.map((record, i) => {
          const hasIpDetails =
            (record.type === 'A' || record.type === 'AAAA') && isInspectableIp(record.value);

          return (
            <motion.div
              key={`${record.type}-${i}-${record.value}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: staggerDelay(i, 0.03, reduced) }}
              className="grid grid-cols-[60px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6"
            >
              <span className="font-mono text-xs font-semibold text-fg-muted">
                {record.type}
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
              <span className="text-xs tabular-nums text-fg-subtle">
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
      className="min-w-0 truncate text-left font-mono text-[13px] text-fg underline-offset-4 hover:underline"
      title={`${value} in die Suche übernehmen`}
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
