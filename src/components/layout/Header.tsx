import { Moon, Sun } from 'lucide-react';
import { DiggyLogo } from '@/components/ui/DiggyLogo';
import { useTheme } from '@/hooks/useTheme';

export function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header className="border-b border-ink-100 dark:border-ink-900 bg-ink-50/80 dark:bg-ink-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <DiggyLogo className="w-8 h-8" />
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-medium tracking-tight">Diggy</span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-ink-900/40 dark:text-ink-50/40 font-medium">
              dns made friendly
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          <NavLink>History</NavLink>
          <NavLink>API</NavLink>
          <NavLink>About</NavLink>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="ml-2 p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-900 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="#"
      className="px-3 py-1.5 text-sm text-ink-900/70 dark:text-ink-50/70 hover:text-ink-900 dark:hover:text-ink-50 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-900 transition-colors"
    >
      {children}
    </a>
  );
}
