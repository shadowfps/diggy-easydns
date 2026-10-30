import { Fragment } from 'react';

/**
 * Hostname (oder Record-Wert) mit Umbruchstellen nach jedem Punkt.
 *
 * In schmalen Spalten (Seitenspalte des Reports, History) brach ein langer
 * Name sonst mitten im Label um („cloudflare.co“ / „m“). `<wbr>` erlaubt den
 * Umbruch nur nach einem Punkt; passt ein einzelnes Label trotzdem nicht,
 * bricht `overflow-wrap` des umgebenden Elements weiter.
 */
export function Hostname({ value }: { value: string }) {
  const labels = value.split('.');
  return (
    <>
      {labels.map((label, i) => (
        <Fragment key={i}>
          {label}
          {i < labels.length - 1 && (
            <>
              .<wbr />
            </>
          )}
        </Fragment>
      ))}
    </>
  );
}
