import { clientIp, env, json, sameOrigin } from './_lib/http';
import { limited } from './_lib/store';

export const config = { runtime: 'edge' };

interface Payload {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  website?: unknown;
  elapsed?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The contact form. Validates, filters bots (honeypot + minimum fill time),
 * rate-limits per IP, then delivers through whichever channels are set up:
 *   RESEND_API_KEY        → email to CONTACT_TO (default kavya.ugupta@gmail.com)
 *   CONTACT_WEBHOOK_URL   → JSON POST (e.g. an n8n workflow → Telegram/Sheets/…)
 * With neither configured it answers 503 and the page hands the message to
 * the visitor's mail app instead.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405, { allow: 'POST' });
  if (!sameOrigin(req)) return json({ ok: false, error: 'forbidden' }, 403);
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 12_000) return json({ ok: false, error: 'too-large' }, 413);

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }
  const name = String(body.name ?? '').trim().slice(0, 80);
  const email = String(body.email ?? '').trim().slice(0, 120);
  const message = String(body.message ?? '').trim().slice(0, 4000);
  // bots: honeypot filled or the form completed impossibly fast → pretend success
  if (String(body.website ?? '') !== '' || Number(body.elapsed ?? 0) < 2500) return json({ ok: true });
  if (name.length < 2 || !EMAIL_RE.test(email) || message.length < 10) return json({ ok: false, error: 'invalid' }, 422);

  if (await limited(`kg:contact:${clientIp(req)}`, 5, 600)) return json({ ok: false, error: 'rate-limited' }, 429);

  const resendKey = env('RESEND_API_KEY');
  const webhook = env('CONTACT_WEBHOOK_URL');
  if (!resendKey && !webhook) return json({ ok: false, error: 'not-configured' }, 503);

  const country = req.headers.get('x-vercel-ip-country') ?? undefined;
  const city = decodeURIComponent(req.headers.get('x-vercel-ip-city') ?? '') || undefined;
  const sent: boolean[] = [];

  if (resendKey) {
    const to = env('CONTACT_TO') ?? 'kavya.ugupta@gmail.com';
    const from = env('CONTACT_FROM') ?? 'Dragon Post <onboarding@resend.dev>';
    const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6">
      <h2 style="margin:0 0 8px">🐉 New message from ${esc(name)}</h2>
      <p style="margin:0 0 16px;color:#666">${esc(email)}${city || country ? ` · ${esc([city, country].filter(Boolean).join(', '))}` : ''}</p>
      <p style="white-space:pre-wrap;font-size:16px">${esc(message)}</p></div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `🐉 ${name} summoned you via kavyagupta`, html, text: `${message}\n\n— ${name} <${email}>` }),
    }).catch(() => null);
    sent.push(Boolean(res?.ok));
  }

  if (webhook) {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'kavya-gupta-site', name, email, message, city, country, at: new Date().toISOString() }),
    }).catch(() => null);
    sent.push(Boolean(res?.ok));
  }

  return sent.some(Boolean) ? json({ ok: true }) : json({ ok: false, error: 'delivery-failed' }, 502);
}
