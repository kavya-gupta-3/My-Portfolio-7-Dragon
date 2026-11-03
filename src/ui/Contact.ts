import { CONTACT } from '../data/content';
import { $, toast } from './dom';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ContactHooks {
  onSent: () => void;
  onSound: (kind: 'send' | 'error') => void;
}

/**
 * Copy-to-clipboard email + the contact form. The form posts to
 * /api/contact (a Vercel Edge Function). If the backend isn't configured
 * or reachable, it falls back to opening the visitor's mail app with the
 * message pre-filled — the message is never lost.
 */
export function initContact(hooks: ContactHooks) {
  const renderedAt = Date.now();
  const email = $<HTMLAnchorElement>('[data-email]');
  email?.addEventListener('click', () => {
    navigator.clipboard?.writeText(CONTACT.email).then(
      () => toast('Email copied — opening your mail app'),
      () => undefined,
    );
  });

  const form = $<HTMLFormElement>('#contact-form');
  const note = $('#cf-note');
  const status = $('#cf-status');
  if (!form) return;
  const set = (msg: string, error = false, state = 'Ready') => {
    if (note) {
      note.textContent = msg;
      note.classList.toggle('is-error', error);
    }
    if (status) status.textContent = state;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      website: String(data.get('website') ?? ''),
      elapsed: Date.now() - renderedAt,
    };
    if (payload.name.length < 2) return set('Tell me your name first.', true, 'Check this');
    if (!EMAIL_RE.test(payload.email)) return set('That email doesn’t look right.', true, 'Check this');
    if (payload.message.length < 10) return set('Say a little more — at least a sentence.', true, 'Check this');
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    set('Summoning the herald…', false, 'Sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        form.reset();
        set('Delivered. Crimson is carrying it to Kavya right now.', false, 'Sent');
        hooks.onSound('send');
        hooks.onSent();
        return;
      }
      if (res.status === 429) {
        set('Easy — the herald needs a minute. Try again shortly.', true, 'Cooling down');
        hooks.onSound('error');
        return;
      }
      throw new Error(json.error ?? `HTTP ${res.status}`);
    } catch {
      // backend not configured / offline → hand it to the mail app
      const subject = encodeURIComponent(`Hello from ${payload.name}`);
      const body = encodeURIComponent(`${payload.message}\n\n— ${payload.name} (${payload.email})`);
      window.location.href = `mailto:${CONTACT.email}?subject=${subject}&body=${body}`;
      set('Opening your mail app with your message ready to send.', false, 'Mail app');
      hooks.onSent();
    } finally {
      if (button) button.disabled = false;
    }
  });
}
