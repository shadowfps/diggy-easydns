import { useEffect, useState } from 'react';
import { lookupIpDetails } from '@/lib/api';
import type { IpDetails } from '@/types/dns';

/**
 * Laden und Zwischenspeichern von IP-Details.
 *
 * Aus IpAddressLink.tsx herausgezogen, damit die Komponenten-Datei nur noch
 * Komponenten exportiert. Sonst lädt React Fast Refresh sie bei jeder Änderung
 * komplett neu statt den Zustand zu erhalten — drei react-refresh-Warnungen im
 * Lint. Betroffen war nur der Dev-Komfort, nicht das Produktionsverhalten.
 *
 * Modul-Cache und pendingRequests bleiben hier: sie sind genau dafür da, dass
 * mehrere IpOwnerLabel für dieselbe IP nicht mehrfach anfragen.
 */

const detailsCache = new Map<string, IpDetails>();
const pendingRequests = new Map<string, Promise<IpDetails>>();

export async function loadIpDetails(ip: string): Promise<IpDetails> {
  const cached = detailsCache.get(ip);
  if (cached) return cached;

  const pending = pendingRequests.get(ip);
  if (pending) return pending;

  const request = lookupIpDetails(ip)
    .then((result) => {
      detailsCache.set(ip, result);
      return result;
    })
    .finally(() => {
      pendingRequests.delete(ip);
    });

  pendingRequests.set(ip, request);
  return request;
}

/**
 * Lesezugriff auf den Modul-Cache.
 *
 * Bewusst als Funktion statt die Map zu exportieren: der Overlay braucht nur
 * "ist schon da?", nicht die Möglichkeit, den Cache von außen zu verändern.
 */
export function getCachedIpDetails(ip: string): IpDetails | undefined {
  return detailsCache.get(ip);
}

export function formatIpOwnerLabel(details: IpDetails): string | null {
  return details.organization ?? details.isp ?? details.asnName ?? details.asn ?? null;
}

export function useIpDetails(ip: string, enabled = true) {
  const [details, setDetails] = useState<IpDetails | null>(() => detailsCache.get(ip) ?? null);
  const [loading, setLoading] = useState(enabled && !detailsCache.has(ip));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const cached = detailsCache.get(ip);
    if (cached) {
      setDetails(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let stale = false;
    setLoading(true);
    setError(null);

    loadIpDetails(ip)
      .then((result) => {
        if (stale) return;
        setDetails(result);
      })
      .catch((err) => {
        if (stale) return;
        setError(err instanceof Error ? err.message : 'IP-Details konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [enabled, ip]);

  return { details, loading, error };
}
