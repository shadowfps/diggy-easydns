import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GITHUB_URL } from '@/lib/project';
import { ContributeBanner } from './ContributeBanner';

describe('ContributeBanner', () => {
  it('ruft zum Mitmachen auf und führt in einem neuen Tab zum Repository', () => {
    render(<ContributeBanner />);
    // Die Überschrift benennt den Bereich — Screenreader finden ihn als „complementary“.
    const banner = screen.getByRole('complementary', { name: 'Mitgestalten erwünscht!' });
    // „deine Idee“ steht in eigenem Element (Color) — darum über den ganzen Text.
    expect(banner).toHaveTextContent('diggy ist Open Source — bring deine Idee ein oder entwickle mit.');
    const link = screen.getByRole('link', { name: /^diggy auf GitHub/ });
    expect(link).toHaveAttribute('href', GITHUB_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
