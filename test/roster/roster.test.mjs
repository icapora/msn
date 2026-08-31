import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Roster } from '../../src/roster/roster.mjs';
import { STATUS } from '../../src/roster/status.mjs';

/**
 * Poll until `predicate` holds.
 *
 * A fixed sleep would be a coin toss: `node --test` runs files in parallel, and
 * spawning a process under that load takes well over any bound short enough to
 * keep the suite quick.
 *
 * @param {() => boolean} predicate
 * @param {number} [timeoutMs]
 */
async function until(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('condition never became true');
}

function makeConfig(overrides = {}) {
  const home = mkdtempSync(join(tmpdir(), 'msn-roster-'));
  return {
    home,
    config: {
      namesPath: join(home, 'names.json'),
      registryDir: join(home, 'sessions-that-do-not-exist'),
      registryPollMs: 10_000,
      cliPollMs: 10_000,
      cliOnlyPollMs: 10_000,
      cliTimeoutMs: 1000,
      claudeBin: join(home, 'no-such-binary'),
      ...overrides,
    },
  };
}

test('degrades to CLI-only, once, when the registry cannot be read', async () => {
  const { home, config } = makeConfig();
  const roster = new Roster(config);

  const reasons = [];
  roster.on('degraded', (reason) => reasons.push(reason));
  roster.on('error', () => {});

  roster.start();
  await until(() => reasons.length > 0);
  roster.stop();

  assert.equal(reasons.length, 1);
  assert.match(roster.snapshot().degraded, /sessions-that-do-not-exist/);
  rmSync(home, { recursive: true, force: true });
});

test('a missing claude binary is reported without taking the server down', async () => {
  const { home, config } = makeConfig();
  const roster = new Roster(config);

  const errors = [];
  roster.on('error', (error) => errors.push(error));
  roster.on('degraded', () => {});

  roster.start();
  await until(() => errors.length > 0);
  roster.stop();

  assert.ok(errors.length > 0);
  assert.deepEqual(roster.snapshot().sessions, []);
  rmSync(home, { recursive: true, force: true });
});

test('identifies a peer that is no longer running as offline, keeping its name', () => {
  const { home, config } = makeConfig();
  const roster = new Roster(config);

  const identity = roster.identify({ name: 'ghost', pid: 999_999 });

  assert.equal(identity.name, 'ghost');
  assert.equal(identity.status, STATUS.OFFLINE);
  rmSync(home, { recursive: true, force: true });
});

test('falls back to the working directory when nothing remembers a name', () => {
  const { home, config } = makeConfig();
  const roster = new Roster(config);

  const identity = roster.identifySender({
    sessionId: null,
    pid: 4242,
    cwd: '/path/to/demo-project',
  });

  assert.equal(identity.name, 'demo-project (4242)');
  rmSync(home, { recursive: true, force: true });
});
