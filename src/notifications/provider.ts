import type { Notification } from '../generated/prisma/client';

export type Message = Pick<Notification, 'channel' | 'to' | 'body'>;

export interface Provider {
  send(n: Message): Promise<void>;
}

/**
 * No real provider configured for this channel — this just proves delivery would have happened.
 * The body carries sign-in links, so it is logged in development only.
 */
export const consoleProvider: Provider = {
  async send(n) {
    console.log(`[notify] ${n.channel} -> ${n.to}${process.env.NODE_ENV === 'development' ? `: ${n.body}` : ''}`);
  },
};

async function sendSms(n: Message) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: process.env.TWILIO_FROM_NUMBER!, To: n.to, Body: n.body }),
  });
  if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
}

async function sendEmail(n: Message) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: n.to, subject: 'Evergreen Property Care', text: n.body }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
}

const smsConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
const emailConfigured = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);

/**
 * Twilio (SMS) + Resend (email), gated per-channel on env presence — same
 * no-creds-falls-back-to-a-no-op shape as photos.ts's blob/local split.
 * Local dev and e2e have neither configured, so this is consoleProvider
 * there without anyone having to remember to pass it explicitly.
 */
export const defaultProvider: Provider = {
  async send(n) {
    if (n.channel === 'sms' && smsConfigured) return sendSms(n);
    if (n.channel === 'email' && emailConfigured) return sendEmail(n);
    // A silent no-op in production would drop sign-in links and outbox rows while looking like success.
    if (process.env.NODE_ENV === 'production') throw new Error(`No provider configured for channel "${n.channel}"`);
    return consoleProvider.send(n);
  },
};
