import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Menu, X, ArrowUpRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

interface HeaderProps {
  onHome?: () => void;
  onHistory?: () => void;
  onAvailability?: () => void;
  onAbout?: () => void;
}

export function Header({ onHome, onHistory, onAvailability, onAbout }: HeaderProps) {
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

  const handleHome = () => {
    setOpen(false);
    onHome?.();
  };

  const handleHistory = () => {
    setOpen(false);
    onHistory?.();
  };

  const handleAbout = () => {
    setOpen(false);
    onAbout?.();
  };

  const handleAvailability = () => {
    setOpen(false);
    onAvailability?.();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 dark:border-ink-900 bg-ink-50/80 dark:bg-ink-950/80 backdrop-blur-md">
      <div className="px-6 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            onClick={handleHome}
            className="font-brand font-bold text-xl tracking-tight text-ink-950 dark:text-ink-50 lowercase transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-900 dark:focus-visible:outline-ink-50"
            aria-label="Zur Startseite"
          >
            diggy
          </button>
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-900/40 dark:text-ink-50/40 font-medium hidden sm:inline">
            dns made friendly
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://github.com/shadowfps/diggy-easydns"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-white text-ink-950 dark:text-ink-950 hover:bg-ink-100 dark:hover:bg-ink-100 transition-colors text-sm font-medium"
          >
            <svg viewBox="0 0 98 96" className="w-4 h-4 fill-ink-950" aria-hidden="true">
              <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
            </svg>
            GitHub
          </a>

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
                <MenuItem onClick={handleHistory} label="History" />
                <MenuItem onClick={handleAvailability} label="Available Check" />
                <MenuItem onClick={handleAbout} label="About" />

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
