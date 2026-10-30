/**
 * Fehler externer Dienste (VirusTotal, PageSpeed) und ihr HTTP-Status.
 *
 * Die Services fangen den AbortError ihres Timeouts ab und werfen eine
 * verständliche Meldung für den Nutzer. Damit verschwindet aber
 * `name === 'AbortError'` — der ursprüngliche Fehler hängt nur noch als
 * `cause` dran. /api/virusscan prüfte trotzdem den Namen und meldete so jeden
 * Timeout als 502 (#78). PageSpeed suchte stattdessen nach „timeout“ in der
 * Meldung, was von der Formulierung abhängt und auch bei Fehlertexten der API
 * selbst anschlägt.
 *
 * Eine eigene Klasse macht den Timeout am Typ erkennbar, unabhängig von Name
 * und Text.
 */

import type { TextParams } from '../../shared/textKeys.js';

/** Werte für die übersetzte Meldung (#86), z. B. die Sekunden des Timeouts. */
interface UpstreamErrorOptions extends ErrorOptions {
  params?: TextParams;
}

/** Der externe Dienst hat innerhalb unseres Zeitbudgets nicht geantwortet. */
export class UpstreamTimeoutError extends Error {
  readonly params?: TextParams;

  constructor(message: string, options?: UpstreamErrorOptions) {
    super(message, options);
    this.name = 'UpstreamTimeoutError';
    this.params = options?.params;
  }
}

/** Unser Kontingent beim Dienst ist aufgebraucht (dort HTTP 429). */
export class UpstreamQuotaError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpstreamQuotaError';
  }
}

/**
 * Der Dienst hat geantwortet, konnte die Seite selbst aber nicht prüfen — bei
 * PageSpeed meldet Lighthouse dann einen Grund wie DNS_FAILURE (#147). Kein
 * Fehler bei uns oder beim Dienst.
 */
export class UpstreamTargetError extends Error {
  readonly params?: TextParams;

  constructor(message: string, options?: UpstreamErrorOptions) {
    super(message, options);
    this.name = 'UpstreamTargetError';
    this.params = options?.params;
  }
}

/**
 * 504, wenn wir das Warten abgebrochen haben; 429 bei erschöpftem Kontingent,
 * 422, wenn die Seite selbst nicht zu prüfen war; 502 für alles andere — der
 * Dienst hat dann mit einem Fehler geantwortet oder war nicht erreichbar.
 *
 * 4xx, wo der Grund feststeht: Cloudflare ersetzt 502 und 504 des Servers
 * durch eine eigene Fehlerseite ohne unsere Meldung (#147). Bei diesen beiden
 * erkennt die Oberfläche nur noch den Status (lib/api.ts).
 */
export function upstreamErrorStatus(error: unknown): 422 | 429 | 502 | 504 {
  if (error instanceof UpstreamTimeoutError) return 504;
  if (error instanceof UpstreamQuotaError) return 429;
  if (error instanceof UpstreamTargetError) return 422;
  return 502;
}
