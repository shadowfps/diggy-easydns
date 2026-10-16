import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger';

const TILE_TONE: Record<Tone, string> = {
  neutral: '',
  success: 'icon-tile-success',
  warning: 'icon-tile-warning',
  danger: 'icon-tile-danger',
};

interface CardHeaderProps {
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * Direkt hinter dem Titel, meist ein `InfoButton`. Eigene Prop statt Teil
   * von `title`, weil der Titel eine Überschrift ist: ein Button darin würde
   * mit seinem Popover-Text Teil ihres Namens.
   */
  info?: ReactNode;
  /** Färbt die Icon-Kachel — nur für eine Bewertung, nicht zur Zierde. */
  tone?: Tone;
  /** Rechts im Kopf, meist ein `badge`. */
  aside?: ReactNode;
  className?: string;
}

/**
 * Kopf jeder Inhaltskarte: Icon-Kachel, Titel, optional Untertitel und rechts
 * ein Status. Eine Komponente statt je Modul eine eigene Variante — vorher
 * sahen die Köpfe in Mail, Security, WHOIS und PageSpeed alle etwas anders aus.
 */
export function CardHeader({ icon, title, subtitle, info, tone = 'neutral', aside, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('icon-tile', TILE_TONE[tone])}>{icon}</span>
        <div className="min-w-0">
          {info ? (
            <div className="flex items-center gap-1">
              <h3 className="card-title">{title}</h3>
              {info}
            </div>
          ) : (
            <h3 className="card-title">{title}</h3>
          )}
          {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
        </div>
      </div>
      {aside && <div className="shrink-0 pt-1.5">{aside}</div>}
    </div>
  );
}
