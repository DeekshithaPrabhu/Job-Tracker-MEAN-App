'use strict';

/**
 * Sends email through SMTP when SMTP_HOST is set (this uses the optional "nodemailer" package, which
 * `npm install` adds). Without SMTP the message is printed in the server console instead, which is
 * what you want while developing: copy the reset link from there.
 *
 * Settings: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (true for port 465), SMTP_USER, SMTP_PASS, MAIL_FROM
 */
let transport;

function getTransport() {
  if (transport !== undefined) return transport;
  transport = null;
  if (!process.env.SMTP_HOST) return transport;
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.warn('SMTP_HOST is set but the "nodemailer" package is missing. Run "npm install" in the backend folder.');
    return transport;
  }
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  return transport;
}

/** Returns { sent: true } after handing the message to SMTP, or { sent: false } when it was only logged. */
async function sendMail({ to, subject, text }) {
  const smtp = getTransport();
  if (!smtp) {
    console.log(`\n--- Email not sent (no SMTP configured) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n-------------------------------------------\n`);
    return { sent: false };
  }
  await smtp.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
  return { sent: true };
}

module.exports = { sendMail };
