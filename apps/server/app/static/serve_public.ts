import { statSync } from 'node:fs';
import { normalize, resolve, sep } from 'node:path';
import app from '@adonisjs/core/services/app';
import { type HttpContext } from '@adonisjs/core/http';

/** The folder holding the built front-end. Empty until the receiver and sender-web builds land. */
const PUBLIC_ROOT = app.makePath('public');

/** Files that must never be cached, so a new build is picked up straight away. */
const NO_CACHE_NAMES: ReadonlySet<string> = new Set(['index.html', 'sw.js']);

/** Resolves a URL path to an absolute file under public/, or null if it would escape the folder. */
function safePath(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const relative = normalize(decoded)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');
  const absolute = resolve(PUBLIC_ROOT, relative);
  if (absolute !== PUBLIC_ROOT && !absolute.startsWith(PUBLIC_ROOT + sep)) {
    return null;
  }
  return absolute;
}

function applyNoCache(ctx: HttpContext, filePath: string): void {
  const name = filePath.slice(filePath.lastIndexOf(sep) + 1);
  if (NO_CACHE_NAMES.has(name)) {
    ctx.response.header('cache-control', 'no-cache');
  }
}

/** True only when the path is an existing regular file; a directory or a stat error is false. */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built front-end from public/. An existing file is returned as-is; any other GET falls
 * back to index.html, so the single-page apps route on the client. index.html and sw.js are sent
 * with `no-cache`. public/ is empty until Phase 2, so until then every path returns 404.
 */
export function servePublic(ctx: HttpContext): void {
  const requested = safePath(ctx.request.url());
  if (requested !== null && requested !== PUBLIC_ROOT && isFile(requested)) {
    applyNoCache(ctx, requested);
    ctx.response.download(requested);
    return;
  }

  const indexPath = resolve(PUBLIC_ROOT, 'index.html');
  if (isFile(indexPath)) {
    ctx.response.header('cache-control', 'no-cache');
    ctx.response.download(indexPath);
    return;
  }

  ctx.response.status(404).send('Not found');
}
