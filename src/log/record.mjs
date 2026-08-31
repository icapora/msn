const SOCKET_PREFIX = 'uds:';

/**
 * A `to` value is either a session name or a reply address.
 *
 * Claude copies the `from=` attribute of an incoming message when it replies,
 * so roughly half of all real traffic addresses a socket path rather than a
 * name. See docs/log-format.md.
 *
 * @param {string|null} to
 * @returns {{kind: 'name'|'socket'|'unknown', name: string|null, pid: number|null}}
 */
export function parseTarget(to) {
  if (typeof to !== 'string' || to === '') {
    return { kind: 'unknown', name: null, pid: null };
  }
  if (!to.startsWith(SOCKET_PREFIX)) {
    return { kind: 'name', name: to, pid: null };
  }
  const file = to.slice(SOCKET_PREFIX.length).split('/').pop() ?? '';
  const pid = Number.parseInt(file, 10);
  return {
    kind: 'socket',
    name: null,
    pid: Number.isInteger(pid) ? pid : null,
  };
}

/**
 * Give a record the derived fields the rest of the pipeline expects.
 *
 * Two sources feed that pipeline — the capture log and the inbox socket — so
 * normalisation belongs to the record, not to either reader. A record that
 * skipped this step reaches the renderer without a parsed `target`.
 *
 * @param {object} record
 * @returns {object}
 */
export function normalize(record) {
  return {
    ...record,
    target: parseTarget(record.to ?? null),
    delivered: typeof record.delivered === 'boolean' ? record.delivered : null,
  };
}

/**
 * Parse one line of the capture log into a message, or null when unusable.
 *
 * Records carrying an unrecognised `v` are kept rather than discarded: a newer
 * hook must never make an older reader lose history.
 *
 * @param {string} line
 * @returns {object|null}
 */
export function parseLine(line) {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (record === null || typeof record !== 'object') return null;
  if (typeof record.ts !== 'number') return null;

  return normalize(record);
}

/**
 * Stable key for the conversation a message belongs to.
 *
 * Peers are keyed by pid when known, because pid is the only identifier that
 * survives both `to` forms and a later rename.
 *
 * @param {object} message
 * @param {(target: object) => number|null} resolvePid
 * @returns {string}
 */
export function conversationKey(message, resolvePid) {
  const fromKey = message.from?.pid != null ? `pid:${message.from.pid}` : 'unknown';
  const toPid = resolvePid(message.target);
  const toKey =
    toPid != null
      ? `pid:${toPid}`
      : message.target.name != null
        ? `name:${message.target.name}`
        : 'unknown';
  return [fromKey, toKey].sort().join('|');
}
