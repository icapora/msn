/**
 * The messages the server keeps in memory and hands to a browser.
 *
 * Messages average several kilobytes because Claude writes long ones, so an
 * unbounded array is both a memory leak and a slow first paint: every
 * connecting client would be sent the entire history at once. This keeps a
 * bounded window in memory and serves anything older from the log on demand.
 * See docs/architecture.md.
 */
export class History {
  #limit;
  #messages = [];
  #seen = new Set();
  #total = 0;
  #dropped = 0;

  /** @param {number} limit Most recent messages to keep resident. */
  constructor(limit) {
    this.#limit = limit;
  }

  /**
   * Add a message unless its id has already been recorded.
   *
   * Inbound socket messages and hook-captured ones describe the same delivery,
   * so the id is what keeps a reply from appearing twice.
   *
   * @param {object} message
   * @returns {boolean} Whether it was new.
   */
  add(message) {
    if (message.msgId != null) {
      if (this.#seen.has(message.msgId)) return false;
      this.#seen.add(message.msgId);
    }

    this.#messages.push(message);
    this.#total += 1;

    while (this.#messages.length > this.#limit) {
      this.#messages.shift();
      this.#dropped += 1;
    }
    return true;
  }

  /**
   * @param {number} [count] How many of the most recent to return.
   * @returns {Array<object>} Oldest first.
   */
  recent(count = this.#limit) {
    return this.#messages.slice(-count);
  }

  /**
   * Messages older than a timestamp, for paging backwards.
   * @param {number} before Epoch milliseconds, exclusive.
   * @param {number} [count]
   * @returns {Array<object>} Oldest first.
   */
  before(before, count = 100) {
    return this.#messages.filter((message) => message.ts < before).slice(-count);
  }

  /** @returns {number} Every message ever seen, including evicted ones. */
  get total() {
    return this.#total;
  }

  /** @returns {number} How many were evicted to stay within the limit. */
  get dropped() {
    return this.#dropped;
  }

  /** @returns {number} How many are resident. */
  get size() {
    return this.#messages.length;
  }
}
