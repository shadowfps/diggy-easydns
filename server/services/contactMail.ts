import nodemailer from 'nodemailer';
import { buildContactAutoReplyHtml, buildContactAutoReplyText, buildContactEmailHtml, buildContactEmailText } from './contactEmailTemplate.js';

export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
  /** Honeypot — soll leer bleiben */
  website?: string;
  /** Zweites Honeypot-Feld */
  company?: string;
}

export interface ContactMessageResult {
  sent: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 5000;
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

/** Verhindert E-Mail-Header-Injection in Display-Namen. */
export function sanitizeMailDisplayName(name: string): string {
  return name
    .replace(/[\r\n\0]/g, '')
    .replace(/[<>"\\]/g, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function sanitizeMailSubjectPart(value: string): string {
  return value.replace(/[\r\n\0]/g, '').slice(0, MAX_NAME_LENGTH);
}

let transporter: nodemailer.Transporter | undefined;

export function isContactMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function getContactTo(): string {
  return process.env.CONTACT_TO?.trim() || 'hallo@cavara.dev';
}

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    throw new Error('SMTP ist nicht konfiguriert.');
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    process.env.SMTP_SECURE === 'true' || (Number.isFinite(port) && port === 465);

  transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

export function validateContactInput(input: ContactMessageInput): ContactMessageInput {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const message = input.message.trim();

  if (CONTROL_CHARS.test(name) || CONTROL_CHARS.test(message)) {
    throw new Error('Bitte keine ungültigen Steuerzeichen verwenden.');
  }

  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new Error('Bitte einen gültigen Namen angeben.');
  }

  if (!email || !EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('Bitte eine gültige E-Mail-Adresse angeben.');
  }

  if (!message || message.length < 10) {
    throw new Error('Die Nachricht sollte mindestens 10 Zeichen lang sein.');
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Die Nachricht darf maximal ${MAX_MESSAGE_LENGTH} Zeichen lang sein.`);
  }

  return { name, email, message };
}

export async function sendContactMessage(input: ContactMessageInput): Promise<ContactMessageResult> {
  if (!isContactMailConfigured()) {
    throw new Error('Das Kontaktformular ist derzeit nicht eingerichtet (SMTP fehlt).');
  }

  const payload = validateContactInput(input);
  const to = getContactTo();
  const from =
    process.env.CONTACT_FROM?.trim() ||
    `"diggy Kontaktformular" <${process.env.SMTP_USER!.trim()}>`;
  const safeName = sanitizeMailDisplayName(payload.name);

  const mailer = getTransporter();

  await mailer.sendMail({
    from,
    to,
    replyTo: { name: safeName, address: payload.email },
    subject: `[diggy] Kontakt: ${sanitizeMailSubjectPart(payload.name)}`,
    text: buildContactEmailText(payload),
    html: buildContactEmailHtml(payload),
  });
  console.log(`[contact] Benachrichtigung gesendet an ${to}`);

  if (payload.email.toLowerCase() === to.toLowerCase()) {
    console.log(`[contact] Bestätigung übersprungen — Absender-Adresse ist identisch mit ${to}`);
    return { sent: true };
  }

  try {
    await mailer.sendMail({
      from,
      to: payload.email,
      replyTo: to,
      subject: 'Danke für deine Anfrage — diggy',
      text: buildContactAutoReplyText(payload),
      html: buildContactAutoReplyHtml(payload),
    });
    console.log(`[contact] Bestätigung gesendet an ${payload.email}`);
  } catch (autoReplyError) {
    const err = autoReplyError as Error;
    console.error(`[contact] Bestätigung an ${payload.email} fehlgeschlagen:`, err.message || autoReplyError);
  }

  return { sent: true };
}
