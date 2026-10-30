import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ActionGroup,
  AlertText,
  ColumnLayout,
  FieldDescription,
  Flex,
  Heading,
  IconSend,
  Label,
  Link,
  Section,
  Text,
  TextArea,
  TextField,
} from '@mittwald/flow-react-components';
import {
  Field,
  Form,
  FormRootError,
  SubmitButton,
} from '@mittwald/flow-react-components/react-hook-form';
import { useForm, useWatch } from 'react-hook-form';
import { ApiError, fetchContactChallenge, sendContactMessage } from '@/lib/api';
import { errorText, useI18n } from '@/i18n';
import type { DeKey, Params } from '@/i18n';
import styles from './ContactForm.module.css';

/**
 * Fehler, bei denen der Challenge-Token NICHT verbraucht ist.
 *
 * Der Server prüft in dieser Reihenfolge: Honeypot, Feldvalidierung, dann
 * Token-Entwertung (`server/index.ts`). Ein Validierungsfehler lässt den Token
 * also gültig — vorher lud das Formular trotzdem einen neuen nach. Das kostete
 * einen Challenge-Slot, startete die 4-Sekunden-Wartezeit neu und konnte das
 * Formular ganz blockieren: läuft `/api/contact/challenge` ins Rate-Limit,
 * stand "Bitte lade die Seite neu" da, obwohl der ursprüngliche Token noch
 * benutzbar war. Genau die Falle, die serverseitig schon einmal behoben wurde.
 *
 * `contact_not_configured` steht mit dabei, weil der Request dann gar nicht
 * bis zur Validierung kommt.
 */
const TOKEN_SURVIVING_ERRORS = new Set(['contact_invalid_input', 'contact_not_configured']);

/**
 * Was gerade schiefging: ein Fehler des Servers oder ein eigener Text mit
 * Werten. Beides wird erst beim Rendern übersetzt, damit die Meldung einem
 * Sprachwechsel folgt (#86).
 */
type FormError = { error: unknown } | { text: DeKey; params?: Params };

interface ContactValues {
  name: string;
  email: string;
  message: string;
  /** Honeypot — bleibt bei Menschen leer. */
  website: string;
}

const EMPTY_VALUES: ContactValues = { name: '', email: '', message: '', website: '' };

/**
 * Kontaktformular nach Flows Baustein „Formular“: Form und Field aus der
 * react-hook-form-Integration, Felder mit Label, Absenden über den
 * SubmitButton. Pflichtfelder prüft react-hook-form, die Meldungen stehen
 * am Feld.
 *
 * Fehler auf Formularebene (Server, Wartezeit, Token) setzen einen Root-Error:
 * so weiß der SubmitButton, dass der Versand gescheitert ist, und zeigt kein
 * Erfolgs-Häkchen. Den Text dazu hält eigener State, damit er beim Rendern
 * übersetzt wird.
 */
