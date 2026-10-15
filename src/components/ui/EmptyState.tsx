import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Tone } from './CardHeader';

const TILE_TONE: Record<Tone, string> = {
  neutral: '',
  success: 'icon-tile-success',
  warning: 'icon-tile-warning',
  danger: 'icon-tile-danger',
};

interface EmptyStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  /** `danger` für Fehler eines Abschnitts. */
  tone?: Tone;
  /** Optional eine Aktion, z. B. „Scan starten“. */
  action?: ReactNode;
  className?: string;
}

/**
 * Leer-, Start- und Fehlerzustand eines Abschnitts: Icon-Kachel, Titel, ein
 * Satz, optional eine Aktion — zentriert in einer Karte (docs/DESIGN.md).
 */
export function EmptyState({ icon, title, children, tone = 'neutral', action, className }: EmptyStateProps) {
  return (
    <div className={cn('card flex flex-col items-center py-10 text-center sm:py-12', className)}>
      {icon && <span className={cn('icon-tile size-11', TILE_TONE[tone])}>{icon}</span>}
      {title && <h3 className={cn('text-base font-semibold text-fg', icon && 'mt-4')}>{title}</h3>}
      {children && (
        <div className={cn('mx-auto max-w-md text-sm text-fg-muted', title ? 'mt-1' : icon && 'mt-3')}>
          {children}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
