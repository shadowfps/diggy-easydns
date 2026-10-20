import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n';

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
 * Nameserver verweisen mit Buchstabe bzw. Ziffer auf sie.
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
    <section aria-label={t('Antwort {letter}', { letter })}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-fg">{t('Antwort {letter}', { letter })}</span>
        <span className="text-xs text-fg-subtle">{members.join(', ')}</span>
        {badge === 'consensus' && <span className="badge">{t('Mehrheit')}</span>}
        {badge === 'authoritative' && <span className="badge">{t('wie autoritativ')}</span>}
        {badge === 'expected' && <span className="badge">{t('erwartet')}</span>}
        {badge === 'deviating' && (
          <span className="badge badge-warning">
            <AlertTriangle className="size-3" />
            {t('weicht ab')}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-2">
        {values.map((value) => (
          <AnswerValue key={value} value={value} />
        ))}
      </div>
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
    <div className="panel py-3">
      <p className="font-mono text-[13px] text-fg wrap-anywhere">
        {long && !expanded ? (
          <>
            {value.slice(0, HEAD)}
            <span className="text-fg-subtle">…</span>
            {value.slice(-TAIL)}
          </>
        ) : (
          value
        )}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="btn btn-ghost btn-sm mt-2 -ml-3"
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
          />
          {expanded
            ? t('Gekürzt zeigen')
            : t('Ganzen Wert zeigen ({count} Zeichen)', { count: value.length })}
        </button>
      )}
    </div>
  );
}
