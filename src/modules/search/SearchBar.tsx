import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useRef, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (domain: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  focusSignal?: number;
  loading?: boolean;
}

const EXAMPLES = ['github.com', 'www.cloudflare.com', 'www.mittwald.de'];

export function SearchBar({
  onSearch,
  value,
  onValueChange,
  focusSignal = 0,
  loading,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal <= 0) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().toLowerCase();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-2xl mx-auto"
    >
      <form onSubmit={handleSubmit} className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-900/40 dark:text-ink-50/40">
          <Search className="w-4 h-4" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="example.com oder www.example.com"
          autoComplete="off"
          spellCheck={false}
          className="w-full h-14 pl-11 pr-32 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 font-mono text-base placeholder:text-ink-900/30 dark:placeholder:text-ink-50/30 focus:outline-none focus:ring-2 focus:ring-ink-900/20 dark:focus:ring-ink-50/25 focus:border-ink-900/60 dark:focus:border-ink-50/60 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="absolute right-2 top-2 h-10 px-4 rounded-lg bg-ink-950 hover:bg-ink-800 dark:bg-ink-50 dark:hover:bg-ink-200 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-ink-950 font-medium text-sm transition-colors flex items-center justify-center"
          aria-label="Suchen"
        >
          {loading ? (
            <span className="dig-dots">
              <span /> <span /> <span />
            </span>
          ) : (
            <Search className="w-4 h-4" />
          )}
        </button>
      </form>

      <div className="mt-3 flex items-center gap-2 text-xs text-ink-900/50 dark:text-ink-50/40 justify-center">
        <span>Try:</span>
        {EXAMPLES.map((ex, i) => (
          <span key={ex} className="flex items-center gap-2">
            {i > 0 && <span className="opacity-40">·</span>}
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                onValueChange(ex);
                onSearch(ex);
              }}
              className="text-ink-900 dark:text-ink-50 hover:underline transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
            >
              {ex}
            </button>
          </span>
        ))}
      </div>
    </motion.div>
  );
}
