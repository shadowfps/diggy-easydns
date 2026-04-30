import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type TabId = 'records' | 'propagation' | 'security' | 'mail' | 'findings' | 'whois';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: TabId;
  onChange: (id: TabId) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-ink-100 dark:border-ink-900/80">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-4 py-2.5 text-sm font-medium transition-colors',
            active === tab.id
              ? 'text-ink-900 dark:text-ink-50'
              : 'text-ink-900/50 dark:text-ink-50/50 hover:text-ink-900/80 dark:hover:text-ink-50/80'
          )}
        >
          <span className="flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-100 dark:bg-ink-900 text-ink-900/60 dark:text-ink-50/60 tabular-nums">
                {tab.count}
              </span>
            )}
          </span>
          {active === tab.id && (
            <motion.div
              layoutId="active-tab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-diggy-500"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
