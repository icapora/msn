import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toStatus } from './status.mjs';

/**
 * Whether a process is still running.
 *
 * Signal 0 performs the permission and existence check without delivering
 * anything, which is how a stale registry file is told from a live session.
 * Non-positive pids are rejected first: POSIX reads those as process groups,
 * so `kill(0, 0)` would report the caller's own group as alive.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Validate one registry entry against the fields this app relies on.
 * @param {unknown} entry
 * @returns {boolean}
 */
export function isValidEntry(entry) {
  return (
    entry !== null &&
    typeof entry === 'object' &&
    typeof entry.sessionId === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.kind === 'string' &&
    Number.isInteger(entry.pid)
  );
}

/**
 * Read live sessions from Claude Code's on-disk session registry.
 *
 * This is an undocumented internal format, so a caller must treat a thrown
 * error or an empty result as a signal to fall back to the CLI source rather
 * than as "no sessions are running". See docs/compatibility.md.
 *
 * @param {string} dir Registry directory.
 * @returns {Array<object>} Normalised session descriptors.
 * @throws {Error} When the directory holds files but none are usable.
 */
export function readRegistry(dir) {
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  const sessions = [];
  let malformed = 0;

  for (const file of files) {
    let entry;
    try {
      entry = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch {
      malformed += 1;
      continue;
    }
    if (!isValidEntry(entry)) {
      malformed += 1;
      continue;
    }
    if (!isAlive(entry.pid)) continue;

    sessions.push({
      sessionId: entry.sessionId,
      pid: entry.pid,
      name: entry.name,
      cwd: entry.cwd ?? null,
      kind: entry.kind,
      startedAt: entry.startedAt ?? null,
      socketPath: entry.messagingSocketPath ?? null,
      status: toStatus(entry),
      source: 'registry',
    });
  }

  if (files.length > 0 && sessions.length === 0 && malformed === files.length) {
    throw new Error(
      `registry at ${dir} held ${malformed} entries but none matched the expected shape`,
    );
  }
  return sessions;
}
