import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Menu, X, ArrowUpRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

export function Header() {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb → schließen
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Escape → schließen
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 dark:border-ink-900 bg-ink-50/80 dark:bg-ink-950/80 backdrop-blur-md">
      <div className="px-6 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-brand font-bold text-xl tracking-tight text-diggy-500 lowercase">
            diggy
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-900/40 dark:text-ink-50/40 font-medium hidden sm:inline">
            dns made friendly
          </span>
        </div>

        <div ref={wrapperRef} className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
            aria-expanded={open}
            className="p-2.5 rounded-xl border border-ink-100 dark:border-ink-900/80 bg-white dark:bg-ink-900 hover:bg-ink-100/60 dark:hover:bg-ink-900/60 transition-colors"
          >
            <AnimatePresence mode="wait" initial={false}>
              {open ? (
                <motion.span
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="block"
                >
                  <X className="w-5 h-5" />
                </motion.span>
              ) : (
                <motion.span
                  key="open"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="block"
                >
                  <Menu className="w-5 h-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-900/80 shadow-2xl shadow-black/10 dark:shadow-black/40 p-2 origin-top-right"
              >
                <MenuItem onClick={() => setOpen(false)} label="History" />
                <MenuItem onClick={() => setOpen(false)} label="API" />
                <MenuItem onClick={() => setOpen(false)} label="About" />

                <div className="border-t border-ink-100 dark:border-ink-900/80 my-2" />

                <div className="px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-ink-900/40 dark:text-ink-50/40 mb-2 font-medium">
                    Theme
                  </p>
                  <div className="flex gap-1 bg-ink-100/60 dark:bg-ink-950/60 p-1 rounded-xl">
                    <ThemeButton
                      active={theme === 'light'}
                      onClick={() => theme !== 'light' && toggle()}
                      label="Light"
                    >
                      <Sun className="w-4 h-4" />
                    </ThemeButton>
                    <ThemeButton
                      active={theme === 'dark'}
                      onClick={() => theme !== 'dark' && toggle()}
                      label="Dark"
                    >
                      <Moon className="w-4 h-4" />
                    </ThemeButton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 text-sm rounded-xl hover:bg-ink-100/80 dark:hover:bg-ink-950/60 transition-colors flex items-center justify-between group"
    >
      <span className="font-medium text-ink-900/90 dark:text-ink-50/90">{label}</span>
      <ArrowUpRight className="w-3.5 h-3.5 text-ink-900/30 dark:text-ink-50/30 group-hover:text-ink-900/70 dark:group-hover:text-ink-50/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
    </button>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label} mode`}
      aria-pressed={active}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all text-xs font-medium',
        active
          ? 'bg-white dark:bg-ink-900 shadow-sm text-ink-900 dark:text-ink-50'
          : 'text-ink-900/50 dark:text-ink-50/50 hover:text-ink-900/80 dark:hover:text-ink-50/80'
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
