import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CopyableValue } from './CopyableValue';

describe('CopyableValue', () => {
  // Ohne eigenen Namen bleibt Flows „Kopieren“ — der Button besteht nur aus
  // einem Icon und hätte sonst gar keinen (Codex-Review).
  it('behält Flows Namen für den Button, wenn keiner übergeben wird', () => {
    render(<CopyableValue value="v=spf1 -all" />);
    expect(screen.getByRole('button', { name: 'Kopieren' })).toBeInTheDocument();
    expect(screen.getByText('v=spf1 -all')).toBeInTheDocument();
  });

  it('nimmt einen eigenen Namen', () => {
    render(<CopyableValue value="v=spf1 -all" copyLabel="Snippet kopieren" />);
    expect(screen.getByRole('button', { name: 'Snippet kopieren' })).toBeInTheDocument();
  });

  it('kürzt auf Wunsch und zeigt den ganzen Wert im Tooltip', () => {
    render(<CopyableValue value="k=rsa; p=MIIB" truncate />);
    expect(screen.getByText('k=rsa; p=MIIB')).toHaveAttribute('title', 'k=rsa; p=MIIB');
  });
});
