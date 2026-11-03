import { env } from './http';

/**
 * Tiny Redis client over the Upstash REST API (also what Vercel's KV / Redis
 * marketplace integration exposes). Every call is optional: when no store is
 * configured the functions degrade instead of failing.
 */
const url = () => env('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL');
const token = () => env('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN');

export const hasStore = () => Boolean(url() && token());

export async function pipeline(commands: (string | number)[][]): Promise<unknown[] | null> {
  if (!hasStore()) return null;
  try {
    const res = await fetch(`${url()}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result: unknown }[];
    return out.map((r) => r.result);
  } catch {
    return null;
  }
}

const memory = new Map<string, { n: number; until: number }>();

/**
 * Fixed-window rate limit. Uses Redis when available, otherwise an
 * in-memory window (best effort: per warm instance).
 */
export async function limited(key: string, max: number, windowSec: number): Promise<boolean> {
  // SET NX starts the window with its TTL once; INCR keeps the TTL
  const r = await pipeline([
    ['SET', key, 0, 'EX', windowSec, 'NX'],
    ['INCR', key],
  ]);
  if (r) return Number(r[1]) > max;
  const now = Date.now();
  const slot = memory.get(key);
  if (!slot || slot.until < now) {
    memory.set(key, { n: 1, until: now + windowSec * 1000 });
    return false;
  }
  slot.n++;
  return slot.n > max;
}
