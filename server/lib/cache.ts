/**
 * Winziger In-Memory-TTL-Cache.
 *
 * Zweck: Wiederholte Lookups derselben Domain (Permalink öffnen, F5,
 * Tab-Wechsel) müssen die teuren Sub-Checks nicht erneut ausführen.
 *
 * Bewusst simpel: prozess-lokal, kein LRU, kein Redis. Bei einem Neustart
 * ist der Cache leer — das ist okay, TTL ist ohnehin kurz. Bei horizontaler
 * Skalierung ist das hier die Stelle, die ersetzt wird.
 */

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const store = new Map<string, CacheEntry>();

/**
 * Laufende Produktionen, damit parallele Anfragen auf denselben Key sich die
 * Arbeit teilen statt sie zu vervielfachen.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Obergrenze, damit der Cache bei vielen unterschiedlichen Domains nicht
 * unbegrenzt wächst.
 *
 * Der Wert gilt für alle Namespaces gemeinsam (records, propagation, dnssec,
 * ssl, mail, whois, techstack, ip). Bei acht Namespaces sind 500 Einträge nur
 * gut 60 Domains — deshalb deutlich höher angesetzt. Ein Eintrag liegt im
 * Bereich weniger Kilobyte.
 */
const MAX_ENTRIES = 4_000;

/**
 * Gibt den gecachten Wert zurück, oder ruft `produce()` auf, cached das
 * Ergebnis für `ttlMs` und gibt es zurück.
 *
 * Zwei Eigenschaften, die nicht offensichtlich sind:
 *
 *  - **Fehler werden NICHT gecacht.** Der nächste Aufruf versucht es erneut.
 *  - **Parallele Aufrufe auf denselben Key teilen sich eine Produktion.**
 *    Ohne das führten fünf gleichzeitige Requests fünf komplette Lookups aus —
 *    was im Normalbetrieb regelmäßig passiert, weil das Frontend sechs
 *    Sektionen parallel lädt und mehrere Nutzer auf einem geteilten Permalink
 *    gleichzeitig eintreffen.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  produce: () => Promise<T>
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }

  const running = inflight.get(key);
  if (running) {
    return running as Promise<T>;
  }

  const pending = produce()
    .then((value) => {
      remember(key, ttlMs, value);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

function remember(key: string, ttlMs: number, value: unknown): void {
  // Vor dem Setzen löschen, damit der Eintrag in der Insertion-Order nach
  // hinten wandert. `Map.set` auf einen existierenden Key ändert die Position
  // nicht — ohne das delete hätte ein gerade erneuerter, häufig gelesener
  // Eintrag seine alte Position behalten und wäre bevorzugt geworfen worden.
  store.delete(key);

  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  store.set(key, { expiresAt: Date.now() + ttlMs, value });
}

/** Nur für Tests: leert Cache und laufende Produktionen. */
export function clearCache(): void {
  store.clear();
  inflight.clear();
}
