import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Serve a file from the public directory, or report that it is not there.
 *
 * The resolved path is checked to stay inside the root so a crafted URL cannot
 * read arbitrary files, even though the server binds to loopback by default.
 *
 * @param {string} root Absolute path of the public directory.
 * @param {string} urlPath Request path.
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<boolean>} Whether a file was served.
 */
export async function serveStatic(root, urlPath, res) {
  const relative = urlPath === '/' ? '/index.html' : urlPath;
  const target = resolve(join(root, normalize(relative)));
  if (!target.startsWith(resolve(root))) return false;

  try {
    const info = await stat(target);
    if (!info.isFile()) return false;

    res.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream',
      'content-length': info.size,
      'cache-control': 'no-cache',
    });
    createReadStream(target).pipe(res);
    return true;
  } catch {
    return false;
  }
}
