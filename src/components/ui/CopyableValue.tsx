import { CopyButton, InlineCode } from '@mittwald/flow-react-components';
import styles from './CopyableValue.module.css';

interface CopyableValueProps {
  value: string;
  /**
   * In einer Zeile mit „…“ statt umbrechen — für Werte, die man nicht liest,
   * sondern kopiert (DKIM-Schlüssel). Der ganze Wert steht im Tooltip und
   * kommt über den Button.
   */
  truncate?: boolean;
  /** Zugänglicher Name des Buttons, sonst Flows „Kopieren“. */
  copyLabel?: string;
}

/**
 * Ein Wert zum Eintragen oder Weitergeben (Record, Snippet) mit Kopieren
 * direkt daneben — Flows InlineCode und CopyButton.
 *
 * Ein eigenes Raster statt Combine: Combine bricht um, sobald der Wert
 * breiter ist als die Zeile, und der Wert selbst wächst dann mit — ein
 * DKIM-Schlüssel schob die Seite so um 2 400 px nach rechts. Hier nimmt der
 * Wert den Platz bis zum Button und bricht darin um oder wird gekürzt.
 */
export function CopyableValue({ value, truncate, copyLabel }: CopyableValueProps) {
  return (
    <div className={styles.row}>
      <InlineCode
        className={truncate ? `${styles.value} ${styles.truncate}` : `${styles.value} ${styles.wrap}`}
        title={truncate ? value : undefined}
      >
        {value}
      </InlineCode>
      {/* Nur mit eigenem Namen überschreiben: `aria-label={undefined}` nähme
          Flow seinen Standardnamen („Kopieren“), und der Button hätte keinen. */}
      <CopyButton
        text={value}
        size="s"
        variant="soft"
        color="secondary"
        {...(copyLabel ? { 'aria-label': copyLabel } : {})}
      />
    </div>
  );
}
