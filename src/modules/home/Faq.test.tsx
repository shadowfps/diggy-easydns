import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Faq } from './Faq';

describe('Faq', () => {
  it('zeigt die Fragen als Überschriften, eingeklappt, unter einem benannten Abschnitt', () => {
    render(<Faq />);
    const region = screen.getByRole('region', { name: 'Häufige Fragen' });
    const questions = within(region).getAllByRole('heading', { level: 3 });
    expect(questions).toHaveLength(8);
    expect(questions[0]).toHaveTextContent('Was ist diggy?');
    // Jede Frage ist der Button ihres Accordions — zu Beginn zu.
    for (const question of questions) {
      expect(within(question).getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('klappt eine Antwort auf und verlinkt die Datenschutzerklärung', async () => {
    const user = userEvent.setup();
    render(<Faq />);
    const button = screen.getByRole('button', { name: 'Speichert diggy meine Suchen?' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/Deine letzten zehn Suchen kennt nur dein Browser/)).toBeVisible();
    expect(screen.getAllByRole('link', { name: /^Datenschutzerklärung/ })[0]).toHaveAttribute('href', '/datenschutz');
  });
});
