import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Remembers what each session was called, so history outlives the session.
 *
 * A message logged months ago names a peer that may be long gone; without this
 * the buddy list can only show a raw pid.
 */
export class NameCache {
  #path;
  #byPid = new Map();
  #bySessionId = new Map();
  #dirty = false;

  /** @param {string} path File backing the cache. */
  constructor(path) {
    this.#path = path;
    this.#load();
  }

  #load() {
    let raw;
    try {
      raw = JSON.parse(readFileSync(this.#path, 'utf8'));
    } catch {
      return;
    }
    for (const entry of raw.entries ?? []) {
      if (Number.isInteger(entry.pid)) this.#byPid.set(entry.pid, entry);
      if (entry.sessionId) this.#bySessionId.set(entry.sessionId, entry);
    }
  }

  /**
   * Record what a session is currently called.
   * @param {{pid: number|null, sessionId: string|null, name: string|null, cwd: string|null}} session
   */
  remember(session) {
    if (session.name == null) return;
    const entry = {
      pid: session.pid ?? null,
      sessionId: session.sessionId ?? null,
      name: session.name,
      cwd: session.cwd ?? null,
      seenAt: Date.now(),
    };
    if (Number.isInteger(entry.pid)) this.#byPid.set(entry.pid, entry);
    if (entry.sessionId) this.#bySessionId.set(entry.sessionId, entry);
    this.#dirty = true;
  }

  /**
   * @param {number|null} pid
   * @returns {object|null}
   */
  byPid(pid) {
    return pid == null ? null : (this.#byPid.get(pid) ?? null);
  }

  /**
   * @param {string|null} sessionId
   * @returns {object|null}
   */
  bySessionId(sessionId) {
    return sessionId == null ? null : (this.#bySessionId.get(sessionId) ?? null);
  }

  /** Persist the cache when it has changed. */
  flush() {
    if (!this.#dirty) return;
    const entries = [...new Set([...this.#byPid.values(), ...this.#bySessionId.values()])];
    try {
      writeFileSync(this.#path, JSON.stringify({ v: 1, entries }, null, 2));
      this.#dirty = false;
    } catch {
      this.#dirty = false;
    }
  }
}
