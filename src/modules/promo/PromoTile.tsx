import type { ReactNode } from 'react';
import { AccentBox, Button, Heading, Link, Text } from '@mittwald/flow-react-components';
import styles from './PromoTile.module.css';

interface PromoTileProps {
  /** `copper`: warmer Kupferverlauf. `orb`: dunkel, mit Farbkugel oben rechts. */
  tone: 'copper' | 'orb';
  /** Für `aria-labelledby` — die Überschrift benennt die Kachel. */
  id: string;
  eyebrow: ReactNode;
  title: ReactNode;
  icon: ReactNode;
  href: string;
  cta: string;
}

/**
 * Eine Promo-Kachel im Stil der mittwald-Kacheln: Grainy Gradient, kleine
 * Überzeile neben dem Icon, große Aussage über die volle Breite, eine
 * umrandete Pillen-Schaltfläche unten rechts.
 *
 * Flows AccentBox trägt die Textfarbe (`light-static`: hell auf jeder Fläche,
 * in beiden Themes), die Fläche selbst kommt aus PromoTile.module.css. Die
 * Schaltfläche ist Flows Call-to-Action-Muster: ein Button im Link — Flow
 * rendert den Button dort als `span`, es bleibt ein einziger Link. Er deckt
 * die ganze Kachel ab (`.link::after`); fokussiert wird weiterhin die Pille.
 */
export function PromoTile({ tone, id, eyebrow, title, icon, href, cta }: PromoTileProps) {
  return (
    <aside aria-labelledby={id} className={styles.slot}>
      <AccentBox color="light-static" className={`${styles.tile} ${styles[tone]}`}>
        <Text className={styles.eyebrow}>{eyebrow}</Text>
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <Heading level={2} id={id} className={styles.title}>
          {title}
        </Heading>
        <div className={styles.action}>
          <Link href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
            <Button variant="outline" className={styles.cta}>
              {cta}
            </Button>
          </Link>
        </div>
      </AccentBox>
    </aside>
  );
}
