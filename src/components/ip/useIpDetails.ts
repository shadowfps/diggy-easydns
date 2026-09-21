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

async function loadIpDetails(ip: string): Promise<IpDetails> {
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

export function formatIpOwnerLabel(details: IpDetails): string | null {
  return details.organization ?? details.isp ?? details.asnName ?? details.asn ?? null;
}

export function useIpDetails(ip: string, enabled = true) {
  /**
   * Ergebnis der letzten Anfrage — immer zusammen mit der IP, zu der es gehört.
   *
   * Die IP steht mit im State, damit ein Wechsel nicht für einen Render noch
   * das Ergebnis der vorherigen zeigt. Vorher übernahm das ein `setDetails`
   * im Effect, also ein Render zu spät.
   */
  const [result, setResult] = useState<{
    ip: string;
    details: IpDetails | null;
    error: string | null;
  } | null>(null);

  /*
   * Den Modul-Cache während des Renders lesen statt im Effect.
   *
   * Für einen Treffer standen hier vorher drei synchrone setState im Effect:
   * ein erster Render mit loading=true, dann ein zweiter mit Daten, die längst
   * dalagen. Genau diese Kaskade meint react-hooks/set-state-in-effect.
   * Abgeleitet steht derselbe Wert schon im ersten Render.
   */
  const cached = detailsCache.get(ip) ?? null;
  const fresh = result?.ip === ip ? result : null;

  const details = cached ?? fresh?.details ?? null;
  const error = details ? null : (fresh?.error ?? null);
  const loading = enabled && !details && !error;

  useEffect(() => {
    // Cache-Treffer brauchen keinen Request — und kein setState.
    if (!enabled || detailsCache.has(ip)) return;

    let stale = false;

    loadIpDetails(ip)
      .then((loaded) => {
        if (!stale) setResult({ ip, details: loaded, error: null });
      })
      .catch((err) => {
        if (stale) return;
        setResult({
          ip,
          details: null,
          error: err instanceof Error ? err.message : 'IP-Details konnten nicht geladen werden.',
        });
      });

    return () => {
      stale = true;
    };
  }, [enabled, ip]);

  return { details, loading, error };
}
