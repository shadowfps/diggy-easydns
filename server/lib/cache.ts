/**
 * Winziger In-Memory-TTL-Cache.
 *
 * Zweck: Wiederholte Lookups derselben Domain (Permalink öffnen, F5,
 * Tab-Wechsel) müssen die teuren Sub-Checks nicht erneut ausführen.
 * Analog zu ipDetails.ts, nur generisch.
 *
 * Bewusst simpel: prozess-lokal, kein LRU, kein Redis. Bei einem Neustart
 * ist der Cache leer — das ist okay, TTL ist ohnehin kurz.
 */

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const store = new Map<string, CacheEntry>();

/** Obergrenze, damit der Cache bei vielen unterschiedlichen Domains nicht unbegrenzt wächst. */
const MAX_ENTRIES = 500;

/**
 * Gibt den gecachten Wert zurück, oder ruft `produce()` auf, cached das
 * Ergebnis für `ttlMs` und gibt es zurück. Fehler (throws) werden NICHT
 * gecacht — der nächste Aufruf versucht es erneut.
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

  const value = await produce();

  // Einfache Eviction: ältesten Eintrag (Insertion-Order) rauswerfen.
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  store.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}