export function ContactForm() {
  const form = useForm<ContactValues>({ defaultValues: EMPTY_VALUES });
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const [success, setSuccess] = useState(false);
  const { t, tRich } = useI18n();
  const honeypotId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  /** Läuft gerade ein Versand? Sperrt einen zweiten, etwa per Enter. */
  const sendingRef = useRef(false);
  /**
   * Tickt sekündlich, solange die Mindestwartezeit läuft.
   *
   * Der Server verlangt 4 s zwischen Token-Ausgabe und Absenden (Bot-Signal,
   * keine Wartezeit für Menschen). Vorher war der Button in dieser Zeit
   * klickbar und quittierte mit "Bitte nimm dir einen kurzen Moment" — ohne zu
   * sagen, wie lange noch. Jetzt ist er sichtbar deaktiviert und zählt runter.
   */
  const [now, setNow] = useState(() => Date.now());

  const message = useWatch({ control: form.control, name: 'message' }) ?? '';

  /** Meldung setzen und den Versand als gescheitert markieren (siehe oben). */
  const fail = useCallback(
    (next: FormError) => {
      setError(next);
      form.setError('root', { type: 'contact' });
    },
    [form]
  );

  /**
   * Holt einen frischen Challenge-Token.
   *
   * Wird nicht nur beim Mount gebraucht, sondern auch nach jedem
   * Absende-Versuch: der Server entwertet den Token einmalig. Ohne Nachladen
   * würde ein zweiter Versuch mit demselben Token als Replay gewertet.
   */
  const loadChallenge = useCallback(async () => {
    const challenge = await fetchContactChallenge();
    const issuedAt = Date.now();
    setChallengeToken(challenge.token);
    setReadyAt(issuedAt + challenge.minDelayMs);
    // `now` mitziehen, sonst rechnet der Countdown gegen einen veralteten
    // Zeitstempel: nach einem Nachladen stand am Button für bis zu einen
    // Intervall-Tick "Gleich bereit (1 s)", obwohl gar keine Wartezeit mehr
    // besteht.
    setNow(issuedAt);
  }, []);

  const waitSeconds = readyAt ? Math.max(0, Math.ceil((readyAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!readyAt) return;
    // Nur von readyAt abhängig: mit `now` in den Dependencies würde der
    // Intervall bei jedem Tick neu aufgesetzt. Der Timer stoppt sich selbst,
    // sobald die Wartezeit vorbei ist.
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= readyAt) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [readyAt]);

  // Nach dem Absenden Fokus auf die Statusmeldung: sonst bleibt er auf dem
  // Submit-Button und die Meldung erscheint stumm daneben.
  useEffect(() => {
    if (success || error) statusRef.current?.focus();
  }, [success, error]);

  useEffect(() => {
    let cancelled = false;

    /*
     * Die Async-Grenze steht hier ausdrücklich da — bitte nicht zurück auf
     * `loadChallenge().catch(...)` vereinfachen.
     *
     * Verhalten ist identisch; der Unterschied ist die statische Analyse.
     * react-hooks/set-state-in-effect beanstandete den direkten Aufruf im
     * Effect-Körper, obwohl jedes setState in `loadChallenge` hinter dem
     * `await` liegt und damit gar nicht synchron läuft. Die Regel sieht das
     * dem Aufruf nicht an, dem `await` in einer eigenen Funktion schon.
     */
    void (async () => {
      try {
        await loadChallenge();
      } catch {
        if (!cancelled) {
          fail({
            text: 'Kontaktformular konnte nicht initialisiert werden. Bitte Seite neu laden.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadChallenge, fail]);

  const handleSubmit = async (values: ContactValues) => {
    if (sendingRef.current || !challengeToken) return;

    // Vorherige Rückmeldung räumen, BEVOR ein Zweig eine neue setzt: sonst
    // stünde hinter einem alten "Danke, gesendet" eine neue Fehlermeldung.
    setError(null);
    setSuccess(false);

    if (readyAt && Date.now() < readyAt) {
      // Sollte durch den deaktivierten Button nicht mehr auftreten — bleibt
      // als Absicherung für Enter im Textfeld oder Strg+Enter.
      const remaining = Math.ceil((readyAt - Date.now()) / 1000);
      fail({ text: 'Das Formular ist in {count} Sekunden bereit.', params: { count: remaining } });
      return;
    }

    sendingRef.current = true;
    let sent = false;
    let tokenStillValid = false;
    try {
      await sendContactMessage({ ...values, token: challengeToken });
      sent = true;
      setSuccess(true);
    } catch (err) {
      fail({ error: err });
      tokenStillValid = err instanceof ApiError && TOKEN_SURVIVING_ERRORS.has(err.code);
    }

    if (tokenStillValid) {
      // Nichts nachladen: der Token ist unverbraucht, die Wartezeit ist
      // abgelaufen, und der Nutzer soll nach dem Korrigieren des Feldes direkt
      // erneut senden können.
      sendingRef.current = false;
      return;
    }

    // Token-Nachladen bewusst AUSSERHALB des Sende-try:
    //
    // Der Server entwertet den Token einmalig, ein Retry braucht also einen
    // frischen. Lag der Refetch im try, drehte ein fehlgeschlagenes Nachladen
    // nach erfolgreichem Versand die Meldung in einen Fehler — bei weiterhin
    // gesetztem success. Dann standen "Danke, gesendet" und eine
    // Fehlermeldung gleichzeitig da. Passiert real, wenn
    // /api/contact/challenge ins Rate-Limit läuft.
    setChallengeToken(null);
    try {
      await loadChallenge();
    } catch {
      // Nach erfolgreichem Versand ist das kein Fehler für den Nutzer — die
      // Nachricht ist raus. Nur wenn er erneut senden will, fehlt der Token,
      // und dann sagt es der deaktivierte Button.
      if (!sent) fail({ text: 'Bitte lade die Seite neu und versuche es erneut.' });
    } finally {
      sendingRef.current = false;
    }

    // Felder leeren, wie Flow es empfiehlt: als Rückgabe, nach dem
    // Erfolgs-Feedback des SubmitButtons.
    if (sent) return () => form.reset(EMPTY_VALUES);
  };

  const errorMessage = !error
    ? null
    : 'error' in error
      ? errorText(error.error, 'Nachricht konnte nicht gesendet werden.')
      : t(error.text, error.params);
  const formReady = Boolean(challengeToken);
  const trimmedLength = message.trim().length;
  const tooShort = trimmedLength > 0 && trimmedLength < MIN_MESSAGE_LENGTH;

  return (
    <Section>
      <Heading level={2}>{t('Kontaktformular')}</Heading>
      <Text elementType="p">
        {t('Schreib mir alternativ direkt über das Formular — ich melde mich per E-Mail zurück.')}
      </Text>
      <Text elementType="p">
        <small>
          {tRich(
            'Name, E-Mail und Nachricht werden per E-Mail an mich zugestellt und nur zur Beantwortung genutzt. An deine Adresse geht eine Empfangsbestätigung. Details unter {link}.',
            // Ein Link über das Client-Routing (RouterProvider in App): ein
            // voller Seitenwechsel würde die getippte Nachricht verwerfen.
            { link: <Link href="/datenschutz">{t('Datenschutz')}</Link> }
          )}
        </small>
      </Text>

      <Form form={form} onSubmit={handleSubmit} className={styles.form}>
        <Flex direction="column" gap="m">
          <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]}>
            <Field<ContactValues> name="name" rules={{ required: true }}>
              <TextField autoComplete="name" maxLength={120}>
                <Label>Name</Label>
              </TextField>
            </Field>
            <Field<ContactValues> name="email" rules={{ required: true }}>
              <TextField type="email" autoComplete="email" maxLength={254}>
                <Label>{t('E-Mail')}</Label>
              </TextField>
            </Field>
          </ColumnLayout>

          {/*
            Die Server-Grenze gilt getrimmt, das native `minLength` zählt roh:
            neun Zeichen plus ein Leerzeichen kamen durch die Browser-Prüfung und
            wurden erst serverseitig abgelehnt. Die Regel hier zählt wie der
            Server, ohne Round-Trip. Den Zähler bringt Flow mit — ohne ihn hörte
            das Tippen bei 5000 Zeichen einfach auf, ohne Hinweis warum.
          */}
          <Field<ContactValues>
            name="message"
            rules={{
              required: true,
              validate: (value) =>
                value.trim().length >= MIN_MESSAGE_LENGTH ||
                t('Die Nachricht sollte mindestens {count} Zeichen lang sein.', {
                  count: MIN_MESSAGE_LENGTH,
                }),
            }}
          >
            <TextArea
              rows={6}
              maxLength={MAX_MESSAGE_LENGTH}
              showCharacterCount
              allowVerticalResize
              placeholder={t('Worum geht es?')}
            >
              <Label>{t('Nachricht')}</Label>
              {/* Erst ab dem ersten Zeichen, damit es nicht vorab mahnt. */}
              {tooShort && (
                <FieldDescription>
                  {t('Noch mindestens {count} Zeichen', { count: MIN_MESSAGE_LENGTH - trimmedLength })}
                </FieldDescription>
              )}
            </TextArea>
          </Field>

          {/* Honeypot — für Menschen unsichtbar, nicht per display:none (Bot-Trap). */}
          <div className={styles.honeypot} aria-hidden="true">
            <label htmlFor={honeypotId}>Website</label>
            <input
              id={honeypotId}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              {...form.register('website')}
            />
          </div>
          {/*
            Das zweite Honeypot-Feld hieß "company" mit Label "Firma". Chrome
            ignoriert autocomplete="off" in Adressformularen weitgehend und
            mappt company auf "Organisation" — ein echter Nutzer mit Autofill
            wäre also in die Bot-Falle gelaufen und hätte "Deine Nachricht wurde
            gesendet" gesehen, während die Nachricht verworfen wird.

            Client-seitig ist das Feld daher weg. Die Server-Prüfung auf
            `company` bleibt (siehe isHoneypotTriggered): Bots, die direkt auf
            den Endpoint posten und alle Felder ausfüllen, laufen weiter hinein —
            nur eben kein Mensch mehr.
          */}

          {/*
            Rückmeldung als AlertText direkt am Button, wo die Aktion ausgelöst
            wurde. role/tabIndex sind nicht Kosmetik: ohne sie bekäme ein
            Screenreader-Nutzer nach dem Absenden gar keine Rückmeldung.
          */}
          {success && (
            <div ref={statusRef} role="status" tabIndex={-1} className={styles.status}>
              <AlertText status="success">{t('Danke! Deine Nachricht wurde gesendet.')}</AlertText>
            </div>
          )}
          <FormRootError>
            {() =>
              errorMessage && !success ? (
                <div ref={statusRef} role="alert" tabIndex={-1} className={styles.status}>
                  <AlertText status="danger">{errorMessage}</AlertText>
                </div>
              ) : null
            }
          </FormRootError>

          <ActionGroup>
            <SubmitButton isDisabled={!formReady || waitSeconds > 0}>
              <IconSend />
              <Text>
                {!formReady
                  ? t('Formular wird geladen…')
                  : waitSeconds > 0
                    ? t('Gleich bereit ({count} s)', { count: waitSeconds })
                    : t('Nachricht senden')}
              </Text>
            </SubmitButton>
          </ActionGroup>
        </Flex>
      </Form>
    </Section>
  );
}

/** Spiegelt die Server-Grenzen aus contactMail.ts. */
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;
