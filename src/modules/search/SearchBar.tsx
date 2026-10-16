import { Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, type FormEvent } from 'react';
import type { LookupHistoryEntry } from '@/lib/lookupHistory';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n';

interface SearchBarProps {
  onSearch: (domain: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  focusSignal?: number;
  autoFocus?: boolean;
  loading?: boolean;
  /**
   * `hero`: großes Feld auf der Startseite, darunter zuletzt Geprüftes oder
   * Beispiele. `compact`: schmal für den Header auf Report-Seiten.
   */
  variant?: 'hero' | 'compact';
  /** Zuletzt geprüfte Domains — ersetzen die Beispiele, sobald es welche gibt. */
  recent?: LookupHistoryEntry[];
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
  variant = 'hero',
  recent = [],
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

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

  const run = (domain: string) => {
    onValueChange(domain);
    onSearch(domain);
  };

  const field = (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle',
          variant === 'hero' ? 'left-5' : 'left-3.5'
        )}
      >
        <Search className={variant === 'hero' ? 'size-[18px]' : 'size-4'} />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={t('Jetzt deine Anfrage starten')}
        aria-label={t('Domain oder IP-Adresse')}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'w-full rounded-full border border-line bg-surface font-mono text-fg transition-[border-color,box-shadow] placeholder:text-fg-subtle focus:border-fg/30 focus:outline-hidden focus:ring-4 focus:ring-fg/6',
          variant === 'hero' ? 'h-14 pl-12 pr-16 text-base shadow-card' : 'h-10 pl-10 pr-12 text-sm'
        )}
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className={cn(
          'btn btn-primary btn-icon absolute',
          variant === 'hero' ? 'right-2 top-2' : 'btn-sm right-1 top-1'
        )}
        aria-label={t('Suchen')}
      >
        {loading ? (
          <span className="dig-dots">
            <span /> <span /> <span />
          </span>
        ) : (
          <Search className={variant === 'hero' ? 'size-4' : 'size-3.5'} />
        )}
      </button>
    </form>
  );

  // Im Header ohne Einblend-Animation: er bleibt beim Wechsel zwischen
  // Reports stehen, eine Animation bei jedem Lookup wäre nur Unruhe.
  if (variant === 'compact') return field;

  const shortcuts = recent.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-2xl mx-auto"
    >
      {field}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {shortcuts.length > 0 ? (
          <>
            <span className="text-xs text-fg-subtle">{t('Zuletzt geprüft')}</span>
            {shortcuts.map((entry) => (
              <button
                key={entry.domain}
                type="button"
                disabled={loading}
                onClick={() => run(entry.domain)}
                className="chip font-mono disabled:opacity-45"
              >
                <span className={cn('size-2 rounded-full', scoreDot(entry.score))} aria-hidden />
                {entry.domain}
                <span className="text-fg-subtle">{entry.score}</span>
              </button>
            ))}
          </>
        ) : (
          <>
            <span className="text-xs text-fg-subtle">{t('Beispiele')}</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={loading}
                onClick={() => run(ex)}
                className="chip font-mono disabled:opacity-45"
              >
                {ex}
              </button>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Dieselben Stufen wie die Score-Karte. */
function scoreDot(score: number): string {
  if (score >= 65) return 'bg-success';
  if (score >= 40) return 'bg-warning';
  return 'bg-danger';
}
