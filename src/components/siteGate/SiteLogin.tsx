import { useForm } from 'react-hook-form';
import { I18nProvider } from 'react-aria-components';
import { Badge, Heading, Label, LayoutCard, Link, Section, Text, TextField } from '@mittwald/flow-react-components';
import { Field, Form, SubmitButton } from '@mittwald/flow-react-components/react-hook-form';
import { signInToSite } from '@/lib/api';
import { errorText, useI18n } from '@/i18n';
import styles from './SiteLogin.module.css';

interface LoginValues {
  password: string;
}

/** Rechtstexte gelten für die Testumgebung genauso — sie stehen auf der Live-Seite. */
const LIVE_ORIGIN = 'https://diggydns.cloud';

/**
 * Anmeldung für die Testumgebung — Flows Template „Focus Task“: eine Aufgabe,
 * keine Navigation, die Karte in der Mitte.
 *
 * Eigener I18nProvider: Die App mit ihrem Provider läuft hier noch nicht.
 */
export function SiteLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t, language } = useI18n();
  const form = useForm<LoginValues>({ defaultValues: { password: '' } });

  const handleSubmit = async ({ password }: LoginValues) => {
    try {
      await signInToSite(password);
      onSignedIn();
    } catch (error) {
      // Am Feld statt über dem Formular: es gibt nur eins, und dort liegt der Fehler.
      form.setError('password', { message: errorText(error, 'Anmeldung fehlgeschlagen.') });
    }
  };

  return (
    <I18nProvider locale={language === 'en' ? 'en-US' : 'de-DE'}>
      <div className={styles.page}>
        <main className={styles.center}>
          <span className={styles.wordmark} aria-hidden="true">
            diggy
          </span>
          <LayoutCard>
            <Section>
              <Heading level={1}>
                {t('Anmelden')}
                <Badge color="violet">{t('Testversion')}</Badge>
              </Heading>
              <Text elementType="p">
                {t('Diese Version von diggy ist zum Testen da und noch nicht öffentlich. Gib das Passwort ein, das du bekommen hast.')}
              </Text>
              <Form form={form} onSubmit={handleSubmit}>
                <Field name="password" rules={{ required: t('Bitte gib das Passwort ein.') }}>
                  <TextField type="password" autoComplete="current-password" autoFocus>
                    <Label optional={false}>{t('Passwort')}</Label>
                  </TextField>
                </Field>
                <div className={styles.actions}>
                  <SubmitButton color="primary">{t('Anmelden')}</SubmitButton>
                </div>
              </Form>
            </Section>
          </LayoutCard>
          <nav aria-label={t('Rechtliches')} className={styles.footer}>
            <Link href={`${LIVE_ORIGIN}/impressum`} target="_blank" rel="noopener noreferrer" color="dark">
              {t('Impressum')}
            </Link>
            <Link href={`${LIVE_ORIGIN}/datenschutz`} target="_blank" rel="noopener noreferrer" color="dark">
              {t('Datenschutz')}
            </Link>
          </nav>
        </main>
      </div>
    </I18nProvider>
  );
}
