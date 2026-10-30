import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RECORD_EXPLANATIONS } from '@/lib/explanations';
import { InfoButton } from './InfoButton';

/**
 * Das „?“ muss ohne Maus funktionieren (#80): kein Hover-Tooltip, sondern ein
 * Button, der per Tastatur und Touch aufgeht, seinen Zustand meldet und den
 * Fokus beim Schließen zurückgibt. Umgesetzt mit Flows ContextualHelp.
 */

// Titel und Text sind Schlüssel aus dem Wörterbuch (#86) — deshalb ein
// echter Eintrag statt eines Fantasietexts.
const EXPLANATION = RECORD_EXPLANATIONS.MX;

function setup() {
  const user = userEvent.setup();
  render(
    <div>
      <button type="button">davor</button>
      <InfoButton term="MX" explanation={EXPLANATION} />
      <button type="button">danach</button>
    </div>
  );
  const button = screen.getByRole('button', { name: 'Was bedeutet MX?' });
  return { user, button };
}

describe('InfoButton', () => {
  it('ist zu Beginn geschlossen', () => {
    const { button } = setup();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(EXPLANATION.text)).not.toBeInTheDocument();
  });

  it('zeigt nach dem Öffnen Begriff, Titel und Text im verknüpften Dialog', async () => {
    const { user, button } = setup();
    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = await screen.findByRole('dialog');
    expect(button.getAttribute('aria-controls')).toBeTruthy();
    expect(dialog).toHaveTextContent('MX');
    expect(dialog).toHaveTextContent(EXPLANATION.title);
    expect(dialog).toHaveTextContent(EXPLANATION.text);
  });

  it('öffnet per Tastatur (Enter, Leertaste)', async () => {
    const { user, button } = setup();
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByText(EXPLANATION.text)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    // Den Fokus gibt react-aria erst nach der Ausblende-Animation zurück.
    await waitFor(() => expect(button).toHaveFocus());

    await user.keyboard(' ');
    expect(await screen.findByText(EXPLANATION.text)).toBeInTheDocument();
  });

  it('schließt mit Escape und gibt den Fokus an den Button zurück', async () => {
    const { user, button } = setup();
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByText(EXPLANATION.text)).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('schließt bei einem Klick außerhalb', async () => {
    const { user, button } = setup();
    await user.click(button);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.click(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('bleibt offen bei einem Klick in die Erklärung', async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.click(await screen.findByText(EXPLANATION.text));
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
});
