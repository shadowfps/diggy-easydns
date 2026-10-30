import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { GITHUB_URL } from '@/lib/project';
import { ContributeBanner } from './ContributeBanner';
import { ConverterPromo } from './ConverterPromo';

describe('Promo-Kacheln', () => {
  it('ruft zum Mitmachen auf und führt in einem neuen Tab zum Repository', () => {
    render(<ContributeBanner />);
    // Die Überschrift benennt den Bereich — Screenreader finden ihn als „complementary“.
    const tile = screen.getByRole('complementary', { name: 'Mitgestalten erwünscht. Bring deine Idee ein.' });
    expect(tile).toHaveTextContent('Open Source');
    const link = within(tile).getByRole('link', { name: /^diggy auf GitHub/ });
    expect(link).toHaveAttribute('href', GITHUB_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // Flows Call-to-Action ist ein Button im Link: Es darf ein einziges Bedienelement bleiben.
  it('hat je Kachel genau ein Bedienelement', () => {
    render(<ConverterPromo />);
    const tile = screen.getByRole('complementary', { name: /^Bilder umwandeln/ });
    expect(within(tile).getAllByRole('link')).toHaveLength(1);
    expect(within(tile).queryByRole('button')).not.toBeInTheDocument();
    expect(within(tile).getByRole('link')).toHaveAttribute('href', 'https://converter.diggydns.cloud');
  });
});
