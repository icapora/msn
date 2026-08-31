import { EventEmitter } from 'node:events';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { parseLine } from './record.mjs';

const DEFAULT_INTERVAL_MS = 250;

/**
 * Follows the append-only capture log and emits every parsed message.
 *
 * It polls the file's size rather than subscribing to filesystem events. That
 * is a deliberate step down in machinery: the target is a single file that one
 * process appends to, which is the case watching libraries are least needed
 * for and, on macOS, least reliable at — events coalesce and appends go
 * unreported. A `statSync` every quarter second is one syscall, behaves the
 * same on every platform, and treats creation, append and truncation with the
 * same code path. See docs/architecture.md.
 *
 * @fires MessageTail#message
 * @fires MessageTail#error
 */
export class MessageTail extends EventEmitter {
  #path;
  #intervalMs;
  #offset = 0;
  #pending = '';
  #reading = false;
  #timer = null;

  /**
   * @param {string} path Absolute path to the capture log.
   * @param {number} [intervalMs] How often to check the file's size.
   */
  constructor(path, intervalMs = DEFAULT_INTERVAL_MS) {
    super();
    this.#path = path;
    this.#intervalMs = intervalMs;
  }

  /**
   * Read whatever the log already holds, then follow it.
   * @returns {Promise<void>}
   */
  async start() {
    await this.#drain();
    this.#timer = setInterval(() => this.#drain(), this.#intervalMs);
    this.#timer.unref?.();
  }

  /**
   * Stop following. Safe to call more than once.
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }

  async #drain() {
    if (this.#reading) return;
    this.#reading = true;
    try {
      await this.#readNewBytes();
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.#reading = false;
    }
  }

  async #readNewBytes() {
    if (!existsSync(this.#path)) return;

    const { size } = statSync(this.#path);
    if (size < this.#offset) {
      this.#offset = 0;
      this.#pending = '';
    }
    if (size === this.#offset) return;

    const stream = createReadStream(this.#path, {
      start: this.#offset,
      end: size - 1,
      encoding: 'utf8',
    });

    for await (const chunk of stream) {
      this.#pending += chunk;
      const lines = this.#pending.split('\n');
      this.#pending = lines.pop() ?? '';
      for (const line of lines) {
        const message = parseLine(line);
        if (message !== null) this.emit('message', message);
      }
    }
    this.#offset = size;
  }
}
