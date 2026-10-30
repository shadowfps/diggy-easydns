import { Link } from '@mittwald/flow-react-components';
import { lookupPathFor, normalizeSearchDomain } from '@/lib/lookupPath';
import { Hostname } from './Hostname';
import styles from './LookupLink.module.css';

/**
 * Ein Hostname oder eine IP als Link auf den eigenen Report (#147): Ein Klick
 * prüft den Wert sofort und legt einen Eintrag im Verlauf an — Zurück führt
 * zum Report davor. Ein echter Link statt eines Buttons, der den Wert nur ins
 * Suchfeld schrieb: Strg/Cmd- oder Mittelklick öffnet den Report in einem
 * neuen Tab. Die Navigation selbst übernimmt der RouterProvider in App.tsx.
 *
 * Der Name des Links ist der Wert selbst; was ein Klick tut, sagt der
 * Kontext (Nameserver, Mailserver, PTR). Überall gleich aussehend: Flow macht
 * Links in `Text` und `LabeledValue` sonst zu unterstrichenen Fließtext-Links,
 * in der Records-Tabelle stünden sie anders da als in der Schnellübersicht.
 */
export function LookupLink({ value }: { value: string }) {
  const target = normalizeSearchDomain(value);
  // Kein Suchziel (etwa der leere Wert eines Null-MX): nur der Text.
  if (!target) return <Hostname value={value} />;
  return (
    <Link href={lookupPathFor(target)} inline={false} className={styles.link}>
      <Hostname value={value} />
    </Link>
  );
}
