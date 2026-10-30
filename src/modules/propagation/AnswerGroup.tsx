import { useState } from 'react';
import {
  AlertBadge,
  Badge,
  Button,
  Heading,
  IconChevronDown,
  IconChevronUp,
  InlineCode,
  Text,
} from '@mittwald/flow-react-components';
import { useI18n } from '@/i18n';
import styles from './Propagation.module.css';

/**
 * Ab dieser Länge wird ein Wert gekürzt. Ein DKIM-Schlüssel (RSA 2048)
 * hat rund 410 Zeichen — fünf davon untereinander wären eine Textwand, in der
 * niemand mehr sieht, ob sie gleich sind.
 */
const LONG_VALUE = 120;
/**
 * Anfang und Ende der Kurzform. Bei DKIM-Schlüsseln ist der Anfang für alle
 * RSA-2048-Schlüssel gleich (`v=DKIM1; k=rsa; p=MIIBIjANBgkq…`); unterscheiden
 * lassen sie sich am Ende — daher bleibt auch das stehen.
 */
const HEAD = 64;
const TAIL = 24;

/**
 * Wie eine Antwort zur Vergleichsbasis steht (#133):
 * - `consensus`: die Mehrheit der Resolver
 * - `authoritative`: dieselbe wie bei den autoritativen Nameservern
 * - `expected`: enthält den erwarteten Wert
 * - `deviating`: weicht ab
 */
export type AnswerGroupBadge = 'consensus' | 'authoritative' | 'expected' | 'deviating';

/**
 * Eine der verschiedenen Antworten unter einer Liste — Resolver oder
 * Nameserver verweisen mit Buchstabe bzw. Ziffer auf sie. Eine Region mit
 * eigener Unterüberschrift: wer „Antwort B“ in der Zeile liest, springt
 * direkt hierher.
 */
export function AnswerGroup({
  letter,
  values,
  members,
  badge,
}: {
  letter: string;
  values: string[];
  /** Wer diese Antwort liefert. */
  members: string[];
  badge: AnswerGroupBadge | undefined;
}) {
  const { t } = useI18n();
  return (
    <section aria-label={t('Antwort {letter}', { letter })} className={styles.group}>
      <Heading level={3}>
        {t('Antwort {letter}', { letter })}
        {badge === 'consensus' && <Badge color="neutral">{t('Mehrheit')}</Badge>}
        {badge === 'authoritative' && <Badge color="neutral">{t('wie autoritativ')}</Badge>}
        {badge === 'expected' && <Badge color="neutral">{t('erwartet')}</Badge>}
        {/* Abweichung mit Wort und Icon — nie nur über die Farbe. */}
        {badge === 'deviating' && <AlertBadge status="warning">{t('weicht ab')}</AlertBadge>}
      </Heading>
      <Text>
        <small>{members.join(', ')}</small>
      </Text>
      {values.map((value) => (
        <AnswerValue key={value} value={value} />
      ))}
    </section>
  );
}

/**
 * Ein Wert einer Antwort, lange Werte gekürzt auf Anfang…Ende.
 *
 * Ganz ausklappbar statt nur per Tooltip: Wer nach einem DKIM-Wechsel prüft,
 * vergleicht den Schlüssel mit dem aus dem Anbieter-Panel — auch auf dem
 * Handy und per Tastatur.
 */
function AnswerValue({ value }: { value: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long = value.length > LONG_VALUE;

  return (
    <div className={styles.value}>
      <InlineCode whiteSpace="pre-wrap" className="wrap-anywhere">
        {long && !expanded ? (
          <>
            {value.slice(0, HEAD)}
            …
            {value.slice(-TAIL)}
          </>
        ) : (
          value
        )}
      </InlineCode>
      {long && (
        <div>
          <Button
            size="s"
            variant="plain"
            color="secondary"
            aria-expanded={expanded}
            onPress={() => setExpanded((e) => !e)}
          >
            {expanded ? <IconChevronUp /> : <IconChevronDown />}
            <Text>
              {expanded
                ? t('Gekürzt zeigen')
                : t('Ganzen Wert zeigen ({count} Zeichen)', { count: value.length })}
            </Text>
          </Button>
        </div>
      )}
    </div>
  );
}
