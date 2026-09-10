import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Ohne Boundary führte jeder Render-Fehler zur weißen Seite (#21). Die Views
 * verarbeiten Fremd-API-Daten, die nirgends gegen ein Schema geprüft werden —
 * `getJson` castet blind.
 */

function Boom({ fail }: { fail: boolean }): React.ReactElement {
  if (fail) throw new Error('kaputt beim Rendern');
  return <p>Inhalt steht</p>;
}

/** React loggt abgefangene Fehler auf der Konsole — hier erwartet, also still. */
function renderQuiet(ui: React.ReactElement) {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const view = render(ui);
  spy.mockRestore();
  return view;
}

describe('ErrorBoundary', () => {
  it('rendert die Kinder, solange nichts kaputt ist', () => {
    render(
      <ErrorBoundary fallback={() => <p>Fallback</p>}>
        <Boom fail={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Inhalt steht')).toBeInTheDocument();
    expect(screen.queryByText('Fallback')).toBeNull();
  });

  it('zeigt den Fallback statt einer weißen Seite', () => {
    renderQuiet(
      <ErrorBoundary fallback={({ error }) => <p>Fallback: {error.message}</p>}>
        <Boom fail />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Fallback: kaputt beim Rendern/)).toBeInTheDocument();
  });

  it('gibt den Fehler an den Fallback weiter', () => {
    const fallback = vi.fn(() => <p>F</p>);
    renderQuiet(
      <ErrorBoundary fallback={fallback}>
        <Boom fail />
      </ErrorBoundary>
    );
    expect(fallback).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error), reset: expect.any(Function) })
    );
  });

  it('protokolliert den Fehler, damit er nach dem Fallback noch auffindbar ist', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={() => <p>F</p>}>
        <Boom fail />
      </ErrorBoundary>
    );
    expect(spy.mock.calls.flat().join(' ')).toContain('Render-Fehler abgefangen');
    spy.mockRestore();
  });

  it('rendert nach reset() erneut — und wieder den Fallback, wenn die Ursache bleibt', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary
        fallback={({ reset }) => (
          <button type="button" onClick={reset}>
            Nochmal
          </button>
        )}
      >
        <Boom fail />
      </ErrorBoundary>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Nochmal' }));
    expect(screen.getByRole('button', { name: 'Nochmal' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('rendert nach reset() den Inhalt, wenn die Ursache behoben ist', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function Host() {
      const [fail, setFail] = React.useState(true);
      return (
        <ErrorBoundary
          fallback={({ reset }) => (
            <button
              type="button"
              onClick={() => {
                setFail(false);
                reset();
              }}
            >
              Beheben
            </button>
          )}
        >
          <Boom fail={fail} />
        </ErrorBoundary>
      );
    }

    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Beheben' }));
    expect(screen.getByText('Inhalt steht')).toBeInTheDocument();
    spy.mockRestore();
  });
});
