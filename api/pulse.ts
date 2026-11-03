import { json } from './_lib/http';
import { pipeline } from './_lib/store';

export const config = { runtime: 'edge' };

/**
 * The HUD's "signal": where the visitor is reading from (Vercel's edge geo
 * headers — nothing is stored) and, if a Redis store is connected, the
 * running count of visits ("dragon sightings").
 */
export default async function handler(req: Request): Promise<Response> {
  const country = req.headers.get('x-vercel-ip-country') ?? undefined;
  const rawCity = req.headers.get('x-vercel-ip-city');
  const city = rawCity ? decodeURIComponent(rawCity) : undefined;
  let visitors: number | undefined;
  if (req.method === 'POST') {
    const r = await pipeline([['INCR', 'kg:sightings']]);
    if (r) visitors = Number(r[0]);
  }
  return json({ city, country, visitors, region: req.headers.get('x-vercel-id')?.split(':')[0] });
}
