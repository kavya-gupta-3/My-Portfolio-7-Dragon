/**
 * The two hobby levels drawn in real 3D (see HobbyArt). These are their boxes,
 * and what stands in them on a device that can't do 3D at all.
 */

const ICONS: Record<string, string> = {
  pizza: `<path d="M8 16 Q32 3 56 16 L32 61Z" fill="#ffc94d"/><path d="M8 16 Q32 3 56 16 L53 23 Q32 11 11 23Z" fill="#e8893a"/><circle cx="26" cy="27" r="5" fill="#e5483a"/><circle cx="39" cy="31" r="4.5" fill="#e5483a"/><circle cx="31" cy="43" r="4" fill="#e5483a"/>`,
  donut: `<circle cx="32" cy="32" r="25" fill="#d98a4a"/><path d="M32 8C47 8 56 19 56 31 56 37 50 35 48 39 45 45 39 41 35 45 29 49 24 43 19 43 12 43 8 37 8 31 8 19 17 8 32 8Z" fill="#ff6fae"/><circle cx="32" cy="32" r="9" fill="#17131f"/>`,
  cone: `<path d="M19 30 32 62 45 30Z" fill="#e8a34f"/><circle cx="32" cy="19" r="15" fill="#ff8fc0"/><path d="M18 24C22 33 25 28 28 33 31 37 35 30 38 33 41 36 45 30 46 24Z" fill="#ff6fae"/>`,
};

export function foodArt() {
  const flat = Object.values(ICONS)
    .map((body) => `<svg viewBox="0 0 64 64">${body}</svg>`)
    .join('');
  return `<div class="hv hv-food" data-art="food" aria-hidden="true"><div class="hv-flat">${flat}</div></div>`;
}

export function mindArt() {
  const rings = Array.from({ length: 3 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  return `<div class="hv hv-imagination" data-art="mind" aria-hidden="true">
    <div class="hv-flat hvi-world">${rings}<b></b></div>
    <ul class="hvi-thoughts"><li>what if…</li><li>imagine if…</li><li>one day…</li><li>but then…</li></ul>
  </div>`;
}
