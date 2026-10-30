import type { ReactNode } from 'react';
import { Heading, Text } from '@mittwald/flow-react-components';
import styles from './SectionIntro.module.css';

/**
 * Kopf eines Abschnitts der Startseite auf dem Seitenhintergrund: Überzeile,
 * Überschrift (h2, eine Stufe unter der Frage im Hero) und eine Einleitung.
 * Die `id` benennt den Abschnitt (`aria-labelledby`).
 */
export function SectionIntro({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <header className={styles.intro}>
      <Text className="eyebrow">{eyebrow}</Text>
      <Heading level={2} id={id} className={styles.heading}>
        {title}
      </Heading>
      {lead && (
        <Text elementType="p" className={styles.lead}>
          {lead}
        </Text>
      )}
    </header>
  );
}
