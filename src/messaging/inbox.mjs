import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

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
   * Bind the socket, replacing a stale one left behind by an earlier run.
   * @returns {Promise<void>}
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
        if (existsSync(this.#path)) unlinkSync(this.#path);
      } catch (error) {
        reject(error);
        return;
      }

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
      this.#server.listen(this.#path, () => resolve());
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
