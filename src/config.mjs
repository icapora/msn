import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

const home = homedir();

/**
 * Where Claude Code binds session inbox sockets.
 *
 * It prefers `/tmp/cc-socks`, but falls back to a private per-user directory
 * when it cannot accept that one — on a shared machine, for instance. Both are
 * probed because the CLI reports a pid, not a socket path; the on-disk registry
 * gives the real path when it is available. See docs/compatibility.md.
 */
function socketDirs() {
  const configured = process.env.MSN_SOCKET_DIR;
  if (configured) return [configured];

  const uid = typeof process.getuid === 'function' ? process.getuid() : userInfo().uid;
  return ['/tmp/cc-socks', `/tmp/cc-socks-${uid}`];
}

/**
 * Every tunable path and interval in one place.
 *
 * Environment overrides exist so the test suite can point the app at a
 * temporary directory without monkey-patching the filesystem.
 */
export const config = {
  port: Number.parseInt(process.env.MSN_PORT ?? '4646', 10),
  host: process.env.MSN_HOST ?? '127.0.0.1',

  logPath: process.env.MSN_LOG_PATH ?? join(home, '.claude', 'msn-log.jsonl'),
  namesPath: process.env.MSN_NAMES_PATH ?? join(home, '.claude', 'msn-names.json'),
  registryDir: process.env.MSN_REGISTRY_DIR ?? join(home, '.claude', 'sessions'),

  registryPollMs: Number.parseInt(process.env.MSN_REGISTRY_POLL_MS ?? '1000', 10),
  cliPollMs: Number.parseInt(process.env.MSN_CLI_POLL_MS ?? '30000', 10),
  cliOnlyPollMs: Number.parseInt(process.env.MSN_CLI_ONLY_POLL_MS ?? '5000', 10),
  cliTimeoutMs: 15000,

  historyLimit: Number.parseInt(process.env.MSN_HISTORY_LIMIT ?? '400', 10),
  historyPageSize: Number.parseInt(process.env.MSN_HISTORY_PAGE ?? '100', 10),
  logMaxBytes: Number.parseInt(process.env.MSN_LOG_MAX_BYTES ?? String(64 * 1024 * 1024), 10),

  socketDirs: socketDirs(),
  inboxPath: process.env.MSN_INBOX_PATH ?? `/tmp/cc-socks-msn/${process.pid}.sock`,
  selfName: process.env.MSN_SELF_NAME ?? 'MSN Web',

  sendEnabled: process.env.MSN_DISABLE_SEND !== '1',
  claudeBin: process.env.MSN_CLAUDE_BIN ?? 'claude',
  minimumClaudeVersion: '2.1.224',
  verifiedClaudeVersion: '2.1.251',
};
