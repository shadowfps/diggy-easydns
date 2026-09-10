import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from './ContactForm';

/**
 * Das Kontaktformular war Fundstelle für den schwersten Fehler des Audits: es
 * meldete "Nachricht gesendet", ohne etwas zu verschicken (#6). Danach fand
 * ein Review einen zweiten Zustand, in dem Erfolg und Fehlermeldung
 * gleichzeitig standen.
 *
 * Beides sind Zustandsübergänge — genau das, was ohne DOM-Tests unsichtbar
 * bleibt.
 */

// Nur die beiden Requests ersetzen: `ApiError` muss die ECHTE Klasse bleiben,
// sonst schlägt das `instanceof` im Formular ins Leere und der Fehler-Code
// käme nie an.
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchContactChallenge: vi.fn(),
  sendContactMessage: vi.fn(),
}));

const api = await import('@/lib/api');
const fetchContactChallenge = vi.mocked(api.fetchContactChallenge);
const sendContactMessage = vi.mocked(api.sendContactMessage);
const { ApiError } = api;

/** Token sofort absendebereit — die Wartezeit ist hier nicht das Thema. */
function readyChallenge(token = 'token-1') {
  return { token, minDelayMs: 0 };
}

async function fillForm(message = 'Eine ausreichend lange Testnachricht.') {
  await userEvent.type(screen.getByLabelText(/Name/), 'Testerin');
  await userEvent.type(screen.getByLabelText(/E-Mail/), 'test@example.com');
  await userEvent.type(screen.getByLabelText(/Nachricht/), message);
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /Nachricht senden/ }));

beforeEach(() => {
  fetchContactChallenge.mockReset();
  sendContactMessage.mockReset();
  fetchContactChallenge.mockResolvedValue(readyChallenge());
  sendContactMessage.mockResolvedValue({ sent: true });
});

