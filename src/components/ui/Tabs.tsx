import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n';

export type TabId = 'records' | 'propagation' | 'security' | 'mail' | 'findings' | 'whois' | 'speed' | 'virusscan';

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
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  /**
   * Hält den aktiven Tab im sichtbaren Bereich der Scroll-Leiste.
   *
   * Bewusst per scrollLeft und nicht per scrollIntoView: letzteres scrollt
   * auch VERTIKAL. Beim ersten Rendern des Reports liegt die Leiste unterhalb
   * des Viewports — scrollIntoView würde die Seite dann ungefragt nach unten
   * springen lassen.
   */
  useEffect(() => {
    const list = listRef.current;
    const button = activeRef.current;
    if (!list || !button) return;

    // Per getBoundingClientRect, NICHT per offsetLeft: offsetLeft bezieht sich
    // auf den offsetParent, und der Container ist nicht positioniert — der
    // nächste positionierte Vorfahre ist der Root-Wrapper. offsetLeft trug
    // damit konstant das Seiten-Padding mit und die Korrektur landete um
    // dessen Breite daneben.
    const listBox = list.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();

    const overflowLeft = buttonBox.left - listBox.left;
    const overflowRight = buttonBox.right - listBox.right;

    if (overflowLeft < 0) list.scrollLeft += overflowLeft;
    else if (overflowRight > 0) list.scrollLeft += overflowRight;
  }, [active]);

  /**
   * Pfeiltasten-Navigation nach ARIA Authoring Practices: die Leiste ist ein
   * einziger Tab-Stop, innerhalb wird mit den Pfeiltasten gewechselt.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    onChange(tabs[nextIndex].id);
    // Fokus muss der Auswahl folgen, sonst laufen Fokus und aktiver Tab
    // auseinander und die nächste Pfeiltaste springt aus dem Nichts.
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t('Report-Bereiche')}
      onKeyDown={handleKeyDown}
      /*
       * overflow-x-auto ist hier funktional, nicht kosmetisch: acht Tabs
       * brauchen über 800 px, auf einem 375-px-Viewport waren die hinteren
       * (Speed, Virus Scan) sonst nicht erreichbar — und genau die muss man
       * anklicken, weil sie nur auf Anforderung laden.
       */
      className={cn(
        'flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-card',
        'scrollbar-none [&::-webkit-scrollbar]:hidden'
      )}
    >
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            ref={selected ? activeRef : undefined}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            /*
             * aria-controls nur am aktiven Tab: im DOM existiert immer nur
             * dessen Panel (der Panel-Container ist auf activeTab gekeyt).
             * Bei den inaktiven Tabs hätte das Attribut auf eine nicht
             * vorhandene ID gezeigt — Screenreader finden dann kein Ziel.
             */
            aria-controls={selected ? `panel-${tab.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors',
              selected ? 'text-on-accent' : 'text-fg-muted hover:text-fg'
            )}
          >
            {/* Die Pille gleitet zum aktiven Tab — liegt hinter dem Text. */}
            {selected && (
              <motion.span
                layoutId="active-tab"
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums',
                    selected ? 'bg-on-accent/15 text-on-accent' : 'bg-surface-muted text-fg-muted'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
