import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import { fetchContactChallenge, sendContactMessage } from '@/lib/api';

export function ContactForm() {
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

  useEffect(() => {
    let cancelled = false;

    fetchContactChallenge()
      .then((challenge) => {
        if (cancelled) return;
        setChallengeToken(challenge.token);
        setReadyAt(Date.now() + challenge.minDelayMs);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Kontaktformular konnte nicht initialisiert werden. Bitte Seite neu laden.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading || !challengeToken) return;

    if (readyAt && Date.now() < readyAt) {
      setError('Bitte nimm dir einen kurzen Moment, bevor du die Nachricht absendest.');
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

      const challenge = await fetchContactChallenge();
      setChallengeToken(challenge.token);
      setReadyAt(Date.now() + challenge.minDelayMs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nachricht konnte nicht gesendet werden.');
    } finally {
      setLoading(false);
    }
  };

  const formReady = Boolean(challengeToken);

  return (
    <section className="border-t border-ink-100 pt-8 dark:border-ink-900/80">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-ink-900/50 dark:text-ink-50/50">
        Kontaktformular
      </h2>
      <p className="mb-5 text-sm text-ink-900/60 dark:text-ink-50/60">
        Schreib mir alternativ direkt über das Formular — ich melde mich per E-Mail zurück.
      </p>

      {success && (
        <div className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          Danke! Deine Nachricht wurde gesendet.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
            maxLength={5000}
            rows={6}
            className={`${inputClassName} min-h-[9rem] resize-y`}
            placeholder="Worum geht es?"
          />
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
          disabled={loading || !formReady}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink-950 px-5 text-sm font-medium text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-ink-50 dark:text-ink-950 dark:hover:bg-ink-200"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {formReady ? 'Nachricht senden' : 'Formular wird geladen…'}
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

const inputClassName =
  'w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 placeholder:text-ink-900/35 focus:border-ink-900/40 focus:outline-none focus:ring-2 focus:ring-ink-900/10 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-50 dark:placeholder:text-ink-50/35 dark:focus:border-ink-50/40 dark:focus:ring-ink-50/10';

const honeypotClassName =
  'pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0';