describe('ContactForm — Absenden', () => {
  it('holt beim Mount einen Challenge-Token und gibt den Button frei', async () => {
    render(<ContactForm />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Nachricht senden/ })).toBeEnabled()
    );
    expect(fetchContactChallenge).toHaveBeenCalledTimes(1);
  });

  it('sendet die Eingaben mit dem Token und meldet Erfolg', async () => {
    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());

    await fillForm();
    await submit();

    expect(sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Testerin',
        email: 'test@example.com',
        token: 'token-1',
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/gesendet/i);
  });

  it('leert die Felder nach erfolgreichem Versand', async () => {
    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    await screen.findByRole('status');
    expect(screen.getByLabelText(/Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Nachricht/)).toHaveValue('');
  });

  /**
   * Der Kern von #6: der Server entwertet den Token einmalig. Ohne Nachladen
   * lief ein Korrektur-Versuch in die Replay-Erkennung und wurde als
   * "gesendet" quittiert, ohne etwas zu verschicken.
   */
  it('lädt nach einem Fehler einen frischen Token nach', async () => {
    fetchContactChallenge
      .mockResolvedValueOnce(readyChallenge('token-1'))
      .mockResolvedValueOnce(readyChallenge('token-2'));
    sendContactMessage.mockRejectedValueOnce(new Error('Die Nachricht ist zu kurz.'));

    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/zu kurz/);
    await waitFor(() => expect(fetchContactChallenge).toHaveBeenCalledTimes(2));

    // Zweiter Versuch muss den NEUEN Token nutzen.
    sendContactMessage.mockResolvedValueOnce({ sent: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Nachricht senden/ })).toBeEnabled()
    );
    await userEvent.type(screen.getByLabelText(/Nachricht/), ' und jetzt lang genug.');
    await submit();

    expect(sendContactMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 'token-2' })
    );
  });

  /**
   * Der Server prüft die Felder VOR der Token-Entwertung. Ein Tippfehler ließ
   * den Token also gültig, das Formular lud trotzdem einen neuen nach: ein
   * Challenge-Slot verbraucht, die Wartezeit neu gestartet — und wenn
   * /api/contact/challenge dabei ins Rate-Limit lief, stand "Bitte lade die
   * Seite neu" da, obwohl der ursprüngliche Token noch benutzbar war.
   */
  it('behält den Token bei einem Validierungsfehler des Servers', async () => {
    sendContactMessage.mockRejectedValueOnce(
      new ApiError({
        error: 'contact_invalid_input',
        message: 'Bitte eine gültige E-Mail-Adresse angeben.',
      })
    );

    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/gültige E-Mail/);
    // Kein Nachladen: nur der Aufruf vom Mount.
    expect(fetchContactChallenge).toHaveBeenCalledTimes(1);

    // Und der alte Token trägt den zweiten Versuch.
    sendContactMessage.mockResolvedValueOnce({ sent: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Nachricht senden/ })).toBeEnabled()
    );
    await submit();
    expect(sendContactMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: 'token-1' })
    );
  });

  it('lädt bei einem verbrauchten Token weiterhin nach', async () => {
    fetchContactChallenge
      .mockResolvedValueOnce(readyChallenge('token-1'))
      .mockResolvedValueOnce(readyChallenge('token-2'));
    // Das Rate-Limit greift erst NACH der Token-Entwertung — hier muss ein
    // frischer Token her.
    sendContactMessage.mockRejectedValueOnce(
      new ApiError({ error: 'contact_rate_limited', message: 'Zu viele Anfragen.' })
    );

    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Zu viele/);
    await waitFor(() => expect(fetchContactChallenge).toHaveBeenCalledTimes(2));
  });

  /**
   * Die Server-Grenze gilt getrimmt, das native `minLength` zählt roh: neun
   * Zeichen plus Leerzeichen kamen durch die Browser-Prüfung und wurden erst
   * serverseitig abgelehnt.
   */
  it('lehnt eine getrimmt zu kurze Nachricht ohne Request ab', async () => {
    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());

    await userEvent.type(screen.getByLabelText(/Name/), 'Testerin');
    await userEvent.type(screen.getByLabelText(/E-Mail/), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/Nachricht/), 'neun zeic ');
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/mindestens 10 Zeichen/);
    expect(sendContactMessage).not.toHaveBeenCalled();
  });

  it('lädt auch nach Erfolg einen frischen Token nach', async () => {
    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    await screen.findByRole('status');
    await waitFor(() => expect(fetchContactChallenge).toHaveBeenCalledTimes(2));
  });

  /**
   * Regression aus dem Review: der Refetch lag im Sende-try. Schlug er nach
   * erfolgreichem Versand fehl, standen "Danke, gesendet" und eine
   * Fehlermeldung gleichzeitig da. Real erreichbar, wenn
   * /api/contact/challenge ins Rate-Limit läuft.
   */
  it('zeigt nach Erfolg KEINE Fehlermeldung, wenn nur der Token-Refetch scheitert', async () => {
    fetchContactChallenge
      .mockResolvedValueOnce(readyChallenge('token-1'))
      .mockRejectedValueOnce(new Error('429 rate limited'));

    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    expect(await screen.findByRole('status')).toHaveTextContent(/gesendet/i);
    await waitFor(() => expect(fetchContactChallenge).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('meldet einen fehlgeschlagenen Versand als Fehler', async () => {
    sendContactMessage.mockRejectedValue(new Error('Konnte nicht gesendet werden.'));

    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Konnte nicht gesendet/);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('meldet ein fehlgeschlagenes Initialisieren und lässt den Button gesperrt', async () => {
    fetchContactChallenge.mockRejectedValue(new Error('offline'));

    render(<ContactForm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/neu laden/i);
    expect(screen.getByRole('button', { name: /Formular wird geladen/ })).toBeDisabled();
  });
});

describe('ContactForm — Rückmeldung an den Nutzer', () => {
  /**
   * Ohne role/aria-live bekam ein Screenreader-Nutzer nach dem Absenden gar
   * keine Rückmeldung: der Fokus blieb auf dem Button, die Meldung erschien
   * stumm darüber (#31).
   */
  it('verkündet Erfolg als status und Fehler als alert', async () => {
    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('zieht den Fokus auf die Statusmeldung', async () => {
    render(<ContactForm />);
    await waitFor(() => expect(screen.getByRole('button', { name: /senden/ })).toBeEnabled());
    await fillForm();
    await submit();

    const status = await screen.findByRole('status');
    await waitFor(() => expect(document.activeElement).toBe(status));
  });

  it('zeigt einen Zeichenzähler für die Nachricht', async () => {
    render(<ContactForm />);
    await userEvent.type(screen.getByLabelText(/Nachricht/), 'Hallo');
    expect(screen.getByText('5 / 5000')).toBeInTheDocument();
  });

  it('weist auf die fehlenden Zeichen bis zur Mindestlänge hin', async () => {
    render(<ContactForm />);
    await userEvent.type(screen.getByLabelText(/Nachricht/), 'kurz');
    expect(screen.getByText(/Noch mindestens 6 Zeichen/)).toBeInTheDocument();
  });

  it('zeigt keinen Mindestlängen-Hinweis bei leerem Feld', () => {
    render(<ContactForm />);
    expect(screen.queryByText(/Noch mindestens/)).toBeNull();
  });

  /**
   * Der Server verlangt 4 s zwischen Token-Ausgabe und Absenden. Vorher war
   * der Button in dieser Zeit klickbar und quittierte mit einer Meldung, die
   * nicht sagte, wie lange noch.
   */
  it('sperrt den Button während der Mindestwartezeit und zählt runter', async () => {
    fetchContactChallenge.mockResolvedValue({ token: 'token-1', minDelayMs: 4_000 });

    render(<ContactForm />);
    const button = await screen.findByRole('button', { name: /Gleich bereit/ });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/\d\s*s/);
  });

  it('verlinkt die Datenschutzseite über das Client-Routing', async () => {
    const onOpenDatenschutz = vi.fn();
    render(<ContactForm onOpenDatenschutz={onOpenDatenschutz} />);

    await userEvent.click(screen.getByRole('button', { name: 'Datenschutz' }));
    expect(onOpenDatenschutz).toHaveBeenCalledTimes(1);
  });
});
