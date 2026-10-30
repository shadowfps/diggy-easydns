import { useMemo, type ReactNode } from 'react';
import {
  Accordion,
  AlertBadge,
  Badge,
  Content,
  Heading,
  LayoutCard,
  Text,
} from '@mittwald/flow-react-components';
import type { LookupReport } from '@/types/dns';
import type { SectionKey } from '@/hooks/useProgressiveLookup';
import {
  createHistoryEntry,
  type LookupHistoryEntry,
  type TrackedRecordType,
} from '@/lib/lookupHistory';
import { changeTone, diffChecks, type CheckChange } from '@/lib/checkChanges';
import { formatDate, locale, t, tRich, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import styles from './SinceLastCheck.module.css';

interface SinceLastCheckProps {
  /** Der letzte Check dieser Domain, bevor der laufende ihn überschrieben hat. */
  previous: LookupHistoryEntry;
  report: LookupReport;
  failed: readonly SectionKey[];
  /**
   * Erst vergleichen, wenn alle Sektionen fertig sind. Vorher stünden im
   * Report Defaults für noch ladende Checks, und der Vergleich meldete
   * „DMARC entfernt“, nur weil die Antwort noch unterwegs ist.
   */
  settled: boolean;
}

/**
 * „Seit dem letzten Check“: was sich geändert hat, seit die Domain zuletzt
 * geprüft wurde (#79). Alles kommt aus der lokalen History.
 *
 * Eine eigene LayoutCard über den Tabs, eingeklappt, bis man die Liste
 * öffnet — Flows Accordion. So bleibt die Karte vom Laden bis zum Ergebnis
 * gleich hoch, und die Tabs darunter springen nicht, während man schon in
 * den Records liest. Die Zahl der Änderungen steht im Kopf und damit im
 * Namen des Buttons.
 */
export function SinceLastCheck({ previous, report, failed, settled }: SinceLastCheckProps) {
  // Abonniert den Sprachwechsel; die Helfer unten lesen die Sprache selbst.
  useI18n();

  const changes = useMemo(
    () =>
      settled
        ? diffChecks(previous, createHistoryEntry(report, failed, report.timestamp))
        : null,
    [settled, previous, report, failed]
  );

  const checkedAt = formatDateTime(previous.lookedUpAt);
  const status =
    changes === null
      ? t('Wird verglichen, sobald alle Checks fertig sind …')
      : changes.length === 0
        ? t('Keine Änderungen seit {date}', { date: checkedAt })
        : t('{count} Änderungen seit {date}', { count: changes.length, date: checkedAt });

  // Titel und Status in beiden Zuständen gleich gebaut: aufklappbar oder
  // nicht, die Karte hat dieselbe Höhe.
  const head = (
    <>
      {t('Seit dem letzten Check')}{' '}
      <span className={styles.ago}>({formatTimeAgo(previous.lookedUpAt)})</span>
      <span className={styles.status}>{status}</span>
    </>
  );

  return (
    <LayoutCard>
      <section aria-label={t('Seit dem letzten Check')}>
        {changes !== null && changes.length > 0 ? (
          <Accordion>
            {/* Die Überschrift ist der Button des Accordions — die ganze
                Zeile ist Klickfläche, Screenreader hören Kopf und Zustand. */}
            <Heading level={2} size="s">
              {head}
            </Heading>
            <Content>
              <ul className={styles.list}>
                {changes.map((change, index) => (
                  <ChangeRow key={`${change.kind}-${index}`} change={change} />
                ))}
              </ul>
            </Content>
          </Accordion>
        ) : (
          <Heading level={2} size="s">
            {head}
          </Heading>
        )}
      </section>
    </LayoutCard>
  );
}

/**
 * Das Wort je Änderung — der Schlüssel, übersetzt wird in ChangeRow. Es steht
 * in einem Badge: neutral oder mit Flows Status samt Icon, nie nur Farbe
 * (siehe docs/DESIGN.md).
 */
function markerWord(change: CheckChange): DeKey {
  switch (change.kind) {
    case 'score':
      return change.to > change.from ? 'gestiegen' : 'gefallen';
    case 'ssl-renewed':
      return 'erneuert';
    case 'ssl-replaced':
      return 'getauscht';
    case 'ssl-invalid':
      return 'ungültig';
    case 'ssl-valid':
      return 'gültig';
    case 'dnssec':
      return change.enabled ? 'aktiviert' : 'deaktiviert';
    case 'dmarc':
      return change.present ? 'neu' : 'entfallen';
    case 'dmarc-policy':
      return 'geändert';
    case 'records':
      return change.change === 'added' ? 'neu' : 'entfallen';
  }
}

function describe(change: CheckChange): ReactNode {
  switch (change.kind) {
    case 'score':
      return (
        <>
          Health Score{' '}
          <span className={styles.numbers}>
            {change.from} → {change.to}
          </span>
        </>
      );
    case 'ssl-renewed':
      return t('Zertifikat gilt jetzt bis {date}', { date: formatDay(change.validTo) });
    case 'ssl-replaced':
      return t('Zertifikat getauscht, gilt nur noch bis {date}', { date: formatDay(change.validTo) });
    case 'ssl-invalid':
      return t('Zertifikat ungültig oder abgelaufen');
    case 'ssl-valid':
      return t('Zertifikat jetzt gültig bis {date}', { date: formatDay(change.validTo) });
    case 'dnssec':
      return change.enabled ? t('DNSSEC ist jetzt aktiv') : t('DNSSEC ist nicht mehr aktiv');
    case 'dmarc':
      if (!change.present) return t('DMARC-Record entfernt');
      return change.policy
        ? tRich('DMARC-Record gesetzt, Policy {policy}', { policy: <span className="mono">{change.policy}</span> })
        : t('DMARC-Record gesetzt');
    case 'dmarc-policy':
      return tRich('DMARC-Policy {from} → {to}', {
        from: <span className="mono">{change.from}</span>,
        to: <span className="mono">{change.to}</span>,
      });
    case 'records':
      return (
        <span className={styles.records}>
          <span>{t('{type}-Records', { count: change.values.length, type: change.type })}</span>
          {/* wrap-anywhere statt break-all: ein Name rückt als Ganzes in
              die nächste Zeile und wird nur zerteilt, wenn er allein nicht
              passt (lange IPv6-Adressen). */}
          {change.values.map((value) => (
            <span key={value} className={`mono wrap-anywhere ${styles.value}`}>
              {recordLabel(change.type, value)}
            </span>
          ))}
        </span>
      );
  }
}

function ChangeRow({ change }: { change: CheckChange }) {
  const word = t(markerWord(change));
  const tone = changeTone(change);
  return (
    <li className={styles.row}>
      {/* Ab 640 px feste Breite: die Beschreibungen beginnen untereinander,
          egal wie lang das Wort im Badge ist. Mobil steht das Badge darüber —
          neben einer festen Spalte blieben für Namen keine 200 px. */}
      <span className={styles.marker}>
        {tone === 'neutral' ? <Badge color="neutral">{word}</Badge> : <AlertBadge status={tone}>{word}</AlertBadge>}
      </span>
      <Text className={styles.description}>{describe(change)}</Text>
    </li>
  );
}

/**
 * Ein Null-MX (`MX 0 .`, #77) hat ein leeres Ziel; vergleichbar gemacht bleibt
 * von ihm nur die Präferenz „0“. So stünde er unkenntlich in der Liste —
 * deshalb in Zonendatei-Schreibweise und benannt.
 */
function recordLabel(type: TrackedRecordType, value: string): string {
  return type === 'MX' && value === '0' ? '0 . (Null-MX)' : value;
}

/**
 * „vor 5 Minuten“, „gestern“, „vor 3 Tagen“ — für den Kopf der Karte. Die
 * Wörter liefert Intl in der Sprache der Oberfläche (#86).
 */
function formatTimeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return t('Zeitpunkt unbekannt');
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return t('gerade eben');
  const relative = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return relative.format(-days, 'day');
  if (days < 365) return relative.format(-Math.floor(days / 30), 'month');
  return relative.format(-Math.floor(days / 365), 'year');
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return t('dem letzten Check');
  return formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDay(iso: string): string {
  return formatDate(iso, { dateStyle: 'medium' });
}
