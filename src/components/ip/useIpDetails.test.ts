import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { IpDetails } from '@/types/dns';

/**
 * Tests für den IP-Detail-Hook.
 *
 * Der Hook las den Modul-Cache früher im Effect und spiegelte ihn per setState
 * in den State. Ein Treffer kostete damit einen Render mit `loading: true`,
 * obwohl die Daten längst dalagen — beim Umstieg auf
 * eslint-plugin-react-hooks 7 hat react-hooks/set-state-in-effect genau das
 * beanstandet. Seitdem wird der Cache im Render abgeleitet.
 *
 * Festgehalten sind hier die drei Eigenschaften, die bei diesem Muster leicht
 * kippen: der Treffer steht sofort da, ein IP-Wechsel zeigt nichts Altes mehr,
 * und ein Fehler beendet den Ladezustand.
 *
 * Der Modul-Cache lebt so lange wie das Modul, deshalb benutzt jeder Test
 * seine eigene IP.
 */

vi.mock('@/lib/api', () => ({ lookupIpDetails: vi.fn() }));

const api = await import('@/lib/api');
const { useIpDetails } = await import('./useIpDetails');
const lookupIpDetails = vi.mocked(api.lookupIpDetails);

const detailsFor = (ip: string): IpDetails => ({ ip, organization: `Betreiber ${ip}` });

describe('useIpDetails', () => {
  it('liefert einen Cache-Treffer schon im ersten Render', async () => {
    lookupIpDetails.mockResolvedValue(detailsFor('10.0.0.1'));

    const first = renderHook(() => useIpDetails('10.0.0.1'));
    await waitFor(() => expect(first.result.current.details).not.toBeNull());
    first.unmount();

    // Zweiter Verbraucher derselben IP: kein Ladezustand, kein zweiter Request.
    const second = renderHook(() => useIpDetails('10.0.0.1'));

    expect(second.result.current.details).toEqual(detailsFor('10.0.0.1'));
    expect(second.result.current.loading).toBe(false);
    expect(lookupIpDetails).toHaveBeenCalledTimes(1);
  });

  it('zeigt nach einem IP-Wechsel nicht mehr das vorherige Ergebnis', async () => {
    lookupIpDetails.mockImplementation((ip: string) => Promise.resolve(detailsFor(ip)));

    const { result, rerender } = renderHook(({ ip }) => useIpDetails(ip), {
      initialProps: { ip: '10.0.0.2' },
    });
    await waitFor(() => expect(result.current.details?.ip).toBe('10.0.0.2'));

    rerender({ ip: '10.0.0.3' });

    expect(result.current.details).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.details?.ip).toBe('10.0.0.3'));
  });

  it('beendet den Ladezustand, wenn der Abruf scheitert', async () => {
    lookupIpDetails.mockRejectedValue(new Error('IP-Dienst nicht erreichbar'));

    const { result } = renderHook(() => useIpDetails('10.0.0.4'));
    await waitFor(() => expect(result.current.error).toBe('IP-Dienst nicht erreichbar'));

    expect(result.current.loading).toBe(false);
    expect(result.current.details).toBeNull();
  });

  it('fragt nichts ab, solange der Hook nicht aktiv ist', () => {
    lookupIpDetails.mockResolvedValue(detailsFor('10.0.0.5'));

    // Der Fall des geschlossenen IP-Overlays: gemountet, aber nicht aktiv.
    const { result } = renderHook(() => useIpDetails('10.0.0.5', false));

    expect(result.current.loading).toBe(false);
    expect(result.current.details).toBeNull();
    expect(lookupIpDetails).not.toHaveBeenCalled();
  });
});
