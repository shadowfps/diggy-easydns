import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoButton } from './InfoButton';

/**
 * Das „?“ muss ohne Maus funktionieren (#80): kein Hover-Tooltip, sondern ein
 * Button, der per Tastatur und Touch auf- und zugeht und dabei seinen Zustand
 * meldet.
 */

const EXPLANATION = {
  title: 'Mailserver',
  text: 'Nennt die Server, die E-Mails für die Domain annehmen.',
};

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
  it('ist zu Beginn geschlossen und verweist auf kein fehlendes Element', () => {
    const { button } = setup();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveAttribute('aria-controls');
    expect(screen.queryByText(EXPLANATION.text)).not.toBeInTheDocument();
  });

  it('zeigt nach dem Öffnen Begriff, Titel und Text im verknüpften Element', async () => {
    const { user, button } = setup();
    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent('MX');
    expect(panel).toHaveTextContent(EXPLANATION.title);
    expect(panel).toHaveTextContent(EXPLANATION.text);
  });

  it('öffnet und schließt per Tastatur (Enter, Leertaste)', async () => {
    const { user, button } = setup();
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(EXPLANATION.text)).toBeInTheDocument();

    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(EXPLANATION.text)).not.toBeInTheDocument();
  });

  it('schließt mit Escape und lässt den Fokus auf dem Button', async () => {
    const { user, button } = setup();
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(EXPLANATION.text)).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('schließt bei einem Klick außerhalb', async () => {
    const { user, button } = setup();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await user.click(document.body);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('bleibt offen bei einem Klick in die Erklärung', async () => {
    const { user, button } = setup();
    await user.click(button);
    await user.click(screen.getByText(EXPLANATION.text));
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('schließt, wenn der Fokus per Tab weiterwandert', async () => {
    const { user, button } = setup();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    expect(screen.getByRole('button', { name: 'danach' })).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
