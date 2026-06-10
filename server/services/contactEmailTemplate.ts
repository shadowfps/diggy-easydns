interface ContactEmailPayload {
  name: string;
  email: string;
  message: string;
}

/** Inline-HTML für E-Mail-Clients — diggy ink/dark Look, table-basiert. */
export function buildContactEmailHtml(payload: ContactEmailPayload): string {
  const name = escapeHtml(payload.name);
  const email = escapeHtml(payload.email);
  const message = escapeHtml(payload.message).replace(/\n/g, '<br />');
  const sentAt = escapeHtml(
    new Date().toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    })
  );

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Neue diggy Kontaktanfrage</title>
</head>
<body style="margin:0;padding:0;background-color:#09090B;color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090B;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <div style="font-size:28px;font-weight:700;letter-spacing:-0.03em;line-height:1;color:#FAFAFA;text-transform:lowercase;">
                diggy
              </div>
              <div style="margin-top:8px;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#71717A;">
                DNS made friendly
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#18181B;border:1px solid #27272A;border-radius:16px;padding:28px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-bottom:20px;">
                    <span style="display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid #3F3F46;background-color:#09090B;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#A1A1AA;">
                      Neue Kontaktanfrage
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:8px;font-size:22px;font-weight:600;line-height:1.3;color:#FAFAFA;">
                    Nachricht von ${name}
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;font-size:13px;line-height:1.5;color:#A1A1AA;">
                    Gesendet über das Kontaktformular auf der Impressum-Seite.
                  </td>
                </tr>

                <!-- Name -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090B;border:1px solid #27272A;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#71717A;margin-bottom:6px;">Name</div>
                          <div style="font-size:15px;line-height:1.4;color:#FAFAFA;">${name}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- E-Mail -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090B;border:1px solid #27272A;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#71717A;margin-bottom:6px;">E-Mail</div>
                          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px;line-height:1.4;">
                            <a href="mailto:${email}" style="color:#FAFAFA;text-decoration:underline;text-underline-offset:3px;">${email}</a>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Nachricht -->
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090B;border:1px solid #27272A;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#71717A;margin-bottom:10px;">Nachricht</div>
                          <div style="font-size:15px;line-height:1.65;color:#E4E4E7;">${message}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Reply hint -->
                <tr>
                  <td style="padding-top:20px;font-size:13px;line-height:1.5;color:#71717A;">
                    Antworten geht direkt per <strong style="color:#D4D4D8;font-weight:600;">Reply</strong> — die Absender-Adresse ist als Reply-To gesetzt.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:#52525B;">
              ${sentAt} · diggy Kontaktformular
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildContactEmailText(payload: ContactEmailPayload): string {
  return [
    'diggy — Neue Kontaktanfrage',
    '═'.repeat(32),
    '',
    `Name:    ${payload.name}`,
    `E-Mail:  ${payload.email}`,
    '',
    'Nachricht:',
    '─'.repeat(32),
    payload.message,
    '',
    '─'.repeat(32),
    'Antworten: einfach auf diese E-Mail antworten (Reply-To ist gesetzt).',
    '',
    `Gesendet: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
  ].join('\n');
}

interface ContactAutoReplyPayload {
  name: string;
  message: string;
}

/** Bestätigung an den Absender — gleicher diggy-Look. */
export function buildContactAutoReplyHtml(payload: ContactAutoReplyPayload): string {
  const name = escapeHtml(payload.name);
  const messagePreview = escapeHtml(payload.message).replace(/\n/g, '<br />');
  const sentAt = escapeHtml(
    new Date().toLocaleString('de-DE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    })
  );

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Danke für deine Anfrage — diggy</title>
</head>
<body style="margin:0;padding:0;background-color:#09090B;color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090B;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <div style="font-size:28px;font-weight:700;letter-spacing:-0.03em;line-height:1;color:#FAFAFA;text-transform:lowercase;">
                diggy
              </div>
              <div style="margin-top:8px;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#71717A;">
                DNS made friendly
              </div>
            </td>
          </tr>

          <tr>
            <td style="background-color:#18181B;border:1px solid #27272A;border-radius:16px;padding:28px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-bottom:20px;">
                    <span style="display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid #3F3F46;background-color:#09090B;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#A1A1AA;">
                      Bestätigung
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:12px;font-size:22px;font-weight:600;line-height:1.3;color:#FAFAFA;">
                    Danke, ${name}!
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:24px;font-size:15px;line-height:1.65;color:#E4E4E7;">
                    Wir haben deine Anfrage über diggy erhalten und setzen uns zeitnah mit dir in Verbindung.
                  </td>
                </tr>

                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#09090B;border:1px solid #27272A;border-radius:12px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#71717A;margin-bottom:10px;">Deine Nachricht</div>
                          <div style="font-size:14px;line-height:1.65;color:#A1A1AA;">${messagePreview}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:20px;font-size:13px;line-height:1.5;color:#71717A;">
                    Du musst nichts weiter tun. Falls du noch etwas ergänzen möchtest, antworte einfach auf diese E-Mail.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.5;color:#52525B;">
              ${sentAt} · diggy Kontaktformular
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildContactAutoReplyText(payload: ContactAutoReplyPayload): string {
  return [
    'diggy — Danke für deine Anfrage',
    '═'.repeat(32),
    '',
    `Hallo ${payload.name},`,
    '',
    'wir haben deine Anfrage über diggy erhalten und setzen uns zeitnah mit dir in Verbindung.',
    '',
    'Deine Nachricht:',
    '─'.repeat(32),
    payload.message,
    '',
    '─'.repeat(32),
    'Du musst nichts weiter tun. Falls du noch etwas ergänzen möchtest, antworte einfach auf diese E-Mail.',
    '',
    `Gesendet: ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
