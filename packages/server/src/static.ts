// Static file serving for the built web client. `npm run build` writes packages/web/dist.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export async function serveStatic(root: string, urlPath: string, res: ServerResponse): Promise<boolean> {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const target = join(root, relative === '/' ? 'index.html' : relative);
  if (!target.startsWith(root)) return false;
  try {
    const info = await stat(target);
    if (!info.isFile()) return false;
    res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(res);
    return true;
  } catch {
    // SPA fallback: unknown paths return index.html so client routing keeps working.
    try {
      const info = await stat(join(root, 'index.html'));
      if (!info.isFile()) return false;
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      createReadStream(join(root, 'index.html')).pipe(res);
      return true;
    } catch {
      return false;
    }
  }
}
