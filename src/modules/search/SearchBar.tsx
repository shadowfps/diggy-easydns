import { Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (domain: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  focusSignal?: number;
  autoFocus?: boolean;
  loading?: boolean;
}

const EXAMPLES = ['github.com', 'www.mittwald.de', 'www.cloudflare.com'];

// Auf Touch-Geräten würde ein Autofokus die Bildschirmtastatur aufziehen
// und das halbe Viewport verdecken — dort bleibt das Feld unberührt.
function prefersAutoFocus(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function SearchBar({
  onSearch,
  value,
  onValueChange,
  focusSignal = 0,
  autoFocus = false,
  loading,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus || !prefersAutoFocus()) return;
    // preventScroll: der Browser soll beim Fokussieren nicht zum Feld springen.
    inputRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-fg-subtle">
          <Search className="size-[18px]" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Jetzt deine Anfrage starten"
          autoComplete="off"
          spellCheck={false}
          className="h-14 w-full rounded-full border border-line bg-surface pl-12 pr-16 font-mono text-base text-fg shadow-card transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-fg/30 focus:outline-hidden focus:ring-4 focus:ring-fg/6"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="btn btn-primary btn-icon absolute right-2 top-2"
          aria-label="Suchen"
        >
          {loading ? (
            <span className="dig-dots">
              <span /> <span /> <span />
            </span>
          ) : (
            <Search className="size-4" />
          )}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-fg-subtle">Beispiele</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={loading}
            onClick={() => {
              onValueChange(ex);
              onSearch(ex);
            }}
            className="chip font-mono disabled:opacity-45"
          >
            {ex}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
