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

/** Der externe Dienst hat innerhalb unseres Zeitbudgets nicht geantwortet. */
export class UpstreamTimeoutError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UpstreamTimeoutError';
  }
}

/**
 * 504, wenn wir das Warten abgebrochen haben; 502 für alles andere — der
 * Dienst hat dann geantwortet, aber mit einem Fehler, oder war nicht
 * erreichbar.
 */
export function upstreamErrorStatus(error: unknown): 502 | 504 {
  return error instanceof UpstreamTimeoutError ? 504 : 502;
}
