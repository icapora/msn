import { renameSync, statSync } from 'node:fs';

/**
 * Move the capture log aside once it passes a size, keeping one generation.
 *
 * The hook appends without ever pruning, and a busy day of Claude sessions is
 * measured in megabytes of message text. Rotation runs at startup rather than
 * on a timer: the hook holds no file handle between writes, so renaming the
 * file while sessions are running is safe, and the next append recreates it.
 *
 * @param {string} path Capture log path.
 * @param {number} maxBytes Size above which the log is rotated.
 * @returns {{rotated: boolean, to?: string, bytes?: number}}
 */
export function rotateIfLarge(path, maxBytes) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return { rotated: false };
  }
  if (size <= maxBytes) return { rotated: false };

  const target = `${path}.1`;
  try {
    renameSync(path, target);
    return { rotated: true, to: target, bytes: size };
  } catch {
    return { rotated: false };
  }
}
