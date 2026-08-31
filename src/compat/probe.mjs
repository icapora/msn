import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Extract a dotted version from arbitrary CLI output.
 * @param {string} output
 * @returns {string|null}
 */
export function parseVersion(output) {
  return /(\d+)\.(\d+)\.(\d+)/.exec(output)?.[0] ?? null;
}

/**
 * Compare two dotted versions.
 * @param {string} a
 * @param {string} b
 * @returns {number} Negative when a precedes b, zero when equal, positive otherwise.
 */
export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Check the installed Claude Code against the minimum this app supports.
 *
 * An unreadable or unparseable version is reported as unknown rather than as a
 * failure: the app still works, and refusing to start over a version string
 * would be a worse outcome than a warning. See docs/compatibility.md.
 *
 * @param {{bin?: string, minimum: string}} options
 * @returns {Promise<{version: string|null, ok: boolean, warning: string|null}>}
 */
export async function probeClaudeVersion({ bin = 'claude', minimum }) {
  let version = null;
  try {
    const { stdout } = await run(bin, ['--version'], { timeout: 10000 });
    version = parseVersion(stdout);
  } catch {
    return {
      version: null,
      ok: false,
      warning: `could not run \`${bin} --version\`; cross-session messaging may be unavailable`,
    };
  }

  if (version === null) {
    return { version: null, ok: false, warning: 'could not parse the Claude Code version' };
  }
  if (compareVersions(version, minimum) < 0) {
    return {
      version,
      ok: false,
      warning: `Claude Code ${version} is below the ${minimum} required for cross-session messaging`,
    };
  }
  return { version, ok: true, warning: null };
}
