import type { ReactNode } from 'react';
import { Heading, IconInfo, IllustratedMessage, Text } from '@mittwald/flow-react-components';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger';

interface EmptyStateProps {
  /** Ein Flow-Icon (`IconDanger`, …) oder ein in `<Icon>` gehülltes Tabler-Icon. */
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  /** `danger` für Fehler eines Abschnitts. */
  tone?: Tone;
  /** Optional eine Aktion, z. B. „Scan starten“. */
  action?: ReactNode;
  /** Ebene der Überschrift — 3 in einer Section, auf einer eigenen Seite höher. */
  headingLevel?: number;
  className?: string;
}

/**
 * Leer-, Start- und Fehlerzustand eines Abschnitts — Flows IllustratedMessage:
 * Icon, Überschrift, ein Satz, optional eine Aktion.
 *
 * Ohne eigene Karte: im Report steht der Zustand in der LayoutCard der Tabs,
 * auf eigenen Seiten legt der Aufrufer eine LayoutCard drumherum. Flow kennt
 * für die Nachricht nur Danger als Status — Warnung und Erfolg bleiben neutral.
 */
export function EmptyState({
  icon,
  title,
  children,
  tone = 'neutral',
  action,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  return (
    <IllustratedMessage color={tone === 'danger' ? 'danger' : 'default'} className={className}>
      {icon ?? <IconInfo />}
      {title && <Heading level={headingLevel}>{title}</Heading>}
      {children && <Text>{children}</Text>}
      {action}
    </IllustratedMessage>
  );
}
