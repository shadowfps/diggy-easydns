import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { sendContactMessage } from './contactMail.js';

/**
 * Versandtest gegen einen echten SMTP-Dialog.
 *
 * Nötig für die Migration auf nodemailer 10 (#32): der CVE betrifft die
 * Runtime, und ein reiner Typecheck sagt nichts darüber, ob der Versandpfad
 * noch funktioniert. Ein Mock von nodemailer würde genau das nicht prüfen,
 * was hier interessiert.
 *
 * Der Sink spricht so viel SMTP, wie nodemailer für einen Plain-Versand
 * braucht, und protokolliert den Dialog mit. Damit lässt sich prüfen:
 * - dass überhaupt zugestellt wird
 * - an wen (RCPT TO) — inklusive der Frage, ob eine Adressliste durchkommt
 * - was im Header und Body landet
 *
 * Kein Ersatz für einen Test gegen den echten Provider — Auth, TLS und
 * Zustellbarkeit bleiben offen.
 */

interface Session {
  commands: string[];
  data: string;
}

let server: Server;
let port: number;
let sessions: Session[] = [];

function startSink(): Promise<void> {
  return new Promise((resolve) => {
    server = createServer((socket: Socket) => {
      const session: Session = { commands: [], data: '' };
      sessions.push(session);

      let inData = false;
      socket.write('220 sink.test ESMTP\r\n');

      socket.on('data', (chunk) => {
        const text = chunk.toString('utf8');

        if (inData) {
          session.data += text;
          if (session.data.includes('\r\n.\r\n')) {
            inData = false;
            socket.write('250 2.0.0 Ok: queued\r\n');
          }
          return;
        }

        for (const line of text.split('\r\n').filter(Boolean)) {
          session.commands.push(line);
          const verb = line.split(' ')[0].toUpperCase();

          if (verb === 'EHLO' || verb === 'HELO') {
            socket.write('250-sink.test\r\n250 8BITMIME\r\n');
          } else if (verb === 'MAIL' || verb === 'RCPT') {
            socket.write('250 2.1.0 Ok\r\n');
          } else if (verb === 'DATA') {
            inData = true;
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
          } else if (verb === 'QUIT') {
            socket.write('221 2.0.0 Bye\r\n');
            socket.end();
          } else {
            socket.write('250 2.0.0 Ok\r\n');
          }
        }
      });

      socket.on('error', () => {});
    });

    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
}

beforeAll(async () => {
  await startSink();
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_USER = 'sink';
  process.env.SMTP_PASS = 'sink';
  process.env.CONTACT_TO = 'betreiber@example.com';
  process.env.CONTACT_FROM = 'diggy@example.com';
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  sessions = [];
});

/** Alle RCPT-TO-Empfänger aus allen Sitzungen. */
const recipients = () =>
  sessions
    .flatMap((s) => s.commands)
    .filter((c) => c.toUpperCase().startsWith('RCPT TO'))
    .map((c) => c.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, '').trim());

describe('sendContactMessage gegen einen echten SMTP-Dialog', () => {
  it('stellt an den Betreiber zu und schickt eine Bestätigung an den Absender', async () => {
    const result = await sendContactMessage({
      name: 'Testerin',
      email: `nutzer-${Date.now()}@example.com`,
      message: 'Eine ausreichend lange Testnachricht.',
    });

    expect(result.sent).toBe(true);
    expect(recipients()).toContain('betreiber@example.com');
    // Zwei Sitzungen: Benachrichtigung und Auto-Reply.
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('setzt Reply-To auf die Absender-Adresse', async () => {
    const email = `reply-${Date.now()}@example.com`;
    await sendContactMessage({
      name: 'Testerin',
      email,
      message: 'Eine ausreichend lange Testnachricht.',
    });

    const notification = sessions[0].data;
    expect(notification).toContain('Reply-To:');
    expect(notification).toContain(email);
  });

  /**
   * Der Auto-Reply zitiert die Nachricht bewusst NICHT: die Empfänger-Adresse
   * ist unbestätigt, sonst wäre das Formular ein Transportmittel für fremden
   * Text (#14).
   */
  it('zitiert die Nachricht nicht im Auto-Reply', async () => {
    const marker = `MARKER-${Date.now()}`;
    await sendContactMessage({
      name: 'Testerin',
      email: `zitat-${Date.now()}@example.com`,
      message: `Bitte nicht zurückschicken: ${marker}`,
    });

    const autoReply = sessions[1]?.data ?? '';
    expect(autoReply).not.toContain(marker);
    // In der Benachrichtigung an den Betreiber muss sie dagegen stehen.
    expect(sessions[0].data).toContain(marker);
  });

  /**
   * Kern des Mailbomben-Fundes: mit Komma im Local-Part interpretierte
   * nodemailer den Wert als Adressliste. Die Validierung muss das abfangen,
   * BEVOR es zum Versand kommt.
   */
  it('lässt keine Adressliste bis zum SMTP-Dialog durch', async () => {
    await expect(
      sendContactMessage({
        name: 'Angreifer',
        email: 'a,opfer@example.com',
        message: 'Eine ausreichend lange Testnachricht.',
      })
    ).rejects.toThrow();

    expect(recipients()).not.toContain('opfer@example.com');
    expect(sessions).toHaveLength(0);
  });

  it('lehnt Zeilenumbrüche im Namen schon bei der Validierung ab', async () => {
    await expect(
      sendContactMessage({
        name: 'Max\r\nBcc: opfer@example.com',
        email: `injection-${Date.now()}@example.com`,
        message: 'Eine ausreichend lange Testnachricht.',
      })
    ).rejects.toThrow(/Zeilenumbrüche/);

    expect(sessions).toHaveLength(0);
  });

  /**
   * Zweite Verteidigungslinie: selbst wenn ein Name mit Sonderzeichen
   * durchkäme, darf daraus kein zusätzlicher Header entstehen. Geprüft wird
   * der Header-Block, nicht der ganze DATA-Inhalt — "Bcc:" als Text im
   * Subject ist harmlos, eine eigene Header-Zeile nicht.
   */
  it('erzeugt aus einem Namen mit Sonderzeichen keinen zusätzlichen Header', async () => {
    await sendContactMessage({
      name: 'Max" <evil@example.com>, "a',
      email: `quoted-${Date.now()}@example.com`,
      message: 'Eine ausreichend lange Testnachricht.',
    });

    expect(recipients()).not.toContain('evil@example.com');

    const headerBlock = sessions[0].data.split('\r\n\r\n')[0];
    const headerNames = headerBlock
      .split('\r\n')
      .filter((line) => /^[A-Za-z-]+:/.test(line))
      .map((line) => line.split(':')[0].toLowerCase());

    expect(headerNames).not.toContain('bcc');
    expect(headerNames).not.toContain('cc');
  });

  it('überspringt die Bestätigung, wenn Absender und Empfänger gleich sind', async () => {
    await sendContactMessage({
      name: 'Betreiber',
      email: 'betreiber@example.com',
      message: 'Eine ausreichend lange Testnachricht.',
    });

    // Nur die Benachrichtigung, kein Auto-Reply an dieselbe Adresse.
    expect(sessions).toHaveLength(1);
  });
});
