/**
 * Klassisches WHOIS über TCP-Port 43 (RFC 3912) — für Registries ohne RDAP
 * (#105): .eu und .io als Rückfall; .at und .it sind vorbereitet, aber
 * abgeschaltet (shared/registryWebLookup.ts). Gedrosselt je Host wird in
 * services/registryQuery.ts, nicht hier.
 *
 * Das Protokoll: Verbindung auf, eine Zeile mit der Domain und CRLF senden,
 * Klartext lesen, bis der Server die Verbindung schließt.
 *
 * Grenzen, damit eine Abfrage nichts festhält:
 *  - Host kommt nie aus einer Eingabe: Aufrufer übergeben ihn aus der festen
 *    Liste in services/registry.ts. Die Abfrage selbst muss eine Domain aus
 *    LDH-Zeichen sein — keine Leer- oder Steuerzeichen, mit denen sich eine
 *    zweite Zeile oder ein anderes Kommando einschleusen ließe.
 *  - Zwei Timeouts: für den Verbindungsaufbau und für die ganze Abfrage.
 *  - Höchstens `maxBytes` Antwort, dann Abbruch.
 *  - Jeder Ausgang räumt den Socket ab; der `error`-Listener bleibt bis
 *    zuletzt hängen, ein spätes Fehler-Event beendet also nicht den Prozess.
 */

import { connect } from 'node:net';

/** Antworten liegen bei 1–5 KB; 64 KiB reichen mit Abstand. */
export const MAX_WHOIS_BYTES = 64 * 1024;

const QUERY_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;

export class WhoisPort43Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhoisPort43Error';
  }
}

export interface Port43Options {
  /** Nur für Tests (lokaler Server); in Betrieb immer 43. */
  port?: number;
  /** Bis die TCP-Verbindung steht. */
  connectTimeoutMs?: number;
  /** Für die ganze Abfrage, inklusive Verbindungsaufbau. */
  timeoutMs?: number;
  maxBytes?: number;
}

export function queryPort43(host: string, query: string, options: Port43Options = {}): Promise<string> {
  const { port = 43, connectTimeoutMs = 3_000, timeoutMs = 5_000, maxBytes = MAX_WHOIS_BYTES } = options;
  if (!QUERY_PATTERN.test(query)) {
    return Promise.reject(new WhoisPort43Error('ungültige Abfrage'));
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks: Buffer[] = [];

    // Happy Eyeballs: Node versucht IPv6 und IPv4 im Wechsel, je Adresse
    // standardmäßig 250 ms. Unter Last reichte das bei den DoH-Abfragen nicht
    // (#137); hier begrenzt ohnehin connectTimeoutMs.
    const socket = connect({ host, port, autoSelectFamilyAttemptTimeout: 1_000 });

    const finish = (error: Error | null, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(text ?? '');
    };

    const connectTimer = setTimeout(
      () => finish(new WhoisPort43Error('Timeout beim Verbindungsaufbau')),
      connectTimeoutMs
    );
    const totalTimer = setTimeout(() => finish(new WhoisPort43Error('Timeout')), timeoutMs);

    socket.once('connect', () => {
      clearTimeout(connectTimer);
      socket.write(`${query}\r\n`);
    });
    socket.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        finish(new WhoisPort43Error(`Antwort größer als ${maxBytes} Bytes`));
        return;
      }
      chunks.push(chunk);
    });
    // Der Server schließt nach der Antwort: erst dann ist sie vollständig.
    socket.on('end', () => finish(null, decode(Buffer.concat(chunks))));
    socket.on('error', (error) => finish(error));
    // Zu ohne 'end' — etwa nach einem Reset, dessen 'error' schon kam.
    socket.on('close', () => finish(new WhoisPort43Error('Verbindung ohne Antwort geschlossen')));
  });
}

/**
 * Wie warnRdapError: Im UI sehen „nicht erreichbar“ und „gesperrt“ gleich
 * aus, im Log steht die Ursache. Nie die Antwort selbst — sie kann
 * Kontaktdaten enthalten (siehe services/whoisText.ts).
 */
export function warnWhoisError(host: string, domain: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`[whois] ${host} ${domain}: ${reason}`);
}

/**
 * Die Registries antworten in UTF-8; ältere Server schicken Latin-1. Ein
 * ungültiges UTF-8-Byte heißt: Latin-1, sonst würde aus „ö“ ein „�“.
 */
function decode(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return bytes.toString('latin1');
  }
}
