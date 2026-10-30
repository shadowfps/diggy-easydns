import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { fetchSiteGateStatus } from '@/lib/api';
import { isSiteGated } from '@/lib/siteGate';

/*
 * Die Anmeldung braucht nur die Testumgebung — auf diggydns.cloud lädt ihr
 * Code nie (samt Flows Formular und react-hook-form).
 */
const SiteLogin = lazy(() => import('./SiteLogin').then((m) => ({ default: m.SiteLogin })));

type GateState = 'open' | 'checking' | 'locked';

/**
 * Zeigt auf der Testumgebung erst die Anmeldung, dann die App. Ohne
 * Meta-Tag (diggydns.cloud) rendert sie die App sofort — keine Abfrage, kein
 * Umweg.
 *
 * Die App startet erst nach der Anmeldung und liest dann den Pfad: Wer einen
 * Link auf einen Report bekommt, landet nach dem Passwort genau dort.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(() => (isSiteGated() ? 'checking' : 'open'));

  useEffect(() => {
    if (state !== 'checking') return;
    let cancelled = false;
    fetchSiteGateStatus().then(
      ({ open }) => !cancelled && setState(open ? 'open' : 'locked'),
      () => !cancelled && setState('locked')
    );
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state === 'open') return <>{children}</>;
  // Ein kurzer Moment ohne Inhalt statt eines aufblitzenden Formulars für
  // alle, die schon angemeldet sind.
  if (state === 'checking') return null;
  return (
    <Suspense fallback={null}>
      <SiteLogin onSignedIn={() => setState('open')} />
    </Suspense>
  );
}
