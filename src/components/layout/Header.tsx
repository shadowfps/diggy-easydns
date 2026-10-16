import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Sun, Menu, X, ArrowUpRight } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

export type HeaderSection = 'history' | 'availability' | 'about';

interface HeaderProps {
  onHome?: () => void;
  onHistory?: () => void;
  onAvailability?: () => void;
  onAbout?: () => void;
  /** Kompakte Suche — auf Report-Seiten steht sie hier statt über dem Report. */
  search?: ReactNode;
  /** Aktuelle Seite, für die Markierung in der Navigation. */
  current?: HeaderSection | null;
}

export function Header({ onHome, onHistory, onAvailability, onAbout, search, current }: HeaderProps) {
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

  const navItems: { id: HeaderSection; label: string; href: string; onClick: () => void }[] = [
    { id: 'history', label: 'History', href: '/history', onClick: handleHistory },
    { id: 'availability', label: 'Available Check', href: '/availability', onClick: handleAvailability },
    { id: 'about', label: 'About', href: '/about', onClick: handleAbout },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-canvas/80 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-baseline gap-2.5">
          <button
            type="button"
            onClick={handleHome}
            className="rounded-full font-brand text-xl font-bold lowercase tracking-tight text-fg transition-opacity hover:opacity-70"
            aria-label="Zur Startseite"
          >
            diggy
          </button>
          {/* Mit Suche im Header ist für den Slogan kein Platz — die Suche ist wichtiger. */}
          {!search && <span className="eyebrow hidden sm:inline">dns made friendly</span>}
        </div>

        {search ? <div className="min-w-0 flex-1 lg:max-w-xl">{search}</div> : <div className="flex-1" />}

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Navigation als echte Links: lassen sich auch in einem neuen Tab öffnen.
              Ab lg sichtbar, darunter steckt sie im Menü. */}
          <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => followInApp(e, item.onClick)}
                aria-current={current === item.id ? 'page' : undefined}
                className={cn(
                  'btn btn-sm btn-ghost',
                  current === item.id && 'bg-surface-muted text-fg'
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
            className="btn btn-ghost btn-icon hidden lg:inline-flex"
          >
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          <a
            href="https://github.com/shadowfps/diggy-easydns"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="diggy auf GitHub"
            className="btn btn-secondary btn-icon hidden sm:inline-flex"
          >
            <svg viewBox="0 0 98 96" className="size-4 fill-current" aria-hidden="true">
              <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
            </svg>
          </a>

          <div ref={wrapperRef} className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
              aria-expanded={open}
              className="btn btn-secondary btn-icon"
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
                    <X className="size-[18px]" />
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
                    <Menu className="size-[18px]" />
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
                  className="overlay absolute right-0 top-full mt-2 w-72 origin-top-right p-2"
                >
                  <MenuItem onClick={handleHistory} label="History" />
                  <MenuItem onClick={handleAvailability} label="Available Check" />
                  <MenuItem onClick={handleAbout} label="About" />

                  <div className="my-2 border-t border-line-subtle" />

                  <div className="px-3 pb-1 pt-2">
                    <p className="eyebrow mb-2">Theme</p>
                    <div className="flex gap-1 rounded-full bg-surface-muted p-1">
                      <ThemeButton
                        active={theme === 'light'}
                        onClick={() => theme !== 'light' && toggle()}
                        label="Light"
                      >
                        <Sun className="size-3.5" />
                      </ThemeButton>
                      <ThemeButton
                        active={theme === 'dark'}
                        onClick={() => theme !== 'dark' && toggle()}
                        label="Dark"
                      >
                        <Moon className="size-3.5" />
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

/**
 * Normaler Klick bleibt in der App (pushState statt Neuladen); Strg-/Cmd-Klick
 * und Mittelklick öffnen wie bei jedem Link einen neuen Tab.
 */
function followInApp(event: ReactMouseEvent<HTMLAnchorElement>, navigate: () => void) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  navigate();
}

function MenuItem({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-panel px-3 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
    >
      {label}
      <ArrowUpRight className="size-3.5 text-fg-subtle transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
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
      type="button"
      onClick={onClick}
      aria-label={`${label} mode`}
      aria-pressed={active}
      className={cn(
        'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors',
        active ? 'bg-accent text-on-accent' : 'text-fg-muted hover:text-fg'
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
