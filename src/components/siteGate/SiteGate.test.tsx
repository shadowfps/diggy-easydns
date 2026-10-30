import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchSiteGateStatus: vi.fn(),
  signInToSite: vi.fn(),
}));

const api = await import('@/lib/api');
const { SiteGate } = await import('./SiteGate');
// Die Anmeldung wird nachgeladen. Vorab geladen, damit der erste Test nicht
// unter Last auf die Transformation von Flows Formular wartet.
await import('./SiteLogin');

const App = () => <h1>Die App</h1>;

function markAsGated() {
  const meta = document.createElement('meta');
  meta.name = 'diggy-site-gate';
  meta.content = 'on';
  document.head.appendChild(meta);
}

afterEach(() => {
  document.head.querySelector('meta[name="diggy-site-gate"]')?.remove();
});

describe('SiteGate auf diggydns.cloud (ohne Meta-Tag)', () => {
  it('zeigt die App sofort und fragt nichts ab', () => {
    render(
      <SiteGate>
        <App />
      </SiteGate>
    );
    expect(screen.getByRole('heading', { name: 'Die App' })).toBeInTheDocument();
    expect(api.fetchSiteGateStatus).not.toHaveBeenCalled();
  });
});

describe('SiteGate auf der Testumgebung', () => {
  beforeEach(() => {
    markAsGated();
    vi.mocked(api.fetchSiteGateStatus).mockReset();
    vi.mocked(api.signInToSite).mockReset();
  });

  it('lässt angemeldete Browser direkt durch', async () => {
    vi.mocked(api.fetchSiteGateStatus).mockResolvedValue({ open: true });
    render(
      <SiteGate>
        <App />
      </SiteGate>
    );
    expect(await screen.findByRole('heading', { name: 'Die App' })).toBeInTheDocument();
  });

  it('zeigt die Anmeldung, meldet ein falsches Passwort am Feld und öffnet mit dem richtigen', { timeout: 10_000 }, async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchSiteGateStatus).mockResolvedValue({ open: false });
    vi.mocked(api.signInToSite)
      .mockRejectedValueOnce(new api.ApiError({ error: 'site_password_wrong', message: 'Das Passwort stimmt nicht.' }))
      .mockResolvedValueOnce();

    render(
      <SiteGate>
        <App />
      </SiteGate>
    );

    expect(await screen.findByRole('heading', { name: /^Anmelden/, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Die App' })).not.toBeInTheDocument();

    const field = screen.getByLabelText(/^Passwort/, { selector: 'input' });
    await user.type(field, 'falsch');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByText('Das Passwort stimmt nicht.')).toBeInTheDocument();
    expect(api.signInToSite).toHaveBeenCalledWith('falsch');
    expect(screen.queryByRole('heading', { name: 'Die App' })).not.toBeInTheDocument();

    // Nach einem Fehlversuch nimmt Flows SubmitButton gut zwei Sekunden lang
    // keinen Klick an (Status „fehlgeschlagen“).
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Anmelden' })).not.toHaveAttribute('aria-disabled', 'true'),
      { timeout: 4000 }
    );
    await user.clear(field);
    await user.type(field, 'geheim');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('heading', { name: 'Die App' })).toBeInTheDocument();
    expect(api.signInToSite).toHaveBeenLastCalledWith('geheim');
  });

  it('schickt kein leeres Passwort', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchSiteGateStatus).mockResolvedValue({ open: false });
    render(
      <SiteGate>
        <App />
      </SiteGate>
    );
    await user.click(await screen.findByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByText('Bitte gib das Passwort ein.')).toBeInTheDocument();
    expect(api.signInToSite).not.toHaveBeenCalled();
  });

  it('zeigt die Anmeldung, wenn der Status nicht abrufbar ist', async () => {
    vi.mocked(api.fetchSiteGateStatus).mockRejectedValue(new Error('offline'));
    render(
      <SiteGate>
        <App />
      </SiteGate>
    );
    expect(await screen.findByLabelText(/^Passwort/, { selector: 'input' })).toBeInTheDocument();
  });
});
