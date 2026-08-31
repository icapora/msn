import { EventEmitter } from 'node:events';
import { connect, createServer } from 'node:net';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ENVELOPE = /<cross-session-message([^>]*)>\n?([\s\S]*?)\n?<\/cross-session-message>/;
const ATTRIBUTE = /(\S+)="([^"]*)"/g;

/**
 * Pull the sender and body out of a cross-session envelope.
 *
 * The envelope wraps the text in a tag whose attributes name the sender and
 * the permission class it claims. See docs/phase-2-sending.md.
 *
 * @param {string} content The `message.content` field of an inbound line.
 * @returns {{from: string|null, fromName: string|null, fromMode: string|null, text: string}|null}
 */
export function parseEnvelope(content) {
  if (typeof content !== 'string') return null;

  const match = ENVELOPE.exec(content);
  if (match === null) return { from: null, fromName: null, fromMode: null, text: content };

  const attributes = {};
  for (const [, key, value] of match[1].matchAll(ATTRIBUTE)) attributes[key] = value;

  return {
    from: attributes.from ?? null,
    fromName: attributes['from-name'] ?? null,
    fromMode: attributes['from-mode'] ?? null,
    text: match[2],
  };
}

/**
 * Turn one inbound line into a record shaped like the capture log's.
 *
 * @param {string} line Raw JSON line read from the socket.
 * @param {string} selfName Screen name this client answers to.
 * @returns {object|null}
 */
export function toRecord(line, selfName) {
  let payload;
  try {
    payload = JSON.parse(line);
  } catch {
    return null;
  }

  const envelope = parseEnvelope(payload?.message?.content);
  if (envelope === null) return null;

  const pid = Number.parseInt((envelope.from ?? '').split('/').pop() ?? '', 10);
  return {
    v: 1,
    ts: Date.now(),
    from: {
      sessionId: null,
      cwd: null,
      pid: Number.isInteger(pid) ? pid : null,
      name: envelope.fromName,
    },
    to: selfName,
    text: envelope.text,
    summary: null,
    notifyWhenIdle: false,
    structured: null,
    truncated: false,
    msgId: payload.msg_id ?? null,
    delivered: true,
    inbound: true,
    extra: {},
  };
}

/**
 * Whether anything is accepting connections on a socket path.
 *
 * This asks the question that actually matters. An earlier version asked
 * whether a process with the pid in the filename was alive, which is a proxy
 * for it and wrong in two ways: pids are reused, and a filename's pid means
 * nothing when the file was created in another pid namespace, as it is when a
 * directory is shared between a container and its host.
 *
 * Anything other than a refused connection is treated as alive, so a socket is
 * never removed on the strength of an error we did not expect.
 *
 * @param {string} path
 * @returns {Promise<boolean>}
 */
export function isListening(path) {
  return new Promise((resolvePromise) => {
    const socket = connect(path);
    let settled = false;

    const finish = (listening) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(listening);
    };

    socket.setTimeout(500, () => finish(true));
    socket.on('connect', () => finish(true));
    socket.on('error', (error) => finish(error.code !== 'ECONNREFUSED'));
  });
}

/**
 * Remove sockets in this application's own directory that nobody is listening on.
 *
 * A killed run leaves its socket file behind, and the file is named after a
 * process that no longer exists, so nothing would ever reclaim it.
 *
 * Two guards keep this from becoming destructive. The directory must not be one
 * Claude Code uses, because `MSN_INBOX_PATH` is configurable and pointing it at
 * the shared socket directory would otherwise sweep other sessions' inboxes on
 * every start. And each entry must actually be a socket, so an unrelated file
 * that happens to be named like one is left alone.
 *
 * @param {string} dir Directory holding this application's sockets.
 * @param {{protectedDirs?: Array<string>}} [options] Directories to refuse outright.
 * @returns {Promise<number>} How many were removed.
 */
export async function pruneStaleSockets(dir, { protectedDirs = [] } = {}) {
  const target = resolve(dir);
  if (protectedDirs.some((protectedDir) => resolve(protectedDir) === target)) return 0;

  let entries;
  try {
    entries = readdirSync(target);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.sock')) continue;
    const path = join(target, entry);

    try {
      if (!statSync(path).isSocket()) continue;
      if (await isListening(path)) continue;
      unlinkSync(path);
      removed += 1;
    } catch {
      /* gone already, or not ours to remove: either way, leave it */
    }
  }
  return removed;
}

/**
 * The address other sessions reply to.
 *
 * Binding this is what makes a reply deliverable: Claude copies the `from`
 * attribute of an incoming message into its own `to`, so without a socket of
 * our own a reply has nowhere to land.
 *
 * Arriving messages are usually redundant, because the sending session's own
 * hook already logged them. The exception is the one that matters: a session
 * started before the hook was installed logs nothing, and this is the only
 * place its replies can be observed. The server drops duplicates by `msgId`.
 *
 * @fires Inbox#message
 */
export class Inbox extends EventEmitter {
  #path;
  #selfName;
  #server = null;

  /**
   * @param {string} path Absolute socket path. Keep it short: the OS caps it near 104 bytes.
   * @param {string} selfName Screen name shown for messages addressed here.
   */
  constructor(path, selfName) {
    super();
    this.#path = path;
    this.#selfName = selfName;
  }

  /** @returns {string} The reply address to advertise to peers. */
  get address() {
    return `uds:${this.#path}`;
  }

  /** @returns {string} The bare socket path. */
  get path() {
    return this.#path;
  }

  /** @returns {boolean} Whether the socket is bound. */
  get listening() {
    return this.#server !== null;
  }

  /**
   * Bind the socket, clearing sockets left behind by runs that were killed.
   * @param {{protectedDirs?: Array<string>}} [options] Passed to the prune.
   * @returns {Promise<void>}
   */
  async start({ protectedDirs = [] } = {}) {
    const dir = dirname(this.#path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    await pruneStaleSockets(dir, { protectedDirs });
    if (existsSync(this.#path)) unlinkSync(this.#path);

    return new Promise((resolvePromise, reject) => {
      this.#server = createServer((connection) => {
        let buffer = '';
        connection.setEncoding('utf8');
        connection.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.trim() === '') continue;
            const record = toRecord(line, this.#selfName);
            if (record !== null) this.emit('message', record);
          }
        });
        connection.on('error', () => connection.destroy());
      });

      this.#server.on('error', (error) => {
        this.#server = null;
        reject(error);
      });
      this.#server.listen(this.#path, () => resolvePromise());
    });
  }

  /** Unbind and remove the socket file. */
  stop() {
    this.#server?.close();
    this.#server = null;
    try {
      unlinkSync(this.#path);
    } catch {
      /* already gone, which is the state we wanted */
    }
  }
}
