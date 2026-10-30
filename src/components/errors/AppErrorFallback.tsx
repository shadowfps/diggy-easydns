import {
  ActionGroup,
  Button,
  Heading,
  IconDanger,
  IllustratedMessage,
  LayoutCard,
  Link,
  Text,
} from '@mittwald/flow-react-components';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n';
import styles from './AppErrorFallback.module.css';

/**
 * Ganzseitiger Fallback — die App als Ganzes ist nicht mehr benutzbar.
 *
 * Aufgebaut wie `EmptyState` mit `tone="danger"`, aber von Hand: der Titel
 * muss hier die `h1` der Seite bleiben, und die Fehlermeldung steht unter den
 * Aktionen.
 */
export function AppErrorFallback({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <LayoutCard className={styles.card}>
        <IllustratedMessage color="danger">
          <IconDanger />
          <Heading level={1}>{t('Da ist etwas schiefgelaufen')}</Heading>
          <Text>{t('Die Ansicht konnte nicht dargestellt werden. Ein Neuladen hilft meistens.')}</Text>
          <ActionGroup>
            {/*
              Die App ist URL-basiert: ein kaputter Permalink würde beim Neuladen
              wieder in denselben Fehler laufen. Deshalb zusätzlich ein Weg zurück
              auf die Startseite. Ein echter Link — ohne Router: der steht hier
              selbst nicht mehr.
            */}
            <Link href="/">{t('Zur Startseite')}</Link>
            <Button onPress={() => window.location.reload()}>{t('Neu laden')}</Button>
          </ActionGroup>
          <Text className={styles.message}>
            <small className="mono">{error.message}</small>
          </Text>
        </IllustratedMessage>
      </LayoutCard>
    </div>
  );
}

/**
 * Fallback für eine nachgeladene Unterseite (Impressum, Datenschutz). Scheitert
 * dort etwas, ist es fast immer der Chunk — einer von vor dem letzten Deploy
 * oder eine abgebrochene Verbindung. Neu laden holt den aktuellen.
 */
export function PageErrorFallback() {
  const { t } = useI18n();
  return (
    <LayoutCard>
      <EmptyState
        tone="danger"
        icon={<IconDanger />}
        title={t('Diese Seite konnte nicht geladen werden')}
        headingLevel={1}
        action={
          <Button variant="soft" color="secondary" onPress={() => window.location.reload()}>
            {t('Neu laden')}
          </Button>
        }
      >
        {t('Meist hilft ein Neuladen, etwa nach einem Update von diggy.')}
      </EmptyState>
    </LayoutCard>
  );
}

/**
 * Fallback für einen einzelnen Report-Tab.
 *
 * Passt zur progressiven Ladearchitektur: im Netzwerk-Pfad darf eine Sektion
 * ausfallen, ohne den Report zu killen (sectionError im Hook). Im Render-Pfad
 * galt das bisher nicht — ein defekter Sektions-Renderer riss die ganze App mit.
 *
 * Sekundärbutton: im Report ist der Primärbutton schon die Suche.
 */
export function SectionErrorFallback({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      tone="danger"
      icon={<IconDanger />}
      title={t('Dieser Bereich konnte nicht dargestellt werden')}
      action={
        <Button variant="soft" color="secondary" onPress={reset}>
          {t('Erneut versuchen')}
        </Button>
      }
    >
      {t('Die übrigen Bereiche des Reports funktionieren weiter.')}
    </EmptyState>
  );
}
