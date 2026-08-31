import { EventEmitter } from 'node:events';
import { readCli } from './cli-source.mjs';
import { NameCache } from './name-cache.mjs';
import { readRegistry } from './registry-source.mjs';
import { STATUS } from './status.mjs';

/**
 * Keeps a live picture of which sessions exist and how to reach them.
 *
 * Two sources feed it. The registry is fast but internal; the CLI is slow but
 * documented and is the only source that reports background sessions. Each is
 * held separately and unioned on read, so the fast poll cannot erase what only
 * the slow poll knows.
 *
 * When the registry stops matching its expected shape the roster degrades to
 * CLI-only and says so once, rather than silently reporting that no sessions
 * are running. See docs/compatibility.md.
 *
 * @fires Roster#change
 * @fires Roster#degraded
 * @fires Roster#error
 */
export class Roster extends EventEmitter {
  #config;
  #names;
  #fromRegistry = new Map();
  #fromCli = new Map();
  #registryOk = true;
  #degradeReason = null;
  #timers = [];
  #cliRunning = false;

  /** @param {object} config The shared config object. */
  constructor(config) {
    super();
    this.#config = config;
    this.#names = new NameCache(config.namesPath);
  }

  /** Begin polling both sources. */
  start() {
    this.#pollRegistry();
    this.#pollCli();
    this.#timers = [
      setInterval(() => this.#pollRegistry(), this.#config.registryPollMs),
      setInterval(() => this.#pollCli(), this.#config.cliPollMs),
    ];
    for (const timer of this.#timers) timer.unref?.();
  }

  /** Stop polling and persist learned names. */
  stop() {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [];
    this.#names.flush();
  }

  /** @returns {{sessions: Array<object>, degraded: string|null}} */
  snapshot() {
    const merged = new Map(this.#fromCli);
    for (const [key, session] of this.#fromRegistry) {
      merged.set(key, { ...merged.get(key), ...session });
    }
    return { sessions: [...merged.values()], degraded: this.#degradeReason };
  }

  /**
   * Resolve a parsed log target to a currently running session.
   * @param {{name: string|null, pid: number|null}} target
   * @returns {object|null}
   */
  resolve(target) {
    if (target == null) return null;

    const sessions = this.snapshot().sessions;
    if (target.pid != null) {
      const byPid = sessions.find((session) => session.pid === target.pid);
      if (byPid) return byPid;
    }
    if (target.name != null) {
      const byName = sessions.find((session) => session.name === target.name);
      if (byName) return byName;
    }
    return null;
  }

  /**
   * Best-effort identity for a peer that may no longer be running.
   * @param {{name: string|null, pid: number|null}|null} target
   * @returns {{pid: number|null, name: string, cwd: string|null, status: string}}
   */
  identify(target) {
    const live = this.resolve(target);
    if (live) return live;

    const remembered = this.#names.byPid(target?.pid ?? null);
    return {
      pid: target?.pid ?? null,
      name: remembered?.name ?? target?.name ?? this.#fallbackName(target?.pid ?? null, null),
      cwd: remembered?.cwd ?? null,
      status: STATUS.OFFLINE,
    };
  }

  /**
   * Identity of a message's sender, which the log records by session id.
   * @param {{sessionId: string|null, pid: number|null, cwd: string|null}} from
   * @returns {{pid: number|null, name: string, cwd: string|null, status: string}}
   */
  identifySender(from) {
    const live = this.resolve({ name: null, pid: from.pid ?? null });
    if (live) return live;

    const remembered =
      this.#names.bySessionId(from.sessionId ?? null) ?? this.#names.byPid(from.pid ?? null);
    return {
      pid: from.pid ?? null,
      name: remembered?.name ?? this.#fallbackName(from.pid, from.cwd),
      cwd: remembered?.cwd ?? from.cwd ?? null,
      status: STATUS.OFFLINE,
    };
  }

  #fallbackName(pid, cwd) {
    const dir = cwd?.split('/').filter(Boolean).pop();
    if (dir) return `${dir} (${pid ?? '?'})`;
    return pid != null ? `session ${pid}` : 'unknown';
  }

  #pollRegistry() {
    if (!this.#registryOk) return;
    try {
      this.#store(this.#fromRegistry, readRegistry(this.#config.registryDir));
    } catch (error) {
      this.#degrade(error.message);
    }
  }

  async #pollCli() {
    if (this.#cliRunning) return;
    this.#cliRunning = true;
    try {
      const sessions = await readCli({
        bin: this.#config.claudeBin,
        timeoutMs: this.#config.cliTimeoutMs,
        socketDirs: this.#config.socketDirs,
      });
      this.#store(this.#fromCli, sessions);
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.#cliRunning = false;
    }
  }

  #degrade(reason) {
    this.#registryOk = false;
    this.#degradeReason = reason;
    this.#fromRegistry.clear();
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers = [setInterval(() => this.#pollCli(), this.#config.cliOnlyPollMs)];
    this.#timers[0].unref?.();
    this.emit('degraded', reason);
  }

  #store(target, sessions) {
    target.clear();
    for (const session of sessions) {
      const key = session.pid ?? session.sessionId;
      if (key == null) continue;
      target.set(key, session);
      this.#names.remember(session);
    }
    this.#names.flush();
    this.emit('change', this.snapshot());
  }
}
