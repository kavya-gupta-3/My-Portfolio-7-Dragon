import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { personSchema, renderBody } from './src/render/page.ts';

/** Production origin, used for canonical + Open Graph URLs. */
function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'https://kavya-gupta.vercel.app';
}

/**
 * GLSL as real modules: `#include "./chunk.glsl"` is resolved at build time
 * (each file once per program), comments and blank lines are stripped in
 * production, and the result is exported as a string.
 */
function glsl(): Plugin {
  let minify = false;
  const strip = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
  return {
    name: 'kg:glsl',
    enforce: 'pre',
    configResolved(config) {
      minify = config.command === 'build';
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.glsl')) return null;
      const seen = new Set<string>([file]);
      const expand = (src: string, from: string): string =>
        src.replace(/^[ \t]*#include\s+"([^"]+)"[ \t]*$/gm, (_m, rel: string) => {
          const target = path.resolve(path.dirname(from), rel);
          if (seen.has(target)) return '';
          seen.add(target);
          this.addWatchFile(target);
          return expand(fs.readFileSync(target, 'utf8'), target);
        });
      let out = expand(code, file);
      if (minify) out = strip(out);
      return { code: `export default ${JSON.stringify(out)};`, map: null };
    },
  };
}

/** Injects the build-time rendered page (see src/render) into index.html. */
function page(): Plugin {
  return {
    name: 'kg:page',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const url = siteUrl();
        return html
          .replace('<!--app-->', renderBody(new Date()))
          .replace('%PERSON_SCHEMA%', personSchema(url).replace(/</g, '\\u003c'))
          .replaceAll('%SITE_URL%', url);
      },
    },
    generateBundle() {
      const url = siteUrl();
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`,
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Runs the Vercel functions in /api inside the Vite dev server, so
 * `npm run dev` serves the exact same backend that Vercel deploys.
 */
function vercelApi(): Plugin {
  return {
    name: 'kg:vercel-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
        const name = url.pathname.slice(5).replace(/\/$/, '');
        const file = path.resolve(server.config.root, 'api', `${name}.ts`);
        if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(file)) return next();
        try {
          const mod = await server.ssrLoadModule(file);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join(', '));
          }
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(url, {
            method: req.method,
            headers,
            body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
          });
          const response: Response = await mod.default(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.ssrFixStacktrace(error as Error);
          server.config.logger.error(`[api/${name}] ${(error as Error).stack ?? error}`);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'internal' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [glsl(), page(), vercelApi()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    assetsInlineLimit: 2048,
  },
  server: { host: true },
  preview: { host: true },
});
