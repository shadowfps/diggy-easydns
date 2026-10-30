import { type ReactNode } from 'react';
import {
  Badge,
  Button,
  Content,
  ContextMenu,
  ContextMenuSection,
  ContextMenuTrigger,
  HeaderNavigation,
  Heading,
  Icon,
  IconMenu,
  IconSettings,
  Link,
  MenuItem,
  Modal,
  Navigation,
  Separator,
  Text,
  useModalController,
} from '@mittwald/flow-react-components';
import { IconBrandGithub, IconMoon, IconSun } from '@tabler/icons-react';
import { useTheme } from '@/hooks/useTheme';
import { setLanguage, useI18n } from '@/i18n';
import type { AppView } from '@/lib/lookupPath';
import { isSiteGated } from '@/lib/siteGate';
import styles from './Header.module.css';

const GITHUB_URL = 'https://github.com/shadowfps/diggy-easydns';

interface HeaderProps {
  /** Die aktuelle Ansicht — ihr Navigationspunkt trägt `aria-current`. */
  view?: AppView | 'compare';
  /** Kompakte Suche — auf Report-Seiten steht sie hier statt über dem Report. */
  search?: ReactNode;
}

/**
 * Kopfzeile nach dem Flow-Template „Simple App“: Wortmarke links, rechts die
 * flache Navigation über die gleichrangigen Bereiche. Auf schmalen Screens
 * wandert sie hinter einen Burger in ein OffCanvas. Theme und Sprache stehen
 * auf jeder Breite im Einstellungsmenü daneben.
 *
 * Die Navigationspunkte sind echte Links: der RouterProvider in App.tsx
 * leitet sie auf die eigene Navigation um, Mittelklick und „In neuem Tab
 * öffnen“ funktionieren trotzdem.
 */
export function Header({ view, search }: HeaderProps) {
  const { t } = useI18n();
  const menu = useModalController();

  return (
    <header className={styles.header} data-search={search ? '' : undefined}>
      <div className={styles.bar}>
        <div className={styles.brand}>
          <Link href="/" aria-label={t('Zur Startseite')} className={styles.wordmark}>
            diggy
          </Link>
          {/* Auf der Testumgebung unübersehbar — damit niemand sie für die Live-Seite hält. */}
          {isSiteGated() && (
            <span className={styles.preview}>
              <Badge color="violet">{t('Testversion')}</Badge>
            </span>
          )}
          {/* Mit Suche im Header ist für den Slogan kein Platz — die Suche ist wichtiger. */}
          {!search && (
            <Text className={styles.tagline}>
              <small>dns made friendly</small>
            </Text>
          )}
        </div>

        {search && <div className={styles.search}>{search}</div>}

        <div className={styles.actions}>
          <HeaderNavigation aria-label={t('Hauptnavigation')} className={styles.nav}>
            <NavigationLinks view={view} />
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
              {/* Flow setzt Icons in Links klein — hier steht es allein, so groß wie das Einstellungs-Icon daneben. */}
              <Icon size="m">
                <IconBrandGithub />
              </Icon>
            </Link>
          </HeaderNavigation>

          <SettingsMenu />

          <Button
            className={styles.burger}
            variant="plain"
            color="secondary"
            aria-label={t('Menü öffnen')}
            onPress={() => menu.open()}
          >
            <IconMenu />
          </Button>
        </div>
      </div>

      <Modal offCanvas controller={menu} aria-label={t('Menü')}>
        <Heading>{t('Menü')}</Heading>
        <Content>
          <Navigation aria-label={t('Hauptnavigation')}>
            <NavigationLinks view={view} onNavigate={() => menu.close()} />
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Icon>
                <IconBrandGithub />
              </Icon>
              <Text>GitHub</Text>
            </Link>
          </Navigation>
        </Content>
      </Modal>
    </header>
  );
}

/**
 * Die Bereiche, geteilt von Kopfzeile und OffCanvas — wie im Template rendert
 * jede Umgebung dieselben Links in ihrer eigenen Form.
 */
function NavigationLinks({ view, onNavigate }: { view?: HeaderProps['view']; onNavigate?: () => void }) {
  const { t } = useI18n();
  const current = (target: HeaderProps['view']) => (view === target ? 'page' : undefined);
  return (
    <>
      <Link href="/history" aria-current={current('history')} onPress={onNavigate}>
        History
      </Link>
      <Link href="/compare" aria-current={current('compare')} onPress={onNavigate}>
        {t('Vergleichen')}
      </Link>
      <Link href="/availability" aria-current={current('availability')} onPress={onNavigate}>
        {t('Available Check')}
      </Link>
      <Link href="/about" aria-current={current('about')} onPress={onNavigate}>
        About
      </Link>
    </>
  );
}

/**
 * Theme und Sprache in einem Menü, je eine Einfachauswahl.
 *
 * Die Sprachen heißen in jeder Sprache gleich — wer Deutsch nicht lesen kann,
 * findet „English“ trotzdem. `lang` sagt Screenreadern, wie sie das Wort
 * aussprechen; die Überschrift der Gruppe benennt sie, sonst hörte man nur
 * „Deutsch, ausgewählt“.
 *
 * Gespeichert wird erst die Wahl (#125): `setTheme` legt `diggy-theme` ab,
 * das bloße Öffnen des Menüs nicht.
 */
function SettingsMenu() {
  const { t, language } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <ContextMenuTrigger>
      <Button variant="plain" color="secondary" aria-label={t('Einstellungen')}>
        <IconSettings />
      </Button>
      <ContextMenu placement="bottom end" width={240}>
        <ContextMenuSection selectionMode="single" selectedKeys={[theme]}>
          <Heading>Theme</Heading>
          <MenuItem id="light" textValue="Light" onAction={() => setTheme('light')}>
            <Icon>
              <IconSun />
            </Icon>
            <Text>Light</Text>
          </MenuItem>
          <MenuItem id="dark" textValue="Dark" onAction={() => setTheme('dark')}>
            <Icon>
              <IconMoon />
            </Icon>
            <Text>Dark</Text>
          </MenuItem>
        </ContextMenuSection>
        <Separator />
        <ContextMenuSection selectionMode="single" selectedKeys={[language]}>
          <Heading>{t('Sprache')}</Heading>
          <MenuItem id="de" textValue="Deutsch" onAction={() => void setLanguage('de')}>
            <Text lang="de">Deutsch</Text>
          </MenuItem>
          <MenuItem id="en" textValue="English" onAction={() => void setLanguage('en')}>
            <Text lang="en">English</Text>
          </MenuItem>
        </ContextMenuSection>
      </ContextMenu>
    </ContextMenuTrigger>
  );
}
