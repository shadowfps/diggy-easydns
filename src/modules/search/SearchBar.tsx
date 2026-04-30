import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (domain: string) => void;
  loading?: boolean;
}

const EXAMPLES = ['github.com', 'cloudflare.com', 'mittwald.de'];

export function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [value, setValue] = useState('');

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
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="example.com"
          autoComplete="off"
          spellCheck={false}
          className="w-full h-14 pl-11 pr-32 rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-900/80 font-mono text-base placeholder:text-ink-900/30 dark:placeholder:text-ink-50/30 focus:outline-none focus:ring-2 focus:ring-diggy-500/40 focus:border-diggy-500/60 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="absolute right-2 top-2 h-10 px-5 rounded-lg bg-diggy-500 hover:bg-diggy-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors flex items-center gap-1.5"
        >
          {loading ? (
            <span className="dig-dots">
              <span /> <span /> <span />
            </span>
          ) : (
            <>Dig <span className="text-base leading-none">🐾</span></>
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
              onClick={() => {
                setValue(ex);
                onSearch(ex);
              }}
              className="text-accent-500 hover:text-accent-400 hover:underline transition-colors"
            >
              {ex}
            </button>
          </span>
        ))}
      </div>
    </motion.div>
  );
}
