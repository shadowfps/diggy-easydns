import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { fetchContactChallenge, sendContactMessage } from '@/lib/api';

interface ContactFormProps {
  /**
   * Navigation zur Datenschutzseite über das Client-Routing. Ein normaler
   * <a href> löste hier einen vollen Reload aus und hätte die bereits
   * getippte Nachricht verworfen.
   */
  onOpenDatenschutz?: () => void;
}

export function ContactForm({ onOpenDatenschutz }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [company, setCompany] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  /**
   * Tickt sekündlich, solange die Mindestwartezeit läuft.
   *
   * Der Server verlangt 4 s zwischen Token-Ausgabe und Absenden (Bot-Signal,
   * keine Wartezeit für Menschen). Vorher war der Button in dieser Zeit
   * klickbar und quittierte mit "Bitte nimm dir einen kurzen Moment" — ohne zu
   * sagen, wie lange noch. Jetzt ist er sichtbar deaktiviert und zählt runter.
   */
  const [now, setNow] = useState(() => Date.now());

  /**
   * Holt einen frischen Challenge-Token.
   *
   * Wird nicht nur beim Mount gebraucht, sondern auch nach jedem
   * Absende-Versuch: der Server entwertet den Token einmalig. Ohne Nachladen
   * würde ein zweiter Versuch mit demselben Token als Replay gewertet.
   */
  const loadChallenge = useCallback(async () => {
    const challenge = await fetchContactChallenge();
    setChallengeToken(challenge.token);
    setReadyAt(Date.now() + challenge.minDelayMs);
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
  // Submit-Button und die Meldung erscheint stumm darüber.
  useEffect(() => {
    if (success || error) statusRef.current?.focus();
  }, [success, error]);

  useEffect(() => {
    let cancelled = false;

    loadChallenge().catch(() => {
      if (!cancelled) {
        setError('Kontaktformular konnte nicht initialisiert werden. Bitte Seite neu laden.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadChallenge]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !challengeToken) return;

    if (readyAt && Date.now() < readyAt) {
      // Sollte durch den deaktivierten Button nicht mehr auftreten — bleibt
      // als Absicherung für Enter im Textfeld o. Ä.
      const remaining = Math.ceil((readyAt - Date.now()) / 1000);
      setError(`Das Formular ist in ${remaining} Sekunden bereit.`);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await sendContactMessage({ name, email, message, website, company, token: challengeToken });
      setSuccess(true);
      setName('');
      setEmail('');
      setMessage('');
      setWebsite('');
      setCompany('');
      await loadChallenge();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nachricht konnte nicht gesendet werden.');

      // Der verbrauchte Token ist jetzt wertlos. Ohne Nachladen liefe ein
      // Korrektur-Versuch in die Replay-Erkennung des Servers und würde
      // fälschlich als gesendet gemeldet.
      setChallengeToken(null);
      try {
        await loadChallenge();
      } catch {
        setError('Bitte lade die Seite neu und versuche es erneut.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formReady = Boolean(challengeToken);
  const tooShort = message.trim().length > 0 && message.trim().length < MIN_MESSAGE_LENGTH;

  return (
    <section className="border-t border-ink-100 pt-8 dark:border-ink-900/80">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-ink-900/50 dark:text-ink-50/50">
        Kontaktformular
      </h2>
      <p className="mb-2 text-sm text-ink-900/60 dark:text-ink-50/60">
        Schreib mir alternativ direkt über das Formular — ich melde mich per E-Mail zurück.
      </p>
      <p className="mb-5 text-xs text-ink-900/45 dark:text-ink-50/45">
        Name, E-Mail und Nachricht werden per E-Mail an mich zugestellt und nur zur
        Beantwortung genutzt. An deine Adresse geht eine Empfangsbestätigung. Details
        unter{' '}
        <button
          type="button"
          onClick={onOpenDatenschutz}
          className="underline underline-offset-2 hover:text-ink-900/70 dark:hover:text-ink-50/70"
        >
          Datenschutz
        </button>
        .
      </p>

      {/*
        role/aria-live sind hier nicht Kosmetik: ohne sie bekommt ein
        Screenreader-Nutzer nach dem Absenden gar keine Rückmeldung — der Fokus
        bleibt auf dem Button, die Meldung erscheint stumm darüber.
      */}
      {success && (
        <div
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 outline-none dark:text-emerald-300"
        >
          Danke! Deine Nachricht wurde gesendet.
        </div>
      )}

      {error && (
        <div
          ref={statusRef}
          role="alert"
          tabIndex={-1}
          className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 outline-none dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* relative: die Honeypot-Felder liegen absolut und sollen sich am
          Formular ausrichten, nicht an einem weiter oben liegenden Container. */}
      <form onSubmit={handleSubmit} className="relative space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" id="contact-name" required>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              maxLength={120}
              className={inputClassName}
            />
          </Field>

          <Field label="E-Mail" id="contact-email" required>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={254}
              className={inputClassName}
            />
          </Field>
        </div>

        <Field label="Nachricht" id="contact-message" required>
          <textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            minLength={10}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={6}
            aria-describedby="contact-message-counter"
            className={`${inputClassName} min-h-[9rem] resize-y`}
            placeholder="Worum geht es?"
          />
          {/*
            Ohne Zähler hörte das Tippen bei 5000 Zeichen einfach auf, ohne
            Hinweis warum. Die Mindestlänge wird erst nach dem ersten
            Absendeversuch angemahnt, damit es nicht beim Tippen meckert.
          */}
          <div
            id="contact-message-counter"
            className="mt-1.5 flex justify-between text-xs text-ink-900/40 dark:text-ink-50/40"
          >
            <span>
              {tooShort ? `Noch mindestens ${MIN_MESSAGE_LENGTH - message.trim().length} Zeichen` : ''}
            </span>
            <span className="tabular-nums">
              {message.length} / {MAX_MESSAGE_LENGTH}
            </span>
          </div>
        </Field>

        {/* Honeypots — für Menschen unsichtbar, nicht per display:none (Bot-Trap) */}
        <div className={honeypotClassName} aria-hidden>
          <label htmlFor="contact-website">Website</label>
          <input
            id="contact-website"
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <div className={honeypotClassName} aria-hidden>
          <label htmlFor="contact-company">Firma</label>
          <input
            id="contact-company"
            type="text"
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !formReady || waitSeconds > 0}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink-950 px-5 text-sm font-medium text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-ink-200"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {!formReady
            ? 'Formular wird geladen…'
            : waitSeconds > 0
              ? `Gleich bereit (${waitSeconds} s)`
              : 'Nachricht senden'}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink-900/70 dark:text-ink-50/70">
        {label}
        {required && <span className="text-ink-900/40 dark:text-ink-50/40"> *</span>}
      </label>
      {children}
    </div>
  );
}

/** Spiegelt die Server-Grenzen aus contactMail.ts. */
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;

const inputClassName =
  'w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-900/35 focus:border-ink-900/40 focus:outline-none focus:ring-2 focus:ring-ink-900/10 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-50 dark:placeholder:text-ink-50/35 dark:focus:border-ink-50/40 dark:focus:ring-ink-50/10';

const honeypotClassName =
  'pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0';
