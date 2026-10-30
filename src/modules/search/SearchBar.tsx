import { useEffect, useRef, type FormEvent } from 'react';
import {
  Button,
  IconDanger,
  IconSearch,
  IconSuccess,
  IconWarning,
  Text,
  TextField,
} from '@mittwald/flow-react-components';
import type { LookupHistoryEntry } from '@/lib/lookupHistory';
import { useI18n } from '@/i18n';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  onSearch: (domain: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  autoFocus?: boolean;
  loading?: boolean;
  /**
   * `hero`: Feld auf der Startseite, darunter zuletzt Geprüftes oder
   * Beispiele. `compact`: für die Kopfzeile auf Report-Seiten.
   */
  variant?: 'hero' | 'compact';
  /** Zuletzt geprüfte Domains — ersetzen die Beispiele, sobald es welche gibt. */
  recent?: LookupHistoryEntry[];
}

const EXAMPLES = ['github.com', 'www.mittwald.de', 'www.cloudflare.com'];

// Auf Touch-Geräten würde ein Autofokus die Bildschirmtastatur aufziehen
// und das halbe Viewport verdecken — dort bleibt das Feld unberührt.
function prefersAutoFocus(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/**
 * Die Suche: ein TextField und der Absende-Button daneben — auch auf dem
 * Handy in einer Zeile (Flows Combine bricht dort um, der Button stünde dann
 * unter dem Feld).
 *
 * Bewusst kein SearchField: das ist in Flow für das Filtern von Listen
 * gedacht und setzt Beschriftung und Platzhalter fest auf „Suchen“. Hier wird
 * nichts gefiltert, sondern eine Domain oder IP geprüft — das Feld braucht
 * seinen eigenen Namen.
 */
export function SearchBar({
  onSearch,
  value,
  onValueChange,
  autoFocus = false,
  loading,
  variant = 'hero',
  recent = [],
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!autoFocus || !prefersAutoFocus()) return;
    // preventScroll: der Browser soll beim Fokussieren nicht zum Feld springen.
    inputRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().toLowerCase();
    if (trimmed) onSearch(trimmed);
  };

  const run = (domain: string) => {
    onValueChange(domain);
    onSearch(domain);
  };

  const field = (
    <form onSubmit={handleSubmit} className={styles.form} data-variant={variant}>
      <TextField
        ref={inputRef}
        value={value}
        onChange={onValueChange}
        placeholder={t('Jetzt deine Anfrage starten')}
        aria-label={t('Domain oder IP-Adresse')}
        autoComplete="off"
        spellCheck="false"
        enterKeyHint="search"
        className={`mono ${styles.field}`}
      />
      <Button type="submit" aria-label={t('Suchen')} isPending={loading} isDisabled={!loading && !value.trim()}>
        <IconSearch />
      </Button>
    </form>
  );

  // Im Header nur das Feld: er bleibt beim Wechsel zwischen Reports stehen.
  if (variant === 'compact') return field;

  const shortcuts = recent.slice(0, 4);

  return (
    <div className={styles.hero}>
      {field}

      <div className={styles.shortcuts}>
        {shortcuts.length > 0 ? (
          <>
            <Text>
              <small>{t('Zuletzt geprüft')}</small>
            </Text>
            {shortcuts.map((entry) => (
              <Button
                key={entry.domain}
                size="s"
                variant="soft"
                color="secondary"
                isDisabled={loading}
                onPress={() => run(entry.domain)}
              >
                <ScoreIcon score={entry.score} />
                <Text className="mono">
                  {entry.domain} {entry.score}
                </Text>
              </Button>
            ))}
          </>
        ) : (
          <>
            <Text>
              <small>{t('Beispiele')}</small>
            </Text>
            {EXAMPLES.map((ex) => (
              <Button
                key={ex}
                size="s"
                variant="soft"
                color="secondary"
                isDisabled={loading}
                onPress={() => run(ex)}
              >
                <Text className="mono">{ex}</Text>
              </Button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Dieselben Stufen wie die Score-Karte — Form und Farbe, nie nur Farbe. */
function ScoreIcon({ score }: { score: number }) {
  if (score >= 65) return <IconSuccess color="success" />;
  if (score >= 40) return <IconWarning color="warning" />;
  return <IconDanger color="danger" />;
}
