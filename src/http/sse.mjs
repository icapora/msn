const HEARTBEAT_MS = 20000;

/**
 * Fan-out of server-sent events to every connected browser.
 *
 * A periodic comment frame keeps intermediaries from closing an idle stream;
 * EventSource reconnects on its own if one slips through.
 */
export class EventStream {
  #clients = new Set();
  #heartbeat;

  constructor() {
    this.#heartbeat = setInterval(() => this.#write(':\n\n'), HEARTBEAT_MS);
    this.#heartbeat.unref?.();
  }

  /**
   * Attach a response as a new subscriber.
   * @param {import('node:http').ServerResponse} res
   * @param {Array<{event: string, data: unknown}>} backlog Sent before streaming.
   */
  add(res, backlog = []) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    this.#clients.add(res);
    res.on('close', () => this.#clients.delete(res));
    for (const { event, data } of backlog) this.#sendTo(res, event, data);
  }

  /**
   * Broadcast one event to every subscriber.
   * @param {string} event
   * @param {unknown} data
   */
  broadcast(event, data) {
    for (const client of this.#clients) this.#sendTo(client, event, data);
  }

  /** @returns {number} Number of connected browsers. */
  get size() {
    return this.#clients.size;
  }

  /** Stop the heartbeat and drop every subscriber. */
  close() {
    clearInterval(this.#heartbeat);
    for (const client of this.#clients) client.end();
    this.#clients.clear();
  }

  #sendTo(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  #write(raw) {
    for (const client of this.#clients) client.write(raw);
  }
}
