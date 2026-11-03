import { env, json } from './_lib/http';

export const config = { runtime: 'edge' };

const USER = 'kavya-gupta-3';

interface Repo {
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
}

/**
 * Live GitHub numbers for the skills section, computed once and cached at the
 * edge for an hour (stale-while-revalidate for a day), so visitors never hit
 * GitHub's rate limits. GITHUB_TOKEN is optional.
 */
export default async function handler(): Promise<Response> {
  const token = env('GITHUB_TOKEN');
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'kavya-gupta-site' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${USER}`, { headers }),
      fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, { headers }),
    ]);
    if (!userRes.ok || !reposRes.ok) return json({ ok: false, error: 'upstream' }, 502, { 'cache-control': 'public, s-maxage=300' });
    const user = (await userRes.json()) as { public_repos: number; followers: number };
    const repos = ((await reposRes.json()) as Repo[]).filter((r) => !r.fork);
    const counts: Record<string, number> = {};
    let stars = 0;
    for (const r of repos) {
      stars += r.stargazers_count;
      if (r.language) counts[r.language] = (counts[r.language] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return json(
      {
        repos: user.public_repos,
        followers: user.followers,
        stars,
        updated: repos[0]?.pushed_at,
        languages: Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([name, n]) => ({ name, share: n / total })),
      },
      200,
      { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    );
  } catch {
    return json({ ok: false, error: 'unreachable' }, 502);
  }
}
