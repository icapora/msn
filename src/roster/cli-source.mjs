import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { toStatus } from './status.mjs';

const run = promisify(execFile);
const DEFAULT_SOCKET_DIRS = ['/tmp/cc-socks'];

/**
 * Locate a session's inbox socket by pid.
 *
 * The CLI reports a pid, never a path, and Claude Code uses a private per-user
 * directory when it cannot accept the shared one. Guessing a single directory
 * makes sending fail on exactly the machines that need the fallback, so each
 * candidate is probed and the first that exists wins.
 *
 * @param {number|null} pid
 * @param {Array<string>} dirs Candidate directories, most likely first.
 * @returns {string|null}
 */
export function findSocketPath(pid, dirs = DEFAULT_SOCKET_DIRS) {
  if (!Number.isInteger(pid)) return null;

  for (const dir of dirs) {
    const candidate = join(dir, `${pid}.sock`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Normalise one row of `claude agents --json`.
 *
 * Interactive rows carry `pid` and `status`; background rows carry `id` and
 * `state` instead. Both shapes are collapsed here so nothing downstream has to
 * know the difference.
 *
 * @param {object} row
 * @param {Array<string>} [dirs] Candidate socket directories.
 * @returns {object}
 */
export function normaliseRow(row, dirs = DEFAULT_SOCKET_DIRS) {
  return {
    sessionId: row.sessionId ?? null,
    pid: Number.isInteger(row.pid) ? row.pid : null,
    name: row.name ?? null,
    cwd: row.cwd ?? null,
    kind: row.kind ?? 'interactive',
    startedAt: row.startedAt ?? null,
    socketPath: findSocketPath(row.pid, dirs),
    status: toStatus(row),
    source: 'cli',
  };
}

/**
 * List active sessions using the documented CLI.
 *
 * This is the authoritative source: the app must remain fully functional on it
 * alone, with the registry acting only as a faster accelerator.
 *
 * @param {{bin?: string, timeoutMs?: number, socketDirs?: Array<string>}} [options]
 * @returns {Promise<Array<object>>}
 * @throws {Error} When the CLI is missing, times out, or emits non-JSON.
 */
export async function readCli({
  bin = 'claude',
  timeoutMs = 15000,
  socketDirs = DEFAULT_SOCKET_DIRS,
} = {}) {
  const { stdout } = await run(bin, ['agents', '--json'], {
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows)) {
    throw new Error('`claude agents --json` did not return an array');
  }
  return rows.map((row) => normaliseRow(row, socketDirs));
}
