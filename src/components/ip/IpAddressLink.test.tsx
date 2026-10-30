import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', () => ({ lookupIpDetails: vi.fn() }));

const api = await import('@/lib/api');
const { IpAddressLink, IpOwnerLabel, IpPtrLabel } = await import('./IpAddressLink');

/**
 * Die IP-Details im Modal (Flows ModalTrigger): erst beim Öffnen laden, Werte
 * mit Beschriftung, fehlende Werte als „nicht verfügbar“, Escape schließt.
 * Jede IP nur einmal: useIpDetails merkt sich Ergebnisse modulweit.
 */
describe('IpAddressLink', () => {
  beforeEach(() => {
    vi.mocked(api.lookupIpDetails).mockReset();
  });

  it('lädt die Details erst beim Öffnen und zeigt sie im Modal', async () => {
    vi.mocked(api.lookupIpDetails).mockResolvedValue({
      ip: '192.0.2.10',
      type: 'IPv4',
      ptr: ['host.example.net'],
      organization: 'Example Hosting',
      asn: 'AS64500',
      source: 'test',
    });
    const user = userEvent.setup();
    render(<IpAddressLink ip="192.0.2.10" />);
    expect(api.lookupIpDetails).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Details zu 192.0.2.10 anzeigen' }));
    const dialog = await screen.findByRole('dialog');

    // Der PTR-Name führt auf seinen Report, die IP selbst als eigene Suche (#147).
    expect(await within(dialog).findByRole('link', { name: /^host\.example\.net/ })).toHaveAttribute(
      'href',
      '/lookup/host.example.net'
    );
    expect(within(dialog).getByRole('link', { name: /^Als eigene Suche öffnen/ })).toHaveAttribute(
      'href',
      '/lookup/192.0.2.10'
    );
    expect(within(dialog).getByRole('group', { name: 'Organisation' })).toHaveTextContent('Example Hosting');
    expect(within(dialog).getByRole('group', { name: 'Zeitzone' })).toHaveTextContent('nicht verfügbar');
    expect(within(dialog).getByRole('button', { name: 'IP kopieren' })).toBeInTheDocument();
    expect(api.lookupIpDetails).toHaveBeenCalledWith('192.0.2.10');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('meldet einen Fehler im Modal', async () => {
    vi.mocked(api.lookupIpDetails).mockRejectedValue(new Error('kaputt'));
    const user = userEvent.setup();
    render(<IpAddressLink ip="192.0.2.11" />);
    await user.click(screen.getByRole('button', { name: 'Details zu 192.0.2.11 anzeigen' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/kaputt|konnten nicht geladen werden/)).toBeInTheDocument();
  });
});

describe('IpOwnerLabel', () => {
  it('nennt den Netzbetreiber', async () => {
    vi.mocked(api.lookupIpDetails).mockResolvedValue({
      ip: '192.0.2.12',
      type: 'IPv4',
      isp: 'Example ISP',
      source: 'test',
    });
    render(<IpOwnerLabel ip="192.0.2.12" />);
    expect(await screen.findByText('Example ISP')).toBeInTheDocument();
  });
});

describe('IpPtrLabel (#147)', () => {
  it('zeigt den PTR als Link auf seinen Report', async () => {
    vi.mocked(api.lookupIpDetails).mockResolvedValue({
      ip: '192.0.2.13',
      type: 'IPv4',
      ptr: ['lb-13.example.net'],
      source: 'test',
    });
    render(<IpPtrLabel ip="192.0.2.13" />);
    expect(await screen.findByRole('link', { name: /^lb-13\.example\.net/ })).toHaveAttribute(
      'href',
      '/lookup/lb-13.example.net'
    );
  });

  it('zeigt ohne PTR nichts — „nicht konfiguriert“ stünde sonst in jeder Zeile', async () => {
    vi.mocked(api.lookupIpDetails).mockResolvedValue({ ip: '192.0.2.14', type: 'IPv4', source: 'test' });
    const { container } = render(<IpPtrLabel ip="192.0.2.14" />);
    await waitFor(() => expect(api.lookupIpDetails).toHaveBeenCalledWith('192.0.2.14'));
    expect(container).toBeEmptyDOMElement();
  });
});
